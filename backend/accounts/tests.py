from unittest.mock import patch
from django.contrib.auth.models import Group, User
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase
from accounts.models import AccessAuditEvent, AccountSecurityState

SAMPLE = {
    'summary': {'registered': 26, 'onboarded': 16, 'users_chatting': 18, 'active_last_7d': 16},
    'users': [{'name': 'Sensitive person', 'phone_number': '+2348000000000', 'location': 'Lagos',
               'age': 20, 'total_messages': 42, 'onboarding_completed': True,
               'registered_at': '2026-09-01T10:15:00+00:00'}],
}


class RoleAndStaffTests(APITestCase):
    def setUp(self):
        for role in ('admin', 'analyst', 'viewer'):
            Group.objects.get_or_create(name=role)
        self.admin = self.make_user('portaladmin', 'admin')
        self.analyst = self.make_user('analyststaff', 'analyst')
        self.viewer = self.make_user('viewerteam', 'viewer')

    def make_user(self, username, role):
        user = User.objects.create_user(username, password='InitialPassphrase2026!')
        user.groups.add(Group.objects.get(name=role))
        return user

    def as_user(self, user):
        token, _ = Token.objects.get_or_create(user=user)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + token.key)

    @patch('metrics.views.get_source', return_value=SAMPLE)
    def test_permissions_enforced_on_every_reporting_endpoint(self, get_source):
        for user, expected in ((self.admin, (200, 200, 200)), (self.analyst, (200, 403, 200)), (self.viewer, (200, 403, 403))):
            self.as_user(user)
            self.assertEqual(self.client.get('/api/metrics/overview/').status_code, expected[0])
            self.assertEqual(self.client.get('/api/metrics/users/').status_code, expected[1])
            self.assertEqual(self.client.get('/api/metrics/export/').status_code, expected[2])
            self.assertEqual(self.client.get('/api/metrics/overview/?refresh=1').status_code, 200 if user == self.admin else 403)
        self.as_user(self.admin)
        response = self.client.get('/api/metrics/export/')
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertNotIn('+2348000000000', response.content.decode())
        self.assertNotIn('Sensitive person', response.content.decode())

    def test_viewer_cannot_access_staff_admin_and_audit(self):
        self.as_user(self.viewer)
        self.assertEqual(self.client.get('/api/auth/staff/').status_code, 403)
        self.assertEqual(self.client.get('/api/auth/roles/').status_code, 403)
        self.assertEqual(self.client.get('/api/auth/audit/').status_code, 403)
        self.assertEqual(self.client.post('/api/auth/staff/', {'username': 'newacct'}, format='json').status_code, 403)

    def test_admin_creates_staff_and_records_audit(self):
        self.as_user(self.admin)
        response = self.client.post('/api/auth/staff/', {
            'username': 'newteam', 'email': 'team@example.org', 'role': 'viewer',
            'password': 'DistinctSecurePassword2026!', 'first_name': 'Amina',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(response.data['must_change_password'])
        self.assertEqual(response.data['role'], 'viewer')
        self.assertNotIn('password', response.data)
        self.assertEqual(AccessAuditEvent.objects.filter(action='staff.created').count(), 1)
        self.assertEqual(self.client.get('/api/auth/roles/').status_code, 200)
        self.assertEqual(self.client.get('/api/auth/audit/').status_code, 200)
        self.assertEqual(self.client.get('/api/auth/staff/?search=newteam').data['total'], 1)

    def test_role_change_invalidates_previous_token(self):
        self.as_user(self.analyst)
        old_token = Token.objects.get(user=self.analyst).key
        self.as_user(self.admin)
        response = self.client.patch(f'/api/auth/staff/{self.analyst.id}/', {'role': 'viewer'}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['role'], 'viewer')
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + old_token)
        self.assertEqual(self.client.get('/api/metrics/overview/').status_code, 401)
        self.as_user(self.analyst)
        self.assertEqual(self.client.get('/api/metrics/export/').status_code, 403)

    def test_deactivation_blocks_authentication(self):
        self.as_user(self.viewer)
        old_token = Token.objects.get(user=self.viewer).key
        self.as_user(self.admin)
        response = self.client.patch(f'/api/auth/staff/{self.viewer.id}/', {'is_active': False}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['role'], 'viewer')  # assigned role retained when inactive
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + old_token)
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 401)
        self.client.credentials()
        self.assertEqual(self.client.post('/api/auth/login/', {'username': self.viewer.username, 'password': 'InitialPassphrase2026!'}).status_code, 401)

    def test_cannot_remove_own_admin_access(self):
        self.as_user(self.admin)
        self.assertEqual(self.client.patch(f'/api/auth/staff/{self.admin.pk}/', {'role': 'viewer'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(f'/api/auth/staff/{self.admin.pk}/', {'is_active': False}, format='json').status_code, 400)

    def test_password_reset_forces_password_change_and_reissues_token(self):
        self.as_user(self.admin)
        reset = self.client.post(f'/api/auth/staff/{self.viewer.pk}/reset-password/', {'password': 'TemporaryNewPassword2026!'}, format='json')
        self.assertEqual(reset.status_code, 200, reset.data)
        self.assertTrue(AccountSecurityState.objects.get(user=self.viewer).must_change_password)
        self.client.credentials()
        login = self.client.post('/api/auth/login/', {'username': 'viewerteam', 'password': 'TemporaryNewPassword2026!'}, format='json')
        self.assertEqual(login.status_code, 200, login.data)
        self.assertTrue(login.data['user']['must_change_password'])
        old_token = login.data['token']
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + old_token)
        self.assertEqual(self.client.get('/api/metrics/overview/').status_code, 403)
        changed = self.client.post('/api/auth/password/', {'current_password': 'TemporaryNewPassword2026!', 'new_password': 'NewStrongPassphrase2026!'}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertFalse(changed.data['user']['must_change_password'])
        self.assertNotEqual(changed.data['token'], old_token)
        self.client.credentials(HTTP_AUTHORIZATION='Token ' + changed.data['token'])
        with patch('metrics.views.get_source', return_value=SAMPLE):
            self.assertEqual(self.client.get('/api/metrics/overview/').status_code, 200)

    def test_password_validation_rejects_short_values(self):
        self.as_user(self.admin)
        self.assertEqual(self.client.post('/api/auth/staff/', {
            'username': 'weakacct', 'role': 'viewer', 'password': '1234'
        }, format='json').status_code, 400)

    def test_superuser_cannot_be_modified_in_staff_screen(self):
        root = User.objects.create_superuser('rootadmin', 'root@example.org', 'RootPassword2026!')
        self.as_user(self.admin)
        self.assertEqual(self.client.patch(f'/api/auth/staff/{root.pk}/', {'role': 'viewer'}, format='json').status_code, 403)
        self.assertEqual(self.client.post(f'/api/auth/staff/{root.pk}/reset-password/', {'password': 'NewRootPassphrase2026!'}, format='json').status_code, 403)

    def test_no_token_leaks_unauthenticated(self):
        self.client.credentials()
        for path in ('/api/auth/roles/', '/api/auth/staff/', '/api/auth/audit/', '/api/metrics/users/', '/api/metrics/export/'):
            self.assertEqual(self.client.get(path).status_code, 401, path)

    def test_superuser_login_and_me_include_required_rbac_fields(self):
        """Regression: v0.3.1 login must never receive a legacy profile."""
        superuser = User.objects.create_superuser(
            username='contractroot',
            email='root@example.org',
            password='StrongContractPassword2026!',
        )
        self.client.credentials()
        login = self.client.post('/api/auth/login/', {
            'username': 'contractroot',
            'password': 'StrongContractPassword2026!',
        }, format='json')
        self.assertEqual(login.status_code, 200, login.data)
        self.assertIn('token', login.data)
        account = login.data['user']
        self.assertEqual(account['id'], superuser.pk)
        self.assertEqual(account['role'], 'admin')
        self.assertTrue(account['is_superuser'])
        self.assertFalse(account['must_change_password'])
        self.assertIn('staff.manage', account['permissions'])
        for key in ('id', 'username', 'role', 'permissions', 'must_change_password', 'is_superuser'):
            self.assertIn(key, account)

        self.client.credentials(HTTP_AUTHORIZATION='Token ' + login.data['token'])
        profile = self.client.get('/api/auth/me/')
        self.assertEqual(profile.status_code, 200, profile.data)
        self.assertEqual(profile.data, account)

    def test_assigned_staff_login_has_limited_permission_profile(self):
        self.client.credentials()
        login = self.client.post('/api/auth/login/', {
            'username': 'viewerteam',
            'password': 'InitialPassphrase2026!',
        }, format='json')
        self.assertEqual(login.status_code, 200, login.data)
        account = login.data['user']
        self.assertEqual(account['role'], 'viewer')
        self.assertIn('overview.view', account['permissions'])
        self.assertNotIn('records.view', account['permissions'])
        self.assertNotIn('staff.manage', account['permissions'])
