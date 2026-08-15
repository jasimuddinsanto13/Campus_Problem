"""Admin room-booking endpoints + the exam-conflict override pipeline.

Backs the React admin page at /admin/room-booking and the faculty
displaced-class workflow:

    GET   /api/room-booking/rooms/                every bookable room
    POST  /api/admin/room-booking/create/         admin-only instant booking
    GET   /api/room-booking/displaced/            displaced classes (own / all)

Admin booking flow
------------------
1. The admin picks a room + date/time slot and purpose (exam / event / extra).
2. ``_occupancy`` (shared with the faculty availability search) decides:
   * Free window            -> request created directly as ``approved``.
   * A regular class in it  -> the class is *overridden*: the request is still
     created as ``approved`` (tagged ``is_override``), a ``DisplacedClass``
     row is written for the affected faculty (matched from the routine slot's
     plain-text teacher name), and the faculty dashboard shows a replacement
     banner for that window.
   * Any other occupant (another request / one-off booking / legacy routine)
     -> rejected with a 409; only regular classes can be overridden.
"""

import json

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.db.models import Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from booking.api_views import (
    AVAILABLE_DEPARTMENTS,
    DAY_LABELS,
    DEPT_SECTIONS,
    GRID_DAYS,
    _PY_WEEKDAY_TO_CODE,
    _occupancy,
    _parse_time,
    _request_payload,
)
from booking.models import DisplacedClass, ExtraClassRequest, Room, RoutineSlot, User

# Admin form purpose -> ExtraClassRequest reason.
PURPOSES = {
    'exam': ExtraClassRequest.Reason.EXAM,
    'event': ExtraClassRequest.Reason.EVENT,
    'extra': ExtraClassRequest.Reason.EXTRA,
}

PURPOSE_LABELS = {
    'exam': 'Exam / Quiz',
    'event': 'Special Event',
    'extra': 'Extra Class',
}


def _match_faculty(name):
    """Best-effort match of a routine slot's plain-text teacher to a User.

    RoutineSlot.faculty stores a display name (\"Ayesha Rahman\"), not a
    foreign key — the demo seed and the admin wizard both write names here.
    Match against username / email / full_name / first+last name so the
    displaced-faculty notification reaches the right account (or None when
    the teacher has no account yet).
    """
    name = (name or '').strip()
    if not name:
        return None
    parts = [p for p in name.replace('.', ' ').split() if p]
    if not parts:
        return None
    query = Q(username__iexact=name) | Q(email__iexact=name) | Q(full_name__iexact=name)
    if len(parts) > 1:
        query |= Q(first_name__iexact=parts[0], last_name__iexact=' '.join(parts[1:]))
    return User.objects.filter(role=User.Role.TEACHER).filter(query).first()


def _displaced_payload(d):
    """Serialized displaced-class row for the React pages."""
    return {
        'id': d.id,
        'subject': d.subject,
        'department': d.department,
        'batch': d.batch,
        'section': d.section,
        'room_number': d.room.room_number,
        'building': d.room.building,
        'day': d.day,
        'day_label': DAY_LABELS.get(d.day, d.day),
        'date': d.date.isoformat(),
        'start_time': d.start_time.strftime('%H:%M'),
        'end_time': d.end_time.strftime('%H:%M'),
        'status': d.status,
        'status_label': d.get_status_display(),
        'faculty_id': d.faculty_id,
        'faculty_name': d.faculty.get_display_name() if d.faculty else '',
        'request_id': d.request_id,
    }


# ---------------------------------------------------------------------------
# Rooms dropdown
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def rooms_api(request):
    """GET /api/room-booking/rooms/ -> every bookable campus room."""
    rooms = Room.objects.all()
    return JsonResponse({
        'rooms': [
            {
                'id': room.id,
                'room_number': room.room_number,
                'building': room.building,
                'capacity': room.capacity,
            }
            for room in rooms
        ],
    })


# ---------------------------------------------------------------------------
# Admin instant booking (+ exam conflict override)
# ---------------------------------------------------------------------------

