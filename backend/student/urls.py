from django.urls import path
from django.views.generic import RedirectView

app_name = 'student_portal'

urlpatterns = [
    # Deprecated legacy dashboard — students land on the React student portal.
    path('', RedirectView.as_view(url='/student/dashboard', permanent=False), name='student_dashboard'),
]
