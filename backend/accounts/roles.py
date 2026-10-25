"""Canonical role/capability definitions for the staff portal.

Frontend navigation is presentation only. Every protected API checks this module.
"""
from django.contrib.auth.models import Group

ROLES = ('admin', 'analyst', 'viewer')

CAPABILITY_LABELS = {
    'overview.view': 'View programme overview and charts',
    'geography.view': 'View aggregate geographic reports',
    'records.view': 'View identifiable source user records',
    'export.summary': 'Download aggregate CSV reports',
    'export.records': 'Download identifiable participant records as CSV',
    'metrics.refresh': 'Refresh the upstream metrics cache',
    'staff.manage': 'Create, update and disable staff accounts',
    'audit.view': 'Review staff access changes',
}

ROLE_CAPABILITIES = {
    'admin': tuple(CAPABILITY_LABELS),
    'analyst': ('overview.view', 'geography.view', 'export.summary'),
    'viewer': ('overview.view', 'geography.view'),
}

ROLE_DESCRIPTIONS = {
    'admin': 'Manages staff access, can view individual records and download the protected source CSV.',
    'analyst': 'Works with aggregate reports and can export summaries.',
    'viewer': 'Reads aggregate reports and maps without exporting or managing accounts.',
}


def assigned_role(user):
    if not user or not user.is_authenticated:
        return None
    if user.is_superuser:
        return 'admin'
    names = {group.name for group in user.groups.all()}
    return next((role for role in ROLES if role in names), None)


def role_of(user):
    if not user or not user.is_authenticated or not user.is_active:
        return None
    return assigned_role(user)


def can(user, capability):
    role = role_of(user)
    return bool(role and capability in ROLE_CAPABILITIES[role])


def must_change_password(user):
    if not user or not user.is_authenticated:
        return False
    state = getattr(user, 'security_state', None)
    return bool(state and state.must_change_password)


def account_payload(user):
    role = role_of(user)
    return {
        'id': user.pk,
        'username': user.username,
        'role': role,
        'permissions': list(ROLE_CAPABILITIES.get(role, ())),
        'must_change_password': must_change_password(user),
        'is_superuser': user.is_superuser,
    }


def set_role(user, role):
    """Keep exactly one portal role while preserving unrelated Django groups."""
    if role not in ROLES:
        raise ValueError('Unknown portal role')
    groups = list(Group.objects.filter(name__in=ROLES))
    user.groups.remove(*groups)
    group, _ = Group.objects.get_or_create(name=role)
    user.groups.add(group)
