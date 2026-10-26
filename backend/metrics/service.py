"""Fetch My Period Kit metrics from the allowlisted upstream server.

The source's own summary is authoritative. Derived indicators use only
fields actually supplied in its user records and describe their denominator.
"""
import csv
import io
import os
from collections import Counter
from datetime import datetime, timedelta, timezone
from urllib.parse import urlparse

import requests
from django.core.exceptions import ImproperlyConfigured
from requests.auth import HTTPBasicAuth
from .filters import CohortFilters, filter_options, select_users, safe_date, user_country_state

MAX_CSV_BYTES = 10 * 1024 * 1024


class UpstreamError(Exception):
    pass


def parse_date(value):
    if not value or not isinstance(value, str):
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return result if result.tzinfo else result.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def source_settings():
    url = os.getenv('METRICS_URL', 'http://185.216.75.119:8000/api/admin/user-metrics')
    parsed = urlparse(url)
    if (
        parsed.scheme not in ('http', 'https')
        or parsed.hostname not in ('185.216.75.119', 'localhost', '127.0.0.1')
        or parsed.path != '/api/admin/user-metrics'
        or parsed.username or parsed.password or parsed.fragment or parsed.query
    ):
        raise ImproperlyConfigured('METRICS_URL must be the approved metrics endpoint')
    username = os.getenv('METRICS_USERNAME')
    password = os.getenv('METRICS_PASSWORD')
    if not username or not password:
        raise UpstreamError('Metrics source credentials are not configured')
    try:
        timeout = float(os.getenv('METRICS_TIMEOUT_SECONDS', '12'))
        if not 0 < timeout <= 60:
            raise ValueError
    except ValueError as exc:
        raise ImproperlyConfigured('Invalid metrics timeout') from exc
    return url, HTTPBasicAuth(username, password), timeout


def fetch_source():
    """Fetch and validate the upstream JSON without exposing authentication data."""
    url, auth, timeout = source_settings()
    try:
        response = requests.get(url, auth=auth, headers={'Accept': 'application/json'}, timeout=timeout)
        response.raise_for_status()
        payload = response.json()
    except (requests.RequestException, ValueError) as exc:
        raise UpstreamError('Metrics source is unavailable or rejected credentials') from exc
    if (
        not isinstance(payload, dict)
        or not isinstance(payload.get('summary'), dict)
        or not isinstance(payload.get('users'), list)
        or any(not isinstance(item, dict) for item in payload['users'])
    ):
        raise UpstreamError('Metrics source returned an unexpected response')
    return payload


def get_source(force=False):
    """Read the last successful database snapshot shared with the cron process.

    Only a manual refresh, a scheduled job, or first-use bootstrap makes an
    upstream request. On sync failure the previous snapshot remains available.
    """
    from .models import MetricsSnapshot
    from .sync import due_sync
    result = None
    if force:
        result = due_sync(trigger='manual', force=True)
    saved = MetricsSnapshot.objects.filter(pk=1).first()
    if saved is None and not force:
        result = due_sync(trigger='bootstrap', force=True)
        saved = MetricsSnapshot.objects.filter(pk=1).first()
    if saved is not None:
        return saved.payload
    if result and result.get('outcome') == 'skipped':
        raise UpstreamError('Metrics sync is already running. Try again shortly.')
    raise UpstreamError('Metrics source is unavailable and no saved snapshot is available.')


def safe_csv_cell(value):
    """Neutralise formula execution when an exported CSV is opened in Excel."""
    if value.lstrip().startswith(('=', '+', '-', '@')):
        return "'" + value
    return value


