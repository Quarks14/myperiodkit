from django.conf import settings
from django.db import models


class AccountSecurityState(models.Model):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='security_state')
    must_change_password = models.BooleanField(default=False)

    def __str__(self):
        return f'Security settings for {self.user_id}'


class AccessAuditEvent(models.Model):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='access_events_performed', null=True, on_delete=models.SET_NULL)
    target = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='access_events_received', null=True, on_delete=models.SET_NULL)
    action = models.CharField(max_length=48)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ('-created_at', '-id')

    def __str__(self):
        return f'{self.action} ({self.created_at:%Y-%m-%d %H:%M})'
