from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand
from accounts.roles import ROLE_CAPABILITIES


class Command(BaseCommand):
    help = 'Create the three My Period Kit staff roles. Safe to run repeatedly.'

    def handle(self, *args, **kwargs):
        for role in ROLE_CAPABILITIES:
            Group.objects.get_or_create(name=role)
        self.stdout.write(self.style.SUCCESS('Roles ready: admin, analyst, viewer'))
