"""Validated, shared cohort filters for My Period Kit metrics.

The upstream API currently provides *location*, not dedicated country/state
fields. Only positively identified locations are classified; everything else
remains unknown. All filtering happens in Django so aggregate-only roles never
receive participant-level records.
"""
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
import re

from rest_framework.exceptions import ValidationError

NOT_PROVIDED = 'Not provided'
ABROAD = 'Outside Nigeria (country unspecified)'
AGE_BANDS = ('Under 18', '18-24', '25-34', '35+', NOT_PROVIDED)
RECENCY_OPTIONS = ('Last 7 days', '8-30 days', 'Over 30 days', 'Never')
ONBOARDING_OPTIONS = ('Completed', 'Not completed', 'Not reported')
DATE_FIELDS = {'registered_at', 'last_interaction', 'first_chat', 'last_chat'}
MULTI_FIELDS = ('country', 'state', 'age_band', 'language')

# Deliberately conservative mappings. No reverse geocoding or user-specific
# coordinates; Abuja is FCT, not Nasarawa, and unknown names stay unknown.
CITY_TO_STATE = {
    'abuja': 'FCT', 'fct': 'FCT', 'federal capital territory': 'FCT',
    'lagos': 'Lagos', 'ikeja': 'Lagos',
    'kano': 'Kano', 'kano city': 'Kano',
    'ibadan': 'Oyo', 'oyo': 'Oyo',
    'kaduna': 'Kaduna', 'zaria': 'Kaduna',
    'bauchi': 'Bauchi',
    'ogun': 'Ogun', 'ogun state': 'Ogun', 'abeokuta': 'Ogun',
    'port harcourt': 'Rivers', 'rivers': 'Rivers', 'rivers state': 'Rivers',
    'enugu': 'Enugu', 'jos': 'Plateau', 'plateau': 'Plateau',
    'maiduguri': 'Borno', 'borno': 'Borno',
    'ilorin': 'Kwara', 'kwara': 'Kwara',
    'owerri': 'Imo', 'imo': 'Imo',
    'uyo': 'Akwa Ibom', 'akwa ibom': 'Akwa Ibom',
    'calabar': 'Cross River', 'cross river': 'Cross River',
    'sokoto': 'Sokoto', 'birnin kebbi': 'Kebbi', 'kebbi': 'Kebbi',
    'gusau': 'Zamfara', 'zamfara': 'Zamfara',
    'makurdi': 'Benue', 'benue': 'Benue',
    'osogbo': 'Osun', 'osun': 'Osun',
    'akure': 'Ondo', 'ondo': 'Ondo',
    'asaba': 'Delta', 'delta': 'Delta',
    'awka': 'Anambra', 'anambra': 'Anambra',
    'umuahia': 'Abia', 'abia': 'Abia',
    'yenagoa': 'Bayelsa', 'bayelsa': 'Bayelsa',
    'abakaliki': 'Ebonyi', 'ebonyi': 'Ebonyi',
    'ado ekiti': 'Ekiti', 'ekiti': 'Ekiti',
    'gombe': 'Gombe', 'jalingo': 'Taraba', 'taraba': 'Taraba',
    'yola': 'Adamawa', 'adamawa': 'Adamawa',
    'minna': 'Niger', 'niger state': 'Niger',
    'lafia': 'Nasarawa', 'nasarawa': 'Nasarawa',
    'lokoja': 'Kogi', 'kogi': 'Kogi',
    'dut se': 'Jigawa', 'dutse': 'Jigawa', 'jigawa': 'Jigawa',
    'katsina': 'Katsina',
}


# A state name is unambiguous when written in full, with or without 'State'.
for _state in set(CITY_TO_STATE.values()):
    CITY_TO_STATE.setdefault(_state.casefold(), _state)
    CITY_TO_STATE.setdefault((_state + ' State').casefold(), _state)


def _text(value):
    return value.strip().rstrip('.,; ').casefold() if isinstance(value, str) else ''


def safe_date(value):
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)


def user_location(user):
    location = user.get('location')
    return str(location).strip().rstrip('.,; ') if location is not None else ''


def user_country_state(user):
    """Use explicit source fields if provided, else match known Nigeria locations.

    A source value of `Abroad` does not identify a specific country. Unknown
    source text is never assumed to be Nigerian.
    """
    country = user.get('country')
    state = user.get('state')
    country = str(country).strip()[:80] if isinstance(country, str) else ''
    state = str(state).strip()[:80] if isinstance(state, str) else ''
    if country:
        return country, state or NOT_PROVIDED
    normalized = _text(user_location(user))
    if normalized in ('abroad', 'overseas', 'outside nigeria'):
        return ABROAD, NOT_PROVIDED
    found_state = CITY_TO_STATE.get(_text(state)) or CITY_TO_STATE.get(normalized)
    if found_state:
        return 'Nigeria', found_state
    return NOT_PROVIDED, NOT_PROVIDED


