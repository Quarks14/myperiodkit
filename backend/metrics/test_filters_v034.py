"""v0.3.4 regression tests: shared filters, permissions and exports."""
import csv
import io
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from django.contrib.auth.models import Group, User
from django.http import QueryDict
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from .filters import (
    CohortFilters, enrich_user, filter_options, parse_filters,
    select_users, user_country_state,
)
from .service import summarize


def example_source():
    now = datetime.now(timezone.utc)
    iso = lambda days: (now - timedelta(days=days)).isoformat()
    return {
        'summary': {'registered': 28, 'onboarded': 17, 'users_chatting': 19, 'active_last_7d': 17},
        'users': [
            {'name': 'A', 'location': 'Abuja.', 'age': 23, 'preferred_language': 'en',
             'onboarding_completed': True, 'registered_at': '2026-09-01T23:30:00+00:00',
             'last_interaction': iso(2), 'total_messages': 12, 'messages_last_7d': 3},
            {'name': 'B', 'location': 'Lagos', 'age': 32, 'preferred_language': 'en',
             'onboarding_completed': False, 'registered_at': '2026-09-02T04:00:00+00:00',
             'last_interaction': iso(8), 'total_messages': 2, 'messages_last_7d': 0},
            {'name': 'C', 'location': 'Ogun State', 'age': 17, 'preferred_language': 'yo',
             'onboarding_completed': True, 'registered_at': '2026-09-10T12:00:00+00:00',
             'last_interaction': iso(3), 'total_messages': 4, 'messages_last_7d': 1},
            {'name': 'D', 'location': 'Abroad', 'age': None, 'preferred_language': None,
             'onboarding_completed': None, 'registered_at': None, 'last_interaction': None},
            {'name': 'E', 'location': 'Unknown village', 'age': 19, 'preferred_language': 'en',
             'onboarding_completed': True, 'registered_at': '2026-09-01T01:00:00+00:00',
             'last_interaction': iso(1), 'total_messages': 0, 'messages_last_7d': None},
        ],
    }


class FilterLogicTests(APITestCase):
    def test_geo_inference_only_for_known_places(self):
        self.assertEqual(user_country_state({'location': 'Abuja.'}), ('Nigeria', 'FCT'))
        self.assertEqual(user_country_state({'location': 'Ibadan'}), ('Nigeria', 'Oyo'))
        self.assertEqual(user_country_state({'location': 'Ogun State'}), ('Nigeria', 'Ogun'))
        self.assertEqual(user_country_state({'location': 'Abroad'}), ('Outside Nigeria (country unspecified)', 'Not provided'))
        self.assertEqual(user_country_state({'location': 'Unknown village'}), ('Not provided', 'Not provided'))

    def test_multi_select_country_state_age_and_language(self):
        values = QueryDict('country=Nigeria&state=FCT&state=Ogun&age_band=18-24&age_band=Under+18&language=en&language=yo')
        filters = parse_filters(values)
        selected = select_users(example_source(), filters)
        self.assertEqual([user['name'] for user in selected], ['A', 'C'])
        self.assertTrue(filters.active)
        self.assertIn('Ogun', filter_options(example_source())['state'])

    def test_utc_date_range_inclusive(self):
        values = QueryDict('date_field=registered_at&date_from=2026-09-01&date_to=2026-09-01')
        self.assertEqual([u['name'] for u in select_users(example_source(), parse_filters(values))], ['A', 'E'])
        values = QueryDict('date_field=registered_at&date_from=2026-09-02&date_to=2026-09-02')
        self.assertEqual([u['name'] for u in select_users(example_source(), parse_filters(values))], ['B'])

    def test_missing_date_excluded_if_date_filter_applied(self):
        values = QueryDict('date_field=last_chat&date_from=2026-09-01')
        self.assertEqual(select_users(example_source(), parse_filters(values)), [])

    def test_invalid_date_and_sort_of_date_type_rejected(self):
        from rest_framework.exceptions import ValidationError
        for query in ('date_from=2026-02-30', 'date_from=2026-09-11&date_to=2026-09-01',
                      'date_field=not_a_real_field&date_from=2026-09-01', 'age_band=' + 'a'*100):
            with self.subTest(query=query), self.assertRaises(ValidationError):
                parse_filters(QueryDict(query))

    def test_filtered_totals_from_matching_records_not_source_summary(self):
        data = example_source()
        filtered = summarize(data, parse_filters(QueryDict('country=Nigeria&age_band=18-24')))
        self.assertEqual(filtered['summary']['registered'], 1)
        self.assertEqual(filtered['summary']['onboarded'], 1)
        self.assertEqual(filtered['derived']['total_messages'], 12)
        self.assertEqual(filtered['filters']['matched_records'], 1)
        self.assertEqual(filtered['filters']['total_source_records'], 5)
        self.assertEqual(filtered['filters']['basis'], 'matching_user_records')
        self.assertFalse('phone_number' in str(filtered))
        self.assertEqual(summarize(data)['summary']['registered'], 28)


