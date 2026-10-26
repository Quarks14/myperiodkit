"""Durable scheduled metrics sync.

Run `python manage.py sync_metrics_due` every minute from cron. The scheduler's
interval is read from the database on each tick, so changing it through the UI
does not require rewriting crontab or restarting Django. SQLite/other DBs use
an atomic conditional UPDATE to prevent simultaneous pulls.
"""
from datetime import timedelta
from uuid import uuid4

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from .models import MetricsSnapshot, MetricsSyncRun, MetricsSyncSchedule

LOCK_SECONDS = 180
MIN_INTERVAL = 1
MAX_INTERVAL = 1440


def schedule():
    row, _ = MetricsSyncSchedule.objects.get_or_create(pk=1)
    return row


def configure(*, interval_minutes, enabled, user):
    """Validated settings update. Does not change the once-per-minute OS tick."""
    if (isinstance(interval_minutes, bool) or not isinstance(interval_minutes, int)
            or not MIN_INTERVAL <= interval_minutes <= MAX_INTERVAL):
        raise ValueError('Interval must be a whole number between 1 and 1440 minutes.')
    if not isinstance(enabled, bool):
        raise ValueError('Enabled must be true or false.')
    now = timezone.now()
    with transaction.atomic():
        row = MetricsSyncSchedule.objects.select_for_update().get_or_create(pk=1)[0]
        changed = (row.interval_minutes != interval_minutes or row.enabled != enabled)
        previously_enabled = row.enabled
        changes = {
            'interval_minutes': interval_minutes,
            'enabled': enabled,
            'updated_by': user,
            'updated_at': now,
        }
        if changed:
            # Re-enabling makes the next cron tick due immediately. A change
            # while already enabled starts the newly selected interval now.
            changes['next_run_at'] = (
                now if enabled and not previously_enabled
                else now + timedelta(minutes=interval_minutes)
            )
        # Update only settings fields, never a potentially concurrent lock.
        MetricsSyncSchedule.objects.filter(pk=1).update(**changes)
    return MetricsSyncSchedule.objects.get(pk=1)


def due_sync(*, trigger='scheduled', force=False):
    """Run at most one upstream request when due. Returns result, never PII.

    Only one caller claims the job via a conditional UPDATE. A stale lock can be
    reclaimed, and the previous owner cannot replace a newer snapshot afterward.
    A failed pull preserves the last good snapshot.
    """
    from .service import UpstreamError, fetch_source

    if trigger not in ('scheduled', 'manual', 'bootstrap'):
        raise ValueError('Unsupported sync trigger.')
    row = schedule()
    now = timezone.now()
    if trigger == 'scheduled':
        MetricsSyncSchedule.objects.filter(pk=1).update(last_tick_at=now)
    token = uuid4()
    criteria = MetricsSyncSchedule.objects.filter(pk=row.pk).filter(
        Q(locked_until__isnull=True) | Q(locked_until__lte=now)
    )
    if not force:
        criteria = criteria.filter(enabled=True).filter(Q(next_run_at__isnull=True) | Q(next_run_at__lte=now))
    claimed = criteria.update(lock_token=token, locked_until=now + timedelta(seconds=LOCK_SECONDS),
                              last_attempt_at=now)
    if not claimed:
        return {'outcome': 'skipped', 'reason': 'not_due_or_already_running'}

    payload = None
    error = ''
    try:
        payload = fetch_source()
    except UpstreamError as exc:
        error = str(exc)[:200]
    except Exception:
        # Do not log source responses, credentials, addresses or personal data.
        error = 'Unexpected error retrieving metrics.'

    finished = timezone.now()
    with transaction.atomic():
        owner = MetricsSyncSchedule.objects.select_for_update().get(pk=1)
        if owner.lock_token != token:
            # A newer worker has reclaimed an expired lock. Never overwrite it.
            return {'outcome': 'skipped', 'reason': 'lock_expired'}
        if payload is not None:
            count = len(payload['users'])
            MetricsSnapshot.objects.update_or_create(
                pk=1, defaults={'payload': payload, 'fetched_at': finished, 'record_count': count}
            )
            owner.last_success_at = finished
            owner.last_error = ''
            outcome = 'succeeded'
        else:
            count = None
            owner.last_error = error or 'Metrics source is unavailable.'
            outcome = 'failed'
        owner.next_run_at = finished + timedelta(minutes=owner.interval_minutes)
        owner.lock_token = None
        owner.locked_until = None
        owner.save(update_fields=['last_success_at', 'last_error', 'next_run_at', 'lock_token', 'locked_until', 'updated_at'])
        MetricsSyncRun.objects.create(trigger=trigger, outcome=outcome, started_at=now,
                                      finished_at=finished, record_count=count,
                                      error=owner.last_error if outcome == 'failed' else '')
        # Keep operational history bounded; participant snapshots remain a single row.
        MetricsSyncRun.objects.filter(started_at__lt=finished - timedelta(days=30)).delete()
    return {'outcome': outcome, 'record_count': count, 'error': error}


def public_status(include_history=True):
    row = schedule()
    snap = MetricsSnapshot.objects.filter(pk=1).first()
    now = timezone.now()
    running = bool(row.lock_token and row.locked_until and row.locked_until > now)
    # A cron tick within the last 2.5 minutes means the OS job is active.
    cron_active = bool(row.last_tick_at and row.last_tick_at >= now - timedelta(seconds=150))
    history = []
    if include_history:
        history = [
            {'id': run.id, 'trigger': run.trigger, 'outcome': run.outcome,
             'started_at': run.started_at.isoformat(), 'finished_at': run.finished_at.isoformat(),
             'record_count': run.record_count, 'error': run.error}
            for run in MetricsSyncRun.objects.all()[:10]
        ]
    return {
        'enabled': row.enabled,
        'interval_minutes': row.interval_minutes,
        'next_run_at': row.next_run_at.isoformat() if row.next_run_at else None,
        'last_attempt_at': row.last_attempt_at.isoformat() if row.last_attempt_at else None,
        'last_success_at': row.last_success_at.isoformat() if row.last_success_at else None,
        'last_error': row.last_error,
        'last_tick_at': row.last_tick_at.isoformat() if row.last_tick_at else None,
        'cron_active': cron_active,
        'running': running,
        'snapshot_available': snap is not None,
        'record_count': snap.record_count if snap else None,
        'snapshot_at': snap.fetched_at.isoformat() if snap else None,
        'history': history,
    }
