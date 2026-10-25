from django.contrib import admin
from django.urls import path,include
urlpatterns=[path('django-admin/',admin.site.urls),path('api/auth/',include('accounts.urls')),path('api/metrics/',include('metrics.urls'))]