class FilteredEndpointsTests(APITestCase):
    def setUp(self):
        for role in ('admin', 'analyst', 'viewer'):
            Group.objects.get_or_create(name=role)
        self.admin = User.objects.create_superuser('rootuser', 'admin@example.org', 'SomePassword123!')
        self.analyst = User.objects.create_user('analyst', password='SomePassword123!')
        self.analyst.groups.add(Group.objects.get(name='analyst'))
        self.viewer = User.objects.create_user('viewer', password='SomePassword123!')
        self.viewer.groups.add(Group.objects.get(name='viewer'))

    def login_as(self, user):
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + Token.objects.create(user=user).key)

    @patch('metrics.views.get_source', side_effect=lambda force=False: example_source())
    def test_overview_filters_do_not_expose_records(self, source):
        self.login_as(self.viewer)
        response = self.client.get('/api/metrics/overview/?country=Nigeria&state=FCT&age_band=18-24')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['summary']['registered'], 1)
        self.assertEqual(response.data['charts']['states'], [{'name': 'FCT', 'value': 1}])
        self.assertNotIn('users', response.data)
        self.assertNotIn('name', response.data)
        self.assertEqual(self.client.get('/api/metrics/users/?country=Nigeria').status_code, 403)
        self.assertEqual(self.client.get('/api/metrics/export/selected/?country=Nigeria').status_code, 403)

    @patch('metrics.views.get_source', return_value=example_source())
    def test_selected_users_and_admin_csv(self, source):
        from accounts.models import AccessAuditEvent
        self.login_as(self.admin)
        response = self.client.get('/api/metrics/users/?state=FCT&state=Ogun')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['users']), 2)
        self.assertEqual(response.data['users'][0]['country'], 'Nigeria')
        response = self.client.get('/api/metrics/export/selected/?state=FCT')
        self.assertEqual(response.status_code, 200)
        values = list(csv.reader(io.StringIO(response.content.decode('utf-8'))))
        self.assertEqual(len(values), 2)  # header + exactly one selected participant
        self.assertIn('country', values[0])
        self.assertEqual(AccessAuditEvent.objects.filter(action='metrics.records_exported').count(), 1)
        details = AccessAuditEvent.objects.get(action='metrics.records_exported').details
        self.assertEqual(details['rows'], 1)
        self.assertEqual(details['scope'], 'filtered')
        self.assertNotIn('A', str(details))

    @patch('metrics.views.get_source', return_value=example_source())
    def test_aggregate_export_matches_filters(self, source):
        self.login_as(self.analyst)
        response = self.client.get('/api/metrics/export/?country=Nigeria&state=FCT')
        self.assertEqual(response.status_code, 200)
        self.assertIn(b'Filtered user records', response.content)
        self.assertIn(b'Filter: state,FCT', response.content)
        self.assertEqual(self.client.get('/api/metrics/export/selected/').status_code, 403)

    @patch('metrics.views.get_source', return_value=example_source())
    def test_invalid_query_returns_400_not_server_error(self, source):
        self.login_as(self.admin)
        response = self.client.get('/api/metrics/overview/?date_from=2026-12-30&date_to=2026-01-01')
        self.assertEqual(response.status_code, 400)
        source.assert_not_called()

    def test_staff_date_validation(self):
        self.login_as(self.admin)
        response = self.client.get('/api/auth/staff/?date_field=last_login&date_from=2026-01-01')
        self.assertEqual(response.status_code, 200)
        response = self.client.get('/api/auth/staff/?date_to=invalid')
        self.assertEqual(response.status_code, 400)
        response = self.client.get('/api/auth/audit/?action=staff.created&date_from=2026-01-01')
        self.assertEqual(response.status_code, 200)
