from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.CreateModel(
            name='MetricsSnapshot',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('payload', models.JSONField()),
                ('fetched_at', models.DateTimeField()),
                ('record_count', models.PositiveIntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='MetricsSyncRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('trigger', models.CharField(max_length=16)),
                ('outcome', models.CharField(max_length=16)),
                ('started_at', models.DateTimeField()),
                ('finished_at', models.DateTimeField()),
                ('record_count', models.PositiveIntegerField(blank=True, null=True)),
                ('error', models.CharField(blank=True, default='', max_length=200)),
            ],
            options={'ordering': ('-started_at', '-id')},
        ),
        migrations.CreateModel(
            name='MetricsSyncSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enabled', models.BooleanField(default=True)),
                ('interval_minutes', models.PositiveSmallIntegerField(default=5)),
                ('next_run_at', models.DateTimeField(blank=True, null=True)),
                ('locked_until', models.DateTimeField(blank=True, null=True)),
                ('lock_token', models.UUIDField(blank=True, null=True)),
                ('last_tick_at', models.DateTimeField(blank=True, null=True)),
                ('last_attempt_at', models.DateTimeField(blank=True, null=True)),
                ('last_success_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.CharField(blank=True, default='', max_length=200)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL,
                                                 related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
