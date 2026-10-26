"""One retained metrics snapshot and an adjustable scheduled-pull configuration.

The snapshot contains upstream participant data. Protect database access and backups;
never expose the snapshot through an administrative settings endpoint.
"""
from django.conf import settings
from django.db import models


class MetricsSnapshot(models.Model):
    """Only the last successful upstream response is retained (singleton PK=1)."""

    payload = models.JSONField()
    fetched_at = models.DateTimeField()
    record_count = models.PositiveIntegerField(default=0)


class MetricsSyncSchedule(models.Model):
    """Singleton PK=1. The OS job ticks every minute; this controls due times."""

    enabled = models.BooleanField(default=True)
    interval_minutes = models.PositiveSmallIntegerField(default=5)
    next_run_at = models.DateTimeField(null=True, blank=True)
    locked_until = models.DateTimeField(null=True, blank=True)
    lock_token = models.UUIDField(null=True, blank=True)
    last_tick_at = models.DateTimeField(null=True, blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.CharField(max_length=200, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='+')


class MetricsSyncRun(models.Model):
    trigger = models.CharField(max_length=16)  # scheduled, manual, bootstrap
    outcome = models.CharField(max_length=16)  # succeeded, failed
    started_at = models.DateTimeField()
    finished_at = models.DateTimeField()
    record_count = models.PositiveIntegerField(null=True, blank=True)
    error = models.CharField(max_length=200, blank=True, default='')

    class Meta:
        ordering = ('-started_at', '-id')
