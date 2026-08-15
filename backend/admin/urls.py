from django.urls import path
from django.views.generic import RedirectView

from . import views

app_name = 'admin_portal'

urlpatterns = [
    # The legacy admin dashboard was deprecated — admins land on the React
    # admin portal dashboard instead.
    path('', RedirectView.as_view(url='/admin/dashboard', permanent=False), name='admin_dashboard'),
    path('settings/', views.settings_view, name='settings'),
    path('approve/<int:user_id>/', views.approve_user, name='approve_user'),
    path('reject/<int:user_id>/', views.reject_user, name='reject_user'),
    path('users/', views.admin_users, name='admin_users'),
    path('routines/', views.admin_routines, name='admin_routines'),
    path('routines/<int:routine_id>/delete/', views.delete_routine, name='delete_routine'),
    path('bookings/<int:booking_id>/delete/', views.delete_booking, name='delete_booking'),
]
