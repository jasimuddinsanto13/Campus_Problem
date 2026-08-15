from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.decorators import login_required
from django.shortcuts import render

from .models import Room

User = get_user_model()


@login_required
def dashboard(request):
    """Render the NITER-Pulse booking dashboard.

    The page chrome is server-rendered; live room availability and bookings
    are fetched from the FastAPI REST layer (see static/booking.js).
    Students keep view-only access — only faculty and admins can lock rooms.
    """
    user = request.user
    context = {
        'rooms_count': Room.objects.count(),
        'api_base': settings.API_BASE_URL,
        'user_role': user.get_role_display(),
        'user_name': user.get_display_name(),
        'user_dept': user.department or '—',
        'can_book': user.role in (User.Role.TEACHER, User.Role.ADMIN),
        'booker_id': user.id,
    }
    return render(request, 'booking/dashboard.html', context)
