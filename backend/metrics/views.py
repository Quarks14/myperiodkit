"""Permission-checked programme reports and CSV downloads."""
import csv
from django.core.exceptions import ImproperlyConfigured
from django.http import HttpResponse
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from accounts.permissions import RequiresCapability
from accounts.roles import can
from accounts.models import AccessAuditEvent
from .filters import enrich_user, parse_filters, select_users
from .service import UpstreamError, get_source, get_source_csv, safe_csv_cell, summarize


class OverviewView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'overview.view'

    def get(self, request):
        filters = parse_filters(request.query_params)
        force = request.query_params.get('refresh') == '1'
        if force and not can(request.user, 'metrics.refresh'):
            return Response({'detail': 'Administrator permission required to bypass the metrics cache.'}, status=403)
        try:
            data = summarize(get_source(force=force), filters)
        except (UpstreamError, ImproperlyConfigured) as exc:
            return Response({'detail': str(exc)}, status=503)
        return Response(data)


ALLOWED_USER_FIELDS = (
    'name', 'phone_number', 'age', 'location', 'preferred_language',
    'onboarding_state', 'onboarding_completed', 'registered_at',
    'last_interaction', 'total_messages', 'first_chat', 'last_chat',
    'avg_response_ms', 'messages_last_7d',
)


class UserRowsView(APIView):
    permission_classes = [RequiresCapability]
    required_capability = 'records.view'

    def get(self, request):
        filters = parse_filters(request.query_params)
        try:
            items = select_users(get_source(), filters)
        except (UpstreamError, ImproperlyConfigured) as exc:
            return Response({'detail': str(exc)}, status=503)
        return Response({'users': [
            {**{key: item.get(key) for key in ALLOWED_USER_FIELDS}, **enrich_user(item)}
            for item in items
        ], 'filters': {'active': filters.active, 'applied': filters.public()}})


class SummaryExportView(APIView):
    """CSV of current aggregate cohort, never participants' identifiers."""
    permission_classes = [RequiresCapability]
    required_capability = 'export.summary'

    def get(self, request):
        filters = parse_filters(request.query_params)
        try:
            data = summarize(get_source(), filters)
        except (UpstreamError, ImproperlyConfigured) as exc:
            return Response({'detail': str(exc)}, status=503)
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="periodkit-summary.csv"'
        response['Cache-Control'] = 'private, no-store, max-age=0'
        response['X-Content-Type-Options'] = 'nosniff'
        writer = csv.writer(response)
        writer.writerow(('Report basis', 'Filtered user records' if filters.active else 'Source summary'))
        writer.writerow(('Matched user records', data['filters']['matched_records']))
        writer.writerow(('Source user records', data['filters']['total_source_records']))
        for key, value in filters.public().items():
            if isinstance(value, list):
                value = '; '.join(value)
            writer.writerow((f'Filter: {key}', safe_csv_cell(str(value))))
        writer.writerow(())
        writer.writerow(('Metric', 'Value'))
        hidden_chat_labels = {'users_chatting', 'chatting_rate', 'messages_per_chatting_user'}
        for section in ('summary', 'derived'):
            for key, value in data[section].items():
                if key in hidden_chat_labels:
                    continue  # Removed from the reporting interface in v0.3.4.
                cell = value if value is not None else ''
                if isinstance(cell, str):
                    cell = safe_csv_cell(cell)
                writer.writerow((key, cell))
        writer.writerow(())
        writer.writerow(('Chart', 'Category/period', 'Users/count'))
        for chart_name, values in data['charts'].items():
            if chart_name == 'last_chats':
                continue
            for item in values:
                category = item.get('name', item.get('month', ''))
                writer.writerow((chart_name, safe_csv_cell(str(category)), item.get('value', item.get('count', ''))))
        return response


class RecordsCsvExportView(APIView):
    """Unfiltered upstream CSV, with separate wording in the frontend."""
    permission_classes = [RequiresCapability]
    required_capability = 'export.records'
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'csv_records'

    def get(self, request):
        try:
            csv_bytes, row_count = get_source_csv()
        except (UpstreamError, ImproperlyConfigured) as exc:
            return Response({'detail': str(exc)}, status=503)
        AccessAuditEvent.objects.create(
            actor=request.user, target=None, action='metrics.records_exported',
            details={'rows': row_count, 'scope': 'full_source'},
        )
        response = HttpResponse(csv_bytes, content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="periodkit-source-users.csv"'
        response['Cache-Control'] = 'private, no-store, max-age=0'
        response['Pragma'] = 'no-cache'
        response['X-Content-Type-Options'] = 'nosniff'
        return response


class FilteredRecordsCsvView(APIView):
    """Filtered participant export from JSON. Never proxy full upstream CSV.

    Admin only, same throttle and audit behaviour as the full source export.
    """
    permission_classes = [RequiresCapability]
    required_capability = 'export.records'
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'csv_records'

    def get(self, request):
        filters = parse_filters(request.query_params)
        try:
            users = select_users(get_source(), filters)
        except (UpstreamError, ImproperlyConfigured) as exc:
            return Response({'detail': str(exc)}, status=503)
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = 'attachment; filename="periodkit-selected-users.csv"'
        response['Cache-Control'] = 'private, no-store, max-age=0'
        response['Pragma'] = 'no-cache'
        response['X-Content-Type-Options'] = 'nosniff'
        writer = csv.writer(response)
        fields = (*ALLOWED_USER_FIELDS, 'country', 'state', 'age_band')
        writer.writerow(fields)
        for user in users:
            record = {**user, **enrich_user(user)}
            writer.writerow([safe_csv_cell(str(record.get(key) if record.get(key) is not None else '')) for key in fields])
        AccessAuditEvent.objects.create(
            actor=request.user, target=None, action='metrics.records_exported',
            details={'rows': len(users), 'scope': 'filtered', 'filter_keys': [
                key for key, value in filters.public().items() if value and not (key == 'date_field' and value == 'registered_at')
            ]},
        )
        return response