def user_age_band(user):
    age = user.get('age')
    if isinstance(age, bool) or not isinstance(age, (float, int)) or age < 0 or age > 120:
        return NOT_PROVIDED
    return 'Under 18' if age < 18 else '18-24' if age < 25 else '25-34' if age < 35 else '35+'


def user_language(user):
    value = user.get('preferred_language')
    return str(value).strip()[:80] if value is not None and str(value).strip() else NOT_PROVIDED


def user_onboarding(user):
    value = user.get('onboarding_completed')
    return 'Completed' if value is True else 'Not completed' if value is False else 'Not reported'


def user_recency(user, now=None):
    now = now or datetime.now(timezone.utc)
    last = safe_date(user.get('last_interaction'))
    if last is None or last > now:
        return 'Never'
    return 'Last 7 days' if last >= now - timedelta(days=7) else '8-30 days' if last >= now - timedelta(days=30) else 'Over 30 days'


@dataclass(frozen=True)
class CohortFilters:
    country: tuple = ()
    state: tuple = ()
    age_band: tuple = ()
    language: tuple = ()
    onboarding: str = ''
    recency: str = ''
    date_field: str = 'registered_at'
    date_from: date | None = None
    date_to: date | None = None

    @property
    def active(self):
        return bool(any(getattr(self, key) for key in MULTI_FIELDS) or self.onboarding or self.recency or self.date_from or self.date_to)

    def public(self):
        return {
            **{key: list(getattr(self, key)) for key in MULTI_FIELDS},
            'onboarding': self.onboarding, 'recency': self.recency,
            'date_field': self.date_field,
            'date_from': self.date_from.isoformat() if self.date_from else '',
            'date_to': self.date_to.isoformat() if self.date_to else '',
        }


def parse_filters(params):
    fields = {}
    for key in MULTI_FIELDS:
        values = params.getlist(key)
        if len(values) > 45 or any(not isinstance(v, str) or len(v) > 80 for v in values):
            raise ValidationError({key: 'Too many selections or an invalid filter value.'})
        fields[key] = tuple(dict.fromkeys(v.strip() for v in values if v.strip()))
    onboarding = params.get('onboarding', '')
    recency = params.get('recency', '')
    date_field = params.get('date_field', 'registered_at')
    if onboarding and onboarding not in ONBOARDING_OPTIONS:
        raise ValidationError({'onboarding': 'Unknown onboarding status.'})
    if recency and recency not in RECENCY_OPTIONS:
        raise ValidationError({'recency': 'Unknown activity period.'})
    if date_field not in DATE_FIELDS:
        raise ValidationError({'date_field': 'Unknown date type.'})
    for key in ('date_from', 'date_to'):
        raw = params.get(key, '').strip()
        if raw:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
                raise ValidationError({key: 'Use YYYY-MM-DD.'})
            try:
                fields[key] = date.fromisoformat(raw)
            except ValueError:
                raise ValidationError({key: 'Invalid date.'})
        else:
            fields[key] = None
    if fields['date_from'] and fields['date_to'] and fields['date_from'] > fields['date_to']:
        raise ValidationError({'date_to': 'End date must be on or after start date.'})
    return CohortFilters(**fields, onboarding=onboarding, recency=recency, date_field=date_field)


def matches(user, filters, now=None):
    if not isinstance(user, dict):
        return False
    country, state = user_country_state(user)
    if filters.country and country not in filters.country:
        return False
    if filters.state and state not in filters.state:
        return False
    if filters.age_band and user_age_band(user) not in filters.age_band:
        return False
    if filters.language and user_language(user) not in filters.language:
        return False
    if filters.onboarding and filters.onboarding != user_onboarding(user):
        return False
    if filters.recency and filters.recency != user_recency(user, now):
        return False
    if filters.date_from or filters.date_to:
        timestamp = safe_date(user.get(filters.date_field))
        if timestamp is None:
            return False
        day = timestamp.date()  # UTC calendar date, inclusive on both ends
        if filters.date_from and day < filters.date_from:
            return False
        if filters.date_to and day > filters.date_to:
            return False
    return True


def select_users(payload, filters, now=None):
    return [user for user in payload.get('users', []) if matches(user, filters, now)]


def filter_options(payload):
    users = [row for row in payload.get('users', []) if isinstance(row, dict)]
    countries = set()
    states = set()
    languages = set()
    for user in users:
        country, state = user_country_state(user)
        countries.add(country)
        states.add(state)
        languages.add(user_language(user))
    def sorted_options(values):
        return sorted(values, key=lambda v: (v == NOT_PROVIDED, v.casefold()))
    return {
        'country': sorted_options(countries),
        'state': sorted_options(states),
        'age_band': list(AGE_BANDS),
        'language': sorted_options(languages),
        'onboarding': list(ONBOARDING_OPTIONS),
        'recency': list(RECENCY_OPTIONS),
    }


def enrich_user(user):
    country, state = user_country_state(user)
    return {'country': country, 'state': state, 'age_band': user_age_band(user)}
