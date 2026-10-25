"""Staff authentication and account administration.

Staff CRUD is separate from upstream My Period Kit participant records.
"""
from datetime import date
import re
from django.contrib.auth import authenticate, get_user_model
from django.db import transaction
from django.db.models import Q
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from .models import AccessAuditEvent, AccountSecurityState
from .permissions import RequiresCapability
from .roles import (
    CAPABILITY_LABELS, ROLES, ROLE_CAPABILITIES, ROLE_DESCRIPTIONS,
    account_payload, assigned_role, role_of, set_role,
)
from .serializers import (
    ChangePasswordSerializer, PasswordResetSerializer, StaffCreateSerializer,
    StaffUpdateSerializer,
)

User = get_user_model()


def staff_dates(params):
    """Validate inclusive UTC date range used by staff and audit listings."""
    start = params.get('date_from', '').strip()
    end = params.get('date_to', '').strip()
    parsed = []
    for raw in (start, end):
        if not raw:
            parsed.append(None)
            continue
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', raw):
            raise ValueError('Date must be YYYY-MM-DD.')
        try:
            parsed.append(date.fromisoformat(raw))
        except ValueError as exc:
            raise ValueError('Invalid reporting date.') from exc
    if parsed[0] and parsed[1] and parsed[0] > parsed[1]:
        raise ValueError('End date must be on or after start date.')
    return parsed


def staff_payload(user):
    return {
        **account_payload(user),
        'role': assigned_role(user),
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_active': user.is_active,
        'last_login': user.last_login.isoformat() if user.last_login else None,
        'date_joined': user.date_joined.isoformat(),
    }


def audit(actor, target, action, details=None):
    AccessAuditEvent.objects.create(actor=actor, target=target, action=action, details=details or {})


def active_admin_count():
    return User.objects.filter(is_active=True).filter(
        Q(is_superuser=True) | Q(groups__name='admin')
    ).distinct().count()


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'login'

    def post(self, request):
        username = request.data.get('username', '')
        password = request.data.get('password', '')
        if not isinstance(username, str) or not isinstance(password, str):
            return Response({'detail': 'Invalid credentials'}, status=400)
        user = authenticate(request, username=username, password=password)
        if not user or not user.is_active or not role_of(user):
            return Response({'detail': 'Invalid credentials or access not assigned'}, status=401)
        token, _ = Token.objects.get_or_create(user=user)
        return Response({'token': token.key, 'user': account_payload(user)})


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not role_of(request.user):
            return Response({'detail': 'Access not assigned'}, status=403)
        return Response(account_payload(request.user))


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response({'detail': 'Signed out'})


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not role_of(request.user):
            return Response({'detail': 'Access not assigned'}, status=403)
        serializer = ChangePasswordSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        with transaction.atomic():
            user.set_password(serializer.validated_data['new_password'])
            user.save(update_fields=['password'])
            AccountSecurityState.objects.update_or_create(user=user, defaults={'must_change_password': False})
            Token.objects.filter(user=user).delete()
            token = Token.objects.create(user=user)
            audit(user, user, 'password.changed')
        return Response({'token': token.key, 'user': account_payload(user)})


class RolesView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'staff.manage'

    def get(self, request):
        return Response({
            'capabilities': [{'key': key, 'label': label} for key, label in CAPABILITY_LABELS.items()],
            'roles': [
                {'name': role, 'description': ROLE_DESCRIPTIONS[role], 'permissions': list(ROLE_CAPABILITIES[role])}
                for role in ROLES
            ],
        })


