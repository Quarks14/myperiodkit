"""Cron entrypoint: called every minute; respects the interval set in the UI."""
from django.core.management.base import BaseCommand
from metrics.sync import due_sync


class Command(BaseCommand):
    help = 'Poll scheduled metrics sync. A cron tick every minute respects the saved interval.'

    def add_arguments(self, parser):
        parser.add_argument('--force', action='store_true', help='Run now regardless of configured due time.')

    def handle(self, *args, **options):
        force = options['force']
        result = due_sync(trigger='manual' if force else 'scheduled', force=force)
        # Operational output only. Never print upstream response data or credentials.
        self.stdout.write(f"Metrics sync: {result['outcome']}")
