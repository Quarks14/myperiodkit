from django.urls import path
from .views import (
    OverviewView, SummaryExportView, UserRowsView,
    RecordsCsvExportView, FilteredRecordsCsvView,
)

urlpatterns = [
    path('overview/', OverviewView.as_view()),
    path('users/', UserRowsView.as_view()),
    path('export/', SummaryExportView.as_view()),
    path('export/records/', RecordsCsvExportView.as_view()),
    path('export/selected/', FilteredRecordsCsvView.as_view()),
]