class StaffListCreateView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'staff.manage'

    def get(self, request):
        users = User.objects.all().select_related('security_state').prefetch_related('groups').order_by('username', 'id')
        search = request.query_params.get('search', '').strip()[:80]
        if search:
            users = users.filter(Q(username__icontains=search) | Q(email__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
        role_filter = request.query_params.get('role', '').strip()
        if role_filter:
            if role_filter not in ROLES:
                return Response({'detail': 'Invalid role filter'}, status=400)
            if role_filter == 'admin':
                users = users.filter(Q(groups__name='admin') | Q(is_superuser=True)).distinct()
            else:
                users = users.filter(is_superuser=False, groups__name=role_filter).distinct()
        active = request.query_params.get('active', '').strip().lower()
        if active in ('true', 'false'):
            users = users.filter(is_active=active == 'true')
        date_field = request.query_params.get('date_field', 'date_joined')
        if date_field not in ('date_joined', 'last_login'):
            return Response({'detail': 'Invalid staff date type.'}, status=400)
        try:
            date_from, date_to = staff_dates(request.query_params)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        if date_from:
            users = users.filter(**{f'{date_field}__date__gte': date_from})
        if date_to:
            users = users.filter(**{f'{date_field}__date__lte': date_to})
        try:
            page = max(1, int(request.query_params.get('page', '1')))
        except (TypeError, ValueError):
            return Response({'detail': 'Page must be a positive integer'}, status=400)
        page = min(page, 100000)
        page_size = 15
        total = users.count()
        records = list(users[(page - 1) * page_size: page * page_size])
        return Response({'results': [staff_payload(user) for user in records], 'total': total, 'page': page, 'page_size': page_size})

    def post(self, request):
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        with transaction.atomic():
            user = User.objects.create_user(
                username=values['username'],
                password=values['password'],
                email=values.get('email', ''),
                first_name=values.get('first_name', ''),
                last_name=values.get('last_name', ''),
                is_active=values.get('is_active', True),
            )
            set_role(user, values['role'])
            AccountSecurityState.objects.create(user=user, must_change_password=True)
            audit(request.user, user, 'staff.created', {'role': values['role'], 'is_active': user.is_active})
        return Response(staff_payload(user), status=status.HTTP_201_CREATED)


class StaffDetailView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'staff.manage'

    def patch(self, request, pk):
        serializer = StaffUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        with transaction.atomic():
            target = User.objects.select_for_update().filter(pk=pk).first()
            if not target:
                return Response({'detail': 'Staff account not found'}, status=404)
            if target.is_superuser:
                return Response({'detail': 'Superuser accounts must be managed in Django administration.'}, status=403)
            values = serializer.validated_data
            role_before = assigned_role(target)
            role_after = values.get('role', role_before)
            active_after = values.get('is_active', target.is_active)
            if request.user.pk == target.pk and (role_after != role_before or not active_after):
                return Response({'detail': 'You cannot remove your own administrative access.'}, status=400)
            if role_before == 'admin' and target.is_active and (role_after != 'admin' or not active_after) and active_admin_count() <= 1:
                return Response({'detail': 'At least one active administrator is required.'}, status=400)
            updates = {}
            for field in ('email', 'first_name', 'last_name', 'is_active'):
                if field in values and getattr(target, field) != values[field]:
                    updates[field] = {'is_active': (target.is_active, values[field])} if field == 'is_active' else True
                    setattr(target, field, values[field])
            if updates:
                target.save(update_fields=list(updates))
            if 'role' in values and values['role'] != role_before:
                set_role(target, values['role'])
                updates['role'] = {'from': role_before, 'to': values['role']}
            if 'role' in updates or 'is_active' in updates:
                Token.objects.filter(user=target).delete()
            if updates:
                audit(request.user, target, 'staff.updated', updates)
        return Response(staff_payload(target))


class ResetStaffPasswordView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'staff.manage'

    def post(self, request, pk):
        with transaction.atomic():
            target = User.objects.select_for_update().filter(pk=pk).first()
            if not target:
                return Response({'detail': 'Staff account not found'}, status=404)
            if target.is_superuser or target.pk == request.user.pk:
                return Response({'detail': 'This password must be changed using the account password page.'}, status=403)
            serializer = PasswordResetSerializer(data=request.data, context={'target': target})
            serializer.is_valid(raise_exception=True)
            target.set_password(serializer.validated_data['password'])
            target.save(update_fields=['password'])
            AccountSecurityState.objects.update_or_create(user=target, defaults={'must_change_password': True})
            Token.objects.filter(user=target).delete()
            audit(request.user, target, 'staff.password_reset')
        return Response({'detail': 'Password updated. The staff member must change it at next sign-in.'})


class AuditLogView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'audit.view'

    def get(self, request):
        events = AccessAuditEvent.objects.select_related('actor', 'target').all()
        action = request.query_params.get('action', '').strip()
        if action:
            if len(action) > 80 or not re.fullmatch(r'[a-z_.]+', action):
                return Response({'detail': 'Invalid activity type.'}, status=400)
            events = events.filter(action=action)
        try:
            date_from, date_to = staff_dates(request.query_params)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        if date_from:
            events = events.filter(created_at__date__gte=date_from)
        if date_to:
            events = events.filter(created_at__date__lte=date_to)
        events = events[:100]
        return Response({'results': [
            {'id': event.id, 'action': event.action, 'actor': event.actor.username if event.actor else 'Former user',
             'target': event.target.username if event.target else 'Former user',
             'details': event.details, 'created_at': event.created_at.isoformat()}
            for event in events
        ]})