@require_http_methods(['POST'])
@login_required
def admin_booking_create(request):
    """POST /api/admin/room-booking/create/  (admins only).

    Body: purpose, room_id, department, batch, section, subject, notes,
    date (YYYY-MM-DD), start_time, end_time (HH:MM).

    Creates the booking as *approved* immediately. When ``purpose`` is exam
    and the window is occupied by a regular master-routine class, the class
    is overridden and a DisplacedClass row + faculty notification is created.
    """
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Only admins can create bookings directly.'}, status=403)
    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    purpose = str(payload.get('purpose', '')).strip()
    room_id = payload.get('room_id')
    department = str(payload.get('department', '')).strip().upper()
    batch = str(payload.get('batch', '')).strip()
    section = str(payload.get('section', 'A')).strip().upper()
    subject = str(payload.get('subject', '')).strip()
    notes = str(payload.get('notes', '')).strip()
    date_raw = str(payload.get('date', '')).strip()

    if purpose not in PURPOSES:
        return JsonResponse(
            {'error': 'Pick a valid purpose (exam / event / extra).'}, status=400
        )
    try:
        room = Room.objects.get(pk=room_id)
    except (ValueError, TypeError, ObjectDoesNotExist):
        return JsonResponse({'error': 'Pick a valid room.'}, status=400)
    if department not in AVAILABLE_DEPARTMENTS:
        return JsonResponse({'error': 'Pick a valid department.'}, status=400)
    if not batch:
        return JsonResponse({'error': 'Batch number is required.'}, status=400)
    if section not in DEPT_SECTIONS.get(department, []):
        return JsonResponse({'error': f'Pick a valid section for {department}.'}, status=400)
    if not subject:
        return JsonResponse({'error': 'Course / subject name is required.'}, status=400)
    try:
        start = _parse_time(payload.get('start_time'), 'start time')
        end = _parse_time(payload.get('end_time'), 'end time')
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    if start >= end:
        return JsonResponse({'error': 'Start time must be before end time.'}, status=400)
    try:
        date_obj = timezone.datetime.strptime(date_raw, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Pick a valid date.'}, status=400)
    if date_obj < timezone.localdate():
        return JsonResponse({'error': 'The date cannot be in the past.'}, status=400)
    day = _PY_WEEKDAY_TO_CODE[date_obj.weekday()]
    if day not in GRID_DAYS:
        return JsonResponse(
            {'error': 'Bookings run Sunday–Thursday or Saturday (no Friday).'}, status=400
        )
    now_local = timezone.localtime()
    if date_obj == now_local.date() and start <= now_local.time():
        return JsonResponse({'error': 'That time has already passed today.'}, status=400)

    # What (if anything) is scheduled in [room, date, slot]?
    occupied_by = _occupancy(room, day, start, end, date=date_obj)
    displaced_slot = None
    if occupied_by is not None:
        # Only a regular master-routine class may be overridden — and only by
        # an Exam / Quiz booking (not by events or extra classes).
        displaced_slot = (
            RoutineSlot.objects.filter(
                room=room.room_number,
                day=day,
                start_time__lt=end,
                end_time__gt=start,
            ).order_by('start_time').first()
        )
        if purpose != 'exam' or displaced_slot is None:
            return JsonResponse(
                {'error': f'That window is not free — {occupied_by}.'},
                status=409,
            )

    # Approved booking + displaced-class flag are created together so the
    # override never exists without its faculty notification.
    with transaction.atomic():
        request_obj = ExtraClassRequest.objects.create(
            faculty=request.user,
            room=room,
            department=department,
            batch=batch,
            section=section,
            subject=subject[:100],
            reason=PURPOSES[purpose],
            notes=notes[:500],
            is_override=displaced_slot is not None,
            day=day,
            date=date_obj,
            start_time=start,
            end_time=end,
            status=ExtraClassRequest.Status.APPROVED,
        )

        displaced = None
        if displaced_slot is not None:
            displaced = DisplacedClass.objects.create(
                faculty=_match_faculty(displaced_slot.faculty),
                slot=displaced_slot,
                subject=displaced_slot.subject,
                department=displaced_slot.department,
                batch=displaced_slot.batch,
                section=displaced_slot.section,
                room=room,
                day=day,
                date=date_obj,
                start_time=displaced_slot.start_time,
                end_time=displaced_slot.end_time,
            )

    displaced_payload = _displaced_payload(displaced) if displaced else None
    if displaced is not None:
        faculty_name = displaced_payload['faculty_name']
        message = (
            f'Exam override — {displaced.subject} was displaced'
            f'{" and " + faculty_name + " notified" if faculty_name else ""}.'
        )
    else:
        message = 'Booking created and approved — the room is locked for that slot.'

    return JsonResponse({
        'ok': True,
        'created': 'override' if displaced is not None else 'approved',
        'request': _request_payload(request_obj),
        'displaced': displaced_payload,
        'message': message,
    }, status=201)


# ---------------------------------------------------------------------------
# Displaced classes (faculty replacement workflow)
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def displaced_classes_api(request):
    """GET /api/room-booking/displaced/

    Teachers: their own pending displaced classes (the dashboard banner +
    room-booking pre-fill read this). Admins: every displaced class.
    """
    queryset = DisplacedClass.objects.select_related('room', 'faculty', 'request')
    if request.user.role == User.Role.TEACHER:
        queryset = queryset.filter(
            faculty=request.user, status=DisplacedClass.Status.PENDING
        )
    elif request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Not allowed.'}, status=403)
    return JsonResponse({
        'displaced': [_displaced_payload(d) for d in queryset.order_by('-created_at')],
    })