def get_source_csv():
    """Retrieve upstream ?format=csv, inspect and safely re-encode its CSV.

    No credentials or source URLs are ever included in the downloaded file.
    Does not use the cached JSON (the upstream CSV may contain more columns).
    """
    url, auth, timeout = source_settings()
    try:
        response = requests.get(
            url,
            params={'format': 'csv'},
            auth=auth,
            headers={'Accept': 'text/csv'},
            timeout=timeout,
            stream=True,
        )
        try:
            response.raise_for_status()
            content_type = response.headers.get('Content-Type', '').lower()
            if 'json' in content_type or 'html' in content_type:
                raise UpstreamError('Metrics source did not return a CSV file')
            data = bytearray()
            for chunk in response.iter_content(chunk_size=65536):
                data.extend(chunk)
                if len(data) > MAX_CSV_BYTES:
                    raise UpstreamError('Metrics CSV exceeds the 10 MB download limit')
        finally:
            response.close()
    except requests.RequestException as exc:
        raise UpstreamError('Metrics CSV is unavailable or credentials were rejected') from exc
    try:
        raw = bytes(data).decode('utf-8-sig')
        if not raw.strip() or '\x00' in raw:
            raise ValueError('Empty or invalid CSV')
        records = list(csv.reader(io.StringIO(raw, newline=''), strict=True))
        if not records or not any(row for row in records):
            raise ValueError('No CSV rows')
        output = io.StringIO(newline='')
        writer = csv.writer(output)
        for row in records:
            writer.writerow([safe_csv_cell(value) for value in row])
        return ('\ufeff' + output.getvalue()).encode('utf-8'), max(len(records) - 1, 0)
    except (UnicodeError, csv.Error, ValueError) as exc:
        raise UpstreamError('Metrics source returned malformed CSV') from exc


def _number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not 0 <= value < 10**12:
        return None
    return value


def _location(value):
    name = str(value).strip().rstrip('.,; ') if value is not None else ''
    if not name:
        return 'Not provided'
    known = {
        'abuja': 'Abuja', 'lagos': 'Lagos', 'kano': 'Kano',
        'ibadan': 'Ibadan', 'kaduna': 'Kaduna', 'bauchi': 'Bauchi',
        'ogun state': 'Ogun State', 'abroad': 'Abroad',
    }
    return known.get(name.casefold(), name)


def _pairs(counter):
    return [{'name': name, 'value': count} for name, count in counter.most_common()]


