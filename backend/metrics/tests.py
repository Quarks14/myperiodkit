from unittest.mock import patch
from django.contrib.auth.models import User,Group
from rest_framework.test import APITestCase
from rest_framework.authtoken.models import Token
from .service import summarize
SAMPLE={'summary':{'registered':26,'onboarded':16,'users_chatting':18,'active_last_7d':16},'users':[{'location':'Lagos','total_messages':42,'age':20,'onboarding_completed':True,'registered_at':'2026-09-01T10:15:00+00:00'}]}
class MetricsTests(APITestCase):
 def setUp(self):
  for role in ('viewer','analyst','admin'):Group.objects.get_or_create(name=role)
  self.user=User.objects.create_user('viewer',password='SafePassword123!');self.user.groups.add(Group.objects.get(name='viewer'))
  self.client.credentials(HTTP_AUTHORIZATION='Token '+Token.objects.create(user=self.user).key)
 @patch('metrics.views.get_source',return_value=SAMPLE)
 def test_dashboard_allowed(self,upstream):
  r=self.client.get('/api/metrics/overview/');self.assertEqual(r.status_code,200);self.assertEqual(r.data['summary']['registered'],26)
 @patch('metrics.views.get_source',return_value=SAMPLE)
 def test_personal_rows_forbidden(self,upstream):self.assertEqual(self.client.get('/api/metrics/users/').status_code,403)
 def test_summary(self):self.assertEqual(summarize(SAMPLE)['derived']['total_messages'],42)
 def test_unauthenticated_forbidden(self):
  self.client.credentials();self.assertEqual(self.client.get('/api/metrics/overview/').status_code,401)


class ExtendedAnalyticsTests(APITestCase):
    def test_engagement_and_quality_from_source_fields(self):
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        result = summarize({
            'summary': {'registered': 3, 'onboarded': 2, 'users_chatting': 2, 'active_last_7d': 1},
            'users': [
                {'location': 'Abuja.', 'age': 22, 'preferred_language': 'en',
                 'onboarding_completed': True, 'total_messages': 15,
                 'messages_last_7d': 6, 'avg_response_ms': 1500,
                 'last_interaction': now},
                {'location': 'Abuja', 'age': None, 'total_messages': 0,
                 'messages_last_7d': None, 'avg_response_ms': None},
                {'location': 'Lagos', 'age': 35, 'total_messages': 55,
                 'messages_last_7d': 4, 'avg_response_ms': 4500},
            ],
        })
        self.assertEqual(result['derived']['messages_last_7d'], 10)
        self.assertEqual(result['derived']['messaging_users_last_7d'], 2)
        self.assertEqual(result['derived']['chatting_rate'], 66.7)
        self.assertEqual(result['derived']['active_rate'], 33.3)
        self.assertEqual(result['derived']['avg_response_ms'], 3000)
        self.assertEqual(result['derived']['response_time_reported'], 2)
        self.assertEqual(result['derived']['age_reported'], 2)
        self.assertEqual(result['derived']['missing_language'], 2)
        self.assertEqual(result['charts']['locations'][0], {'name': 'Abuja', 'value': 2})
        self.assertEqual(sum(point['value'] for point in result['charts']['message_bands']), 3)
        self.assertEqual(sum(point['value'] for point in result['charts']['interaction_recency']), 3)

    def test_zero_denominator_is_missing_not_misleading(self):
        result = summarize({'summary': {'registered': 0}, 'users': []})
        self.assertIsNone(result['derived']['active_rate'])
        self.assertIsNone(result['derived']['onboarding_rate'])
        self.assertIsNone(result['derived']['avg_response_ms'])


class CsvDownloadPermissionsTests(APITestCase):
    def setUp(self):
        for group in ('admin', 'analyst', 'viewer'):
            Group.objects.get_or_create(name=group)
        self.admin = User.objects.create_superuser('exportadmin', 'admin@example.org', 'SafePassword123!')
        self.analyst = User.objects.create_user('exportanalyst', password='SafePassword123!')
        self.analyst.groups.add(Group.objects.get(name='analyst'))
        self.viewer = User.objects.create_user('exportviewer', password='SafePassword123!')
        self.viewer.groups.add(Group.objects.get(name='viewer'))

    def auth_as(self, user):
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=user).key)

    @patch('metrics.views.get_source_csv', return_value=(b'Name,Phone\r\nAda,0801\r\n', 1))
    def test_admin_download_and_audit(self, source_csv):
        from accounts.models import AccessAuditEvent
        self.auth_as(self.admin)
        response = self.client.get('/api/metrics/export/records/')
        self.assertEqual(response.status_code, 200)
        self.assertIn('text/csv', response['Content-Type'])
        self.assertIn('attachment', response['Content-Disposition'])
        self.assertIn(b'Ada', response.content)
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(AccessAuditEvent.objects.filter(action='metrics.records_exported').count(), 1)
        source_csv.assert_called_once_with()

    @patch('metrics.views.get_source_csv')
    def test_analyst_and_viewer_cannot_download_identifiable_csv(self, source_csv):
        for user in (self.analyst, self.viewer):
            self.auth_as(user)
            self.assertEqual(self.client.get('/api/metrics/export/records/').status_code, 403)
        source_csv.assert_not_called()

    def test_anonymous_cannot_download(self):
        self.assertEqual(self.client.get('/api/metrics/export/records/').status_code, 401)

    @patch('metrics.views.get_source_csv', side_effect=__import__('metrics.service', fromlist=['UpstreamError']).UpstreamError('Unreachable'))
    def test_failure_does_not_generate_file(self, source_csv):
        from accounts.models import AccessAuditEvent
        self.auth_as(self.admin)
        response = self.client.get('/api/metrics/export/records/')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(AccessAuditEvent.objects.filter(action='metrics.records_exported').count(), 0)

    @patch('metrics.views.get_source', return_value=SAMPLE)
    def test_analyst_can_export_aggregate_only(self, source_json):
        self.auth_as(self.analyst)
        self.assertEqual(self.client.get('/api/metrics/export/').status_code, 200)
        self.assertEqual(self.client.get('/api/metrics/users/').status_code, 403)


class SourceCsvTests(APITestCase):
    @patch('metrics.service.requests.get')
    @patch('metrics.service.source_settings', return_value=('http://127.0.0.1:8000/api/admin/user-metrics', 'mock-auth', 12))
    def test_csv_query_and_spreadsheet_formula_safety(self, settings, get):
        from .service import get_source_csv
        response = get.return_value
        response.headers = {'Content-Type': 'text/csv'}
        response.iter_content.return_value = [b'name,phone\n"=HYPERLINK(1)",0801234\n']
        content, count = get_source_csv()
        self.assertEqual(count, 1)
        self.assertIn(b"'=HYPERLINK(1)", content)
        self.assertEqual(get.call_args.kwargs['params'], {'format': 'csv'})
        self.assertEqual(get.call_args.kwargs['headers']['Accept'], 'text/csv')
        response.close.assert_called_once()

    @patch('metrics.service.requests.get')
    @patch('metrics.service.source_settings', return_value=('http://127.0.0.1:8000/api/admin/user-metrics', 'mock-auth', 12))
    def test_rejects_json_instead_of_csv(self, settings, get):
        from .service import UpstreamError, get_source_csv
        get.return_value.headers = {'Content-Type': 'application/json'}
        with self.assertRaises(UpstreamError):
            get_source_csv()
