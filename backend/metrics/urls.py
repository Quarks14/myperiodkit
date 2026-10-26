from django.urls import path
from .views import (
    OverviewView, SummaryExportView, UserRowsView,
    RecordsCsvExportView, FilteredRecordsCsvView,
    SyncStatusView, SyncSettingsView, SyncRunNowView,
)

urlpatterns = [
    path('overview/', OverviewView.as_view()),
    path('sync/status/', SyncStatusView.as_view()),
    path('sync/settings/', SyncSettingsView.as_view()),
    path('sync/run/', SyncRunNowView.as_view()),
    path('users/', UserRowsView.as_view()),
    path('export/', SummaryExportView.as_view()),
    path('export/records/', RecordsCsvExportView.as_view()),
    path('export/selected/', FilteredRecordsCsvView.as_view()),
]
