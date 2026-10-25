from rest_framework.permissions import BasePermission
from .roles import can, must_change_password


class RequiresCapability(BasePermission):
    """Fail closed: no capability or pending password change means no access."""

    message = 'You do not have permission to perform this action.'

    def has_permission(self, request, view):
        permission = getattr(view, 'required_capability', None)
        return bool(permission and request.user.is_authenticated and not must_change_password(request.user) and can(request.user, permission))
