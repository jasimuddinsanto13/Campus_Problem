from django.urls import path
from django.views.generic import RedirectView

app_name = 'faculty_portal'

urlpatterns = [
    # Deprecated legacy dashboard — faculty land on the React faculty portal.
    path('', RedirectView.as_view(url='/faculty/dashboard', permanent=False), name='faculty_dashboard'),
]