def summarize(payload, filters=None):
    filters = filters or CohortFilters()
    all_users = [item for item in payload['users'] if isinstance(item, dict)]
    now = datetime.now(timezone.utc)
    users = select_users(payload, filters, now) if filters.active else all_users
    raw = payload['summary']
    summary = {key: int(_number(raw.get(key)) or 0) for key in (
        'registered', 'onboarded', 'users_chatting', 'active_last_7d',
    )}
    if filters.active:
        # The upstream summary has no geography/age/date breakdown. Filtered
        # totals therefore come only from matching user records, not from the
        # unfiltered source snapshot. Never reuse source-wide figures here.
        summary['registered'] = len(users)
        summary['onboarded'] = sum(user.get('onboarding_completed') is True for user in users)
        summary['users_chatting'] = sum((_number(user.get('total_messages')) or 0) > 0 for user in users)
        summary['active_last_7d'] = sum(
            (timestamp is not None and now - timedelta(days=7) <= timestamp <= now)
            for user in users
            for timestamp in [safe_date(user.get('last_interaction'))]
        )
    registered = summary['registered']
    seven_days = now - timedelta(days=7)
    thirty_days = now - timedelta(days=30)

    locations = Counter()
    states = Counter()
    countries = Counter()
    languages = Counter()
    onboarding = Counter()
    ages = Counter()
    registrations = Counter()
    activity = Counter()
    message_bands = Counter({key: 0 for key in ('0', '1-9', '10-49', '50+', 'Not reported')})
    response_bands = Counter({key: 0 for key in ('Under 2s', '2-5s', 'Over 5s', 'Not reported')})
    recency = Counter({key: 0 for key in ('Last 7 days', '8-30 days', 'Over 30 days', 'Never')})
    total_messages = 0
    messages_last_7d = 0
    messaging_last_7d = 0
    response_total = 0
    response_n = 0
    known_ages = []
    missing_locations = 0
    missing_languages = 0

    for user in users:
        location = _location(user.get('location'))
        locations[location] += 1
        country, state_name = user_country_state(user)
        states[state_name] += 1
        countries[country] += 1
        missing_locations += int(location == 'Not provided')
        language = str(user.get('preferred_language') or '').strip() or 'Not provided'
        languages[language] += 1
        missing_languages += int(language == 'Not provided')
        state = user.get('onboarding_completed')
        onboarding['Completed' if state is True else 'Not completed' if state is False else 'Not reported'] += 1

        age = _number(user.get('age'))
        if age is not None and 0 <= age <= 120:
            known_ages.append(age)
            ages['Under 18' if age < 18 else '18-24' if age < 25 else '25-34' if age < 35 else '35+'] += 1
        else:
            ages['Not provided'] += 1

        registered_at = parse_date(user.get('registered_at'))
        if registered_at:
            registrations[registered_at.strftime('%Y-%m')] += 1
        last_chat = parse_date(user.get('last_chat'))
        if last_chat:
            activity[last_chat.strftime('%Y-%m')] += 1
        last_interaction = parse_date(user.get('last_interaction'))
        if last_interaction is None:
            recency['Never'] += 1
        elif seven_days <= last_interaction <= now:
            recency['Last 7 days'] += 1
        elif thirty_days <= last_interaction <= now:
            recency['8-30 days'] += 1
        elif last_interaction <= now:
            recency['Over 30 days'] += 1
        else:
            recency['Never'] += 1  # future/invalid source dates are not recent activity

        messages = _number(user.get('total_messages'))
        if messages is None:
            message_bands['Not reported'] += 1
        else:
            total_messages += messages
            message_bands['0' if messages == 0 else '1-9' if messages < 10 else '10-49' if messages < 50 else '50+'] += 1
        recent = _number(user.get('messages_last_7d')) or 0
        messages_last_7d += recent
        if recent > 0:
            messaging_last_7d += 1
        response = _number(user.get('avg_response_ms'))
        if response is None:
            response_bands['Not reported'] += 1
        else:
            response_total += response
            response_n += 1
            response_bands['Under 2s' if response < 2000 else '2-5s' if response <= 5000 else 'Over 5s'] += 1

    def rate(numerator, denominator):
        return round(100 * numerator / denominator, 1) if denominator else None

    return {
        'summary': summary,
        'derived': {
            'total_messages': total_messages,
            'avg_response_ms': round(response_total / response_n) if response_n else None,
            'onboarding_rate': rate(summary['onboarded'], registered),
            'user_rows': len(users),
            'messages_last_7d': messages_last_7d,
            'messaging_users_last_7d': messaging_last_7d,
            'chatting_rate': rate(summary['users_chatting'], registered),
            'active_rate': rate(summary['active_last_7d'], registered),
            'messages_per_chatting_user': round(total_messages / summary['users_chatting'], 1) if summary['users_chatting'] else None,
            'mean_age': round(sum(known_ages) / len(known_ages), 1) if known_ages else None,
            'age_reported': len(known_ages),
            'response_time_reported': response_n,
            'states_reported': sum(count for state, count in states.items() if state != 'Not provided'),
            'missing_location': missing_locations,
            'missing_language': missing_languages,
        },
        'charts': {
            'locations': _pairs(locations),
            'states': _pairs(states),
            'countries': _pairs(countries),
            'languages': _pairs(languages),
            'onboarding': _pairs(onboarding),
            'ages': _pairs(ages),
            'registrations': [{'month': month, 'count': count} for month, count in sorted(registrations.items())],
            'last_chats': [{'month': month, 'count': count} for month, count in sorted(activity.items())],
            'message_bands': _pairs(message_bands),
            'response_bands': _pairs(response_bands),
            'interaction_recency': _pairs(recency),
        },
        'updated_at': now.isoformat(),
        'source': 'live',
        'filters': {
            'active': filters.active,
            'applied': filters.public(),
            'options': filter_options(payload),
            'total_source_records': len(all_users),
            'matched_records': len(users),
            'basis': 'matching_user_records' if filters.active else 'upstream_summary',
        },
    }
