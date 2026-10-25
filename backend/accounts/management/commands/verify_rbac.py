"""Check local role setup and the account API contract without exposing secrets.

Run after migrate and setup_roles. This checks the code on disk and database;
a running Django process still needs to be restarted to pick up code changes.
"""
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db.migrations.recorder import MigrationRecorder
from django.urls import Resolver404, resolve

from accounts.roles import ROLE_CAPABILITIES, account_payload


EXPECTED_ENDPOINTS = {
    '/api/auth/login/': 'LoginView',
    '/api/auth/me/': 'MeView',
    '/api/auth/roles/': 'RolesView',
    '/api/auth/staff/': 'StaffListCreateView',
    '/api/auth/audit/': 'AuditLogView',
    '/api/auth/password/': 'ChangePasswordView',
}


class Command(BaseCommand):
    help = 'Verify My Period Kit roles, migration, URL routes and login account contract.'

    def handle(self, *args, **options):
        problems = []
        if not MigrationRecorder.Migration.objects.filter(
            app='accounts', name='0001_initial'
        ).exists():
            problems.append('accounts.0001_initial migration has not been applied')

        expected_roles = set(ROLE_CAPABILITIES)
        configured_roles = set(Group.objects.filter(name__in=expected_roles).values_list('name', flat=True))
        missing_roles = expected_roles - configured_roles
        if missing_roles:
            problems.append('Missing staff roles: ' + ', '.join(sorted(missing_roles)))

        for path, expected in EXPECTED_ENDPOINTS.items():
            try:
                match = resolve(path)
                view_class = getattr(match.func, 'cls', None)
                actual = getattr(view_class, '__name__', None)
                if actual != expected:
                    problems.append(f'{path} resolves to {actual!r}, expected {expected}')
            except Resolver404:
                problems.append(f'Missing route: {path}')

        User = get_user_model()
        admin = User.objects.filter(is_active=True, is_superuser=True).first()
        if admin:
            payload = account_payload(admin)
            required = {'id', 'username', 'role', 'permissions', 'must_change_password', 'is_superuser'}
            if not required.issubset(payload):
                problems.append('Login account response does not contain all required fields')
            if payload.get('role') != 'admin' or not isinstance(payload.get('permissions'), list):
                problems.append('Superuser role or permissions response is invalid')
            elif not set(ROLE_CAPABILITIES['admin']).issubset(payload['permissions']):
                problems.append('Superuser permissions response is incomplete')
        else:
            self.stdout.write(self.style.WARNING('No active Django superuser found; create one with createsuperuser.'))

        if problems:
            for issue in problems:
                self.stderr.write(self.style.ERROR('FAILED: ' + issue))
            raise CommandError('Role and permission setup is incomplete. Fix the errors above.')

        self.stdout.write(self.style.SUCCESS('PASS: RBAC migration, roles, routes and account contract.'))
        self.stdout.write('Restart the running Django server on port 8000 before signing in again.')
