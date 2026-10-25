from django.urls import path
from .views import (
    AuditLogView, ChangePasswordView, LoginView, LogoutView, MeView,
    ResetStaffPasswordView, RolesView, StaffDetailView, StaffListCreateView,
)

urlpatterns = [
    path('login/', LoginView.as_view()),
    path('me/', MeView.as_view()),
    path('logout/', LogoutView.as_view()),
    path('password/', ChangePasswordView.as_view()),
    path('roles/', RolesView.as_view()),
    path('staff/', StaffListCreateView.as_view()),
    path('staff/<int:pk>/', StaffDetailView.as_view()),
    path('staff/<int:pk>/reset-password/', ResetStaffPasswordView.as_view()),
    path('audit/', AuditLogView.as_view()),
]
