"""v0.3.6 scheduled sync permissions, concurrency, persistence and failure tests."""
from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.core.management import call_command
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .models import MetricsSnapshot, MetricsSyncRun, MetricsSyncSchedule
from .service import UpstreamError, get_source
from .sync import configure, due_sync, public_status, schedule

PAYLOAD = {
    'summary': {'registered': 2, 'onboarded': 1, 'users_chatting': 1, 'active_last_7d': 1},
    'users': [
        {'name': 'Example One', 'location': 'Lagos', 'age': 22, 'onboarding_completed': True, 'total_messages': 3},
        {'name': 'Example Two', 'location': 'Abuja', 'age': 25, 'onboarding_completed': False, 'total_messages': 0},
    ],
}


class MetricsCronTests(APITestCase):
    def setUp(self):
        for role in ('admin', 'analyst', 'viewer'):
            Group.objects.get_or_create(name=role)
        self.admin = User.objects.create_superuser('sync-admin', 'sync-admin@example.com', 'SafePassword123!')
        self.viewer = User.objects.create_user('sync-viewer', password='SafePassword123!')
        self.viewer.groups.add(Group.objects.get(name='viewer'))

    def login_as(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

    def test_default_schedule_and_no_credentials_in_status(self):
        status = public_status()
        self.assertEqual(status['interval_minutes'], 5)
        self.assertTrue(status['enabled'])
        self.assertFalse(status['snapshot_available'])
        self.assertNotIn('users', status)
        self.assertNotIn('METRICS_PASSWORD', str(status))

    @patch('metrics.service.fetch_source', return_value=PAYLOAD)
    def test_once_per_interval_and_persisted_snapshot(self, fetch):
        one = due_sync()
        self.assertEqual(one['outcome'], 'succeeded')
        self.assertEqual(due_sync()['outcome'], 'skipped')
        self.assertEqual(fetch.call_count, 1)
        self.assertEqual(MetricsSnapshot.objects.get(pk=1).record_count, 2)
        self.assertEqual(get_source(), PAYLOAD)
        self.assertEqual(fetch.call_count, 1)
        status = public_status()
        self.assertTrue(status['cron_active'])
        self.assertEqual(status['record_count'], 2)
        self.assertEqual(MetricsSyncRun.objects.count(), 1)
        MetricsSyncSchedule.objects.filter(pk=1).update(next_run_at=timezone.now() - timedelta(minutes=1))
        self.assertEqual(due_sync()['outcome'], 'succeeded')
        self.assertEqual(fetch.call_count, 2)

    @patch('metrics.service.fetch_source', return_value=PAYLOAD)
    def test_configure_new_interval_while_live_and_reenable(self, fetch):
        self.assertEqual(due_sync()['outcome'], 'succeeded')
        row = configure(interval_minutes=15, enabled=True, user=self.admin)
        self.assertEqual(row.interval_minutes, 15)
        self.assertGreater(row.next_run_at, timezone.now() + timedelta(minutes=14))
        configure(interval_minutes=15, enabled=False, user=self.admin)
        self.assertEqual(due_sync()['outcome'], 'skipped')
        row = configure(interval_minutes=15, enabled=True, user=self.admin)
        self.assertLessEqual(row.next_run_at, timezone.now())
        self.assertEqual(due_sync()['outcome'], 'succeeded')
        self.assertEqual(fetch.call_count, 2)

    @patch('metrics.service.fetch_source', return_value=PAYLOAD)
    def test_manual_during_lock_is_skipped(self, fetch):
        schedule()
        MetricsSyncSchedule.objects.filter(pk=1).update(
            locked_until=timezone.now() + timedelta(minutes=3), lock_token='12345678-1234-1234-1234-123456789012'
        )
        self.assertEqual(due_sync(trigger='manual', force=True)['outcome'], 'skipped')
        fetch.assert_not_called()

    @patch('metrics.service.fetch_source', side_effect=[PAYLOAD, UpstreamError('Metrics source is unavailable or rejected credentials')])
    def test_failure_keeps_previous_snapshot_and_records_error(self, fetch):
        self.assertEqual(due_sync()['outcome'], 'succeeded')
        result = due_sync(trigger='manual', force=True)
        self.assertEqual(result['outcome'], 'failed')
        self.assertEqual(get_source(), PAYLOAD)
        self.assertEqual(MetricsSnapshot.objects.get(pk=1).record_count, 2)
        self.assertEqual(MetricsSyncRun.objects.count(), 2)
        self.assertTrue(public_status()['last_error'])

    def test_invalid_settings_fail_closed(self):
        for bad in (True, 0, -1, 1.5, '5', 1441):
            with self.assertRaises(ValueError):
                configure(interval_minutes=bad, enabled=True, user=self.admin)
        with self.assertRaises(ValueError):
            configure(interval_minutes=5, enabled='false', user=self.admin)

    def test_only_admin_can_update_or_run(self):
        self.login_as(self.viewer)
        self.assertEqual(self.client.get('/api/metrics/sync/status/').status_code, 200)
        self.assertEqual(self.client.get('/api/metrics/sync/settings/').status_code, 403)
        self.assertEqual(self.client.patch('/api/metrics/sync/settings/',
            {'interval_minutes': 10, 'enabled': False}, format='json').status_code, 403)
        self.assertEqual(self.client.post('/api/metrics/sync/run/').status_code, 403)
        self.assertEqual(schedule().interval_minutes, 5)

    def test_admin_api_validates_interval_and_persists_change(self):
        self.login_as(self.admin)
        self.assertEqual(self.client.patch('/api/metrics/sync/settings/',
            {'interval_minutes': 0, 'enabled': True}, format='json').status_code, 400)
        self.assertEqual(self.client.patch('/api/metrics/sync/settings/',
            {'interval_minutes': '5', 'enabled': True}, format='json').status_code, 400)
        reply = self.client.patch('/api/metrics/sync/settings/',
            {'interval_minutes': 10, 'enabled': True}, format='json')
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(reply.data['interval_minutes'], 10)
        self.assertEqual(MetricsSyncSchedule.objects.get(pk=1).updated_by, self.admin)

    @patch('metrics.service.fetch_source', return_value=PAYLOAD)
    def test_admin_run_now_and_overview_share_persisted_data(self, fetch):
        self.login_as(self.admin)
        result = self.client.post('/api/metrics/sync/run/')
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.data['sync']['record_count'], 2)
        response = self.client.get('/api/metrics/overview/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['registered'], 2)
        self.assertEqual(response.data['updated_at'], MetricsSnapshot.objects.get(pk=1).fetched_at.isoformat())
        self.assertEqual(fetch.call_count, 1)

    @patch('metrics.service.fetch_source', return_value=PAYLOAD)
    def test_management_command_due_check(self, fetch):
        call_command('sync_metrics_due', verbosity=0)
        self.assertEqual(fetch.call_count, 1)
        call_command('sync_metrics_due', verbosity=0)
        self.assertEqual(fetch.call_count, 1)
