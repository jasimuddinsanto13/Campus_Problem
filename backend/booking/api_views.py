"""REST endpoints for the Faculty Room Booking page (extra / reschedule classes).

Backs the React dashboard pages at /faculty/room-booking and /admin/room-booking:

    GET    /api/room-booking/availability/              rooms free in a weekly slot
    GET    /api/room-booking/requests/                  request list (faculty: own, admin: all;
                                                        ?include=trashed adds trashed rows)
    POST   /api/room-booking/requests/                  submit an extra-class request
    PATCH  /api/room-booking/requests/<id>/             cancel / undo (owner) and
                                                        approve / reject / trash / restore /
                                                        delete (admin)

Availability is computed from the published master routines (RoutineSlot rows the
admin wizard writes, plus the legacy Routine rows), one-off RoomBooking rows for
the next occurrence of the weekday, and already-approved/pending extra-class
requests — so a room never appears free twice for the same window.
"""

import json
from datetime import time as dt_time, timedelta

from django.contrib.auth.decorators import login_required
from django.core.exceptions import ObjectDoesNotExist
from django.db import transaction
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.views.decorators.http import require_http_methods

from booking.models import DisplacedClass, ExtraClassRequest, Notice, Room, RoomBooking, Routine, RoutineSlot, User

# Departments with a published routine (mirrors the admin routine manager).
AVAILABLE_DEPARTMENTS = ['CSE', 'EEE', 'TE', 'IPE', 'FDAE']
# Sections offered per department, used to validate the target class.
DEPT_SECTIONS = {
    'CSE': ['A', 'B'],
    'EEE': ['A'],
    'TE': ['A', 'B', 'C', 'D'],
    'IPE': ['A', 'B'],
    'FDAE': ['A'],
}
# Weekly grid days: Sunday to Thursday plus Saturday (no Friday).
GRID_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'SAT']
DAY_LABELS = {
    'SUN': 'Sunday', 'MON': 'Monday', 'TUE': 'Tuesday', 'WED': 'Wednesday',
    'THU': 'Thursday', 'FRI': 'Friday', 'SAT': 'Saturday',
}
# Python weekday() -> Django day code (Monday == 0).
_PY_WEEKDAY_TO_CODE = {0: 'MON', 1: 'TUE', 2: 'WED', 3: 'THU', 4: 'FRI', 5: 'SAT', 6: 'SUN'}

STATUS_LABELS = {
    ExtraClassRequest.Status.PENDING: 'Pending Admin Approval',
    ExtraClassRequest.Status.APPROVED: 'Approved',
    ExtraClassRequest.Status.REJECTED: 'Rejected',
    ExtraClassRequest.Status.CANCELLED: 'Cancelled',
}
REASON_LABELS = {
    ExtraClassRequest.Reason.MAKEUP: 'Rescheduled Class',
    ExtraClassRequest.Reason.EXTRA: 'Extra Class',
    ExtraClassRequest.Reason.EXAM: 'Exam/Quiz',
    ExtraClassRequest.Reason.EVENT: 'Special Event',
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_time(raw, label='time'):
    """Parse an 'HH:MM' string into a datetime.time (raises ValueError)."""
    try:
        parts = str(raw or '').strip().split(':')
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour < 24 and 0 <= minute < 60):
            raise ValueError
        return dt_time(hour, minute)
    except (ValueError, TypeError, IndexError):
        raise ValueError(f'{label} must be a valid time (HH:MM).')


def _next_occurrence(day):
    """The next calendar date (today or later) whose weekday is ``day``."""
    target = {code: i for i, code in _PY_WEEKDAY_TO_CODE.items()}[day]
    today = timezone.localdate()
    return today + timedelta(days=(target - today.weekday()) % 7)


def _occupant_label(kind, obj):
    """Human-readable label for an occupant row."""
    if kind == 'slot':
        return (
            f'{obj.subject} · {obj.department} {obj.batch}({obj.section}) '
            f'· {obj.start_time:%H:%M}-{obj.end_time:%H:%M}'
        )
    if kind == 'routine':
        return (
            f'{obj.subject} · {obj.department} {obj.section} '
            f'· {obj.start_time:%H:%M}-{obj.end_time:%H:%M}'
        )
    if kind == 'booking':
        return (
            f'One-off booking · {obj.department or obj.batch_section or "class"} '
            f'· {obj.start_time:%H:%M}-{obj.end_time:%H:%M}'
        )
    return (
        f'{obj.subject} ({REASON_LABELS[obj.reason].lower()}) '
        f'· {obj.start_time:%H:%M}-{obj.end_time:%H:%M}'
    )


def _availability_map(rooms, day, start, end, date=None, exclude_id=None):
    """Map room id -> earliest occupant label for the window (bulk queries).

    Checks, in priority order: master routine slots (RoutineSlot, then the
    legacy Routine rows), one-off RoomBooking rows (for the concrete ``date``
    or the next occurrence of ``day``), and approved/pending extra-class
    requests (optionally skipping ``exclude_id`` — used when re-opening a
    slot during an undo). Rooms with no occupant are simply absent from the map.

    Note: RoutineSlot rows match rooms by their plain-text ``room`` string,
    compared exactly against ``Room.room_number`` — a routine saved under a
    differently-spelled room name ("Room C-201" vs "C-201") would be missed.
    """
    busy: dict[int, str] = {}
    room_ids = [r.id for r in rooms]
    room_id_by_number = {r.room_number: r.id for r in rooms}
    overlap = dict(start_time__lt=end, end_time__gt=start)

    # 1. Master routines (RoutineSlot — the admin routine manager), keyed by
    #    the plain-text room number.
    for slot in (
        RoutineSlot.objects.filter(day=day, **overlap).order_by('start_time')
    ):
        room_id = room_id_by_number.get(slot.room)
        if room_id is not None and room_id not in busy:
            busy[room_id] = _occupant_label('slot', slot)

    # 2. Legacy weekly routines (booking_routine rows) — FK to Room.
    for routine in (
        Routine.objects.filter(room_id__in=room_ids, day=day, **overlap)
        .order_by('start_time')
    ):
        busy.setdefault(routine.room_id, _occupant_label('routine', routine))

    # 3. One-off bookings on the concrete date (or the next weekday occurrence).
    target_date = date or _next_occurrence(day)
    for booking in (
        RoomBooking.objects.filter(room_id__in=room_ids, date=target_date, **overlap)
        .order_by('start_time')
    ):
        busy.setdefault(booking.room_id, _occupant_label('booking', booking))

    # 4. Approved / pending extra-class requests for the same weekday window.
    #    Trashed requests are treated as removed — their slot is free again.
    request_qs = ExtraClassRequest.objects.filter(
        room_id__in=room_ids,
        day=day,
        status__in=[ExtraClassRequest.Status.PENDING, ExtraClassRequest.Status.APPROVED],
        trashed_at__isnull=True,
        **overlap,
    )
    if exclude_id is not None:
        request_qs = request_qs.exclude(pk=exclude_id)
    for request_obj in request_qs.order_by('start_time'):
        busy.setdefault(request_obj.room_id, _occupant_label('request', request_obj))

    return busy


def _occupancy(room, day, start, end, date=None, exclude_id=None):
    """Occupant label for a single room in the window, or None when free."""
    return _availability_map(
        [room], day, start, end, date=date, exclude_id=exclude_id
    ).get(room.id)


def _request_payload(request_obj):
    """Serialized extra-class request row for the React pages."""
    return {
        'id': request_obj.id,
        'room_id': request_obj.room_id,
        'room_number': request_obj.room.room_number,
        'building': request_obj.room.building,
        'department': request_obj.department,
        'batch': request_obj.batch,
        'section': request_obj.section,
        'subject': request_obj.subject,
        'reason': request_obj.reason,
        'reason_label': REASON_LABELS.get(request_obj.reason, request_obj.reason),
        'day': request_obj.day,
        'day_label': DAY_LABELS.get(request_obj.day, request_obj.day),
        'date': request_obj.date.isoformat(),
        'start_time': request_obj.start_time.strftime('%H:%M'),
        'end_time': request_obj.end_time.strftime('%H:%M'),
        'status': request_obj.status,
        'status_label': STATUS_LABELS.get(request_obj.status, request_obj.status),
        'notes': request_obj.notes,
        'is_override': request_obj.is_override,
        'requester_role': request_obj.faculty.role,
        'trashed': request_obj.trashed_at is not None,
        'trashed_at': (
            request_obj.trashed_at.isoformat() if request_obj.trashed_at else None
        ),
        'faculty_id': request_obj.faculty_id,
        'faculty_name': request_obj.faculty.get_display_name(),
        'created_at': request_obj.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Availability
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def availability_api(request):
    """GET /api/room-booking/availability/?day=SUN&start=09:00&end=10:00&building=

    Returns every room with its capacity and whether the weekly window is free
    (no master routine, one-off booking, or extra-class request overlaps it).
    """
    day = request.GET.get('day', 'SUN').strip().upper()
    if day not in GRID_DAYS:
        return JsonResponse({'error': 'Pick a valid day (Sun–Thu or Saturday).'}, status=400)
    try:
        start = _parse_time(request.GET.get('start', '09:00'), 'start time')
        end = _parse_time(request.GET.get('end', '10:00'), 'end time')
    except ValueError as exc:
        return JsonResponse({'error': str(exc)}, status=400)
    if start >= end:
        return JsonResponse({'error': 'Start time must be before end time.'}, status=400)
    building = request.GET.get('building', '').strip()

    rooms = Room.objects.all()
    if building:
        rooms = rooms.filter(building__iexact=building)

    busy = _availability_map(list(rooms), day, start, end)
    result = [
        {
            'id': room.id,
            'room_number': room.room_number,
            'building': room.building,
            'capacity': room.capacity,
            'free': room.id not in busy,
            'occupied_by': busy.get(room.id),
        }
        for room in rooms
    ]

    buildings = list(
        Room.objects.order_by('building').values_list('building', flat=True).distinct()
    )
    return JsonResponse({
        'day': day,
        'start': start.strftime('%H:%M'),
        'end': end.strftime('%H:%M'),
        'buildings': buildings,
        'rooms': result,
    })


# ---------------------------------------------------------------------------
# Requests (list + create)
# ---------------------------------------------------------------------------

@require_http_methods(['GET', 'POST'])
@login_required
def extra_class_requests_api(request):
    """GET /api/room-booking/requests/ and POST /api/room-booking/requests/.

    GET  -> the signed-in faculty member's requests; admins see all requests.
    POST -> submit a new extra-class request (faculty and admins).
    """
    if request.method == 'GET':
        queryset = ExtraClassRequest.objects.select_related('room', 'faculty')
        if request.user.role != User.Role.ADMIN:
            queryset = queryset.filter(faculty=request.user)
        # Live lists exclude trashed rows unless the caller opts in.
        if request.GET.get('include') != 'trashed':
            queryset = queryset.filter(trashed_at__isnull=True)
        return JsonResponse({'requests': [_request_payload(r) for r in queryset]})

    # ---- POST: create a request ----
    if request.user.role not in (User.Role.TEACHER, User.Role.ADMIN):
        return JsonResponse({'error': 'Only faculty can request extra classes.'}, status=403)
    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    room_id = payload.get('room_id')
    department = str(payload.get('department', '')).strip().upper()
    batch = str(payload.get('batch', '')).strip()
    section = str(payload.get('section', 'A')).strip().upper()
    subject = str(payload.get('subject', '')).strip()
    reason = str(payload.get('reason', '')).strip()
    day = str(payload.get('day', '')).strip().upper()
    date_raw = str(payload.get('date', '')).strip()
    displaced_id = payload.get('displaced_id')
    # The faculty modal books instantly: when a real JSON boolean true is
    # sent, the request is created as Approved and the room is locked
    # immediately (no admin approval step).
    auto_approve = payload.get('auto_approve') is True

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
    if reason not in ExtraClassRequest.Reason.values:
        return JsonResponse({'error': 'Pick a valid reason.'}, status=400)
    if day not in GRID_DAYS:
        return JsonResponse({'error': 'Pick a valid day (Sun–Thu or Saturday).'}, status=400)
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
    # The day picker and the concrete date must agree on the weekday.
    if _PY_WEEKDAY_TO_CODE[date_obj.weekday()] != day:
        return JsonResponse({'error': 'The date must fall on the selected day.'}, status=400)
    # A slot earlier today has already started — reject it.
    now_local = timezone.localtime()
    if date_obj == now_local.date() and start <= now_local.time():
        return JsonResponse({'error': 'That time has already passed today.'}, status=400)

    # Optional: the teacher is replacing a class displaced by an admin exam.
    # Must belong to them, still be awaiting a replacement, and cover the
    # exact displaced window — otherwise a teacher could resolve the wrong
    # class by booking an unrelated slot.
    displaced_obj = None
    if displaced_id:
        try:
            displaced_obj = DisplacedClass.objects.get(pk=displaced_id)
        except (ValueError, TypeError, ObjectDoesNotExist):
            return JsonResponse({'error': 'Pick a valid displaced class.'}, status=400)
        if displaced_obj.faculty_id != request.user.id:
            return JsonResponse(
                {'error': 'That displaced class is not yours.'}, status=403
            )
        if displaced_obj.status != DisplacedClass.Status.PENDING:
            return JsonResponse(
                {'error': 'That displaced class has already been rescheduled.'}, status=400
            )
        if (
            day != displaced_obj.day
            or date_obj != displaced_obj.date
            or start != displaced_obj.start_time
            or end != displaced_obj.end_time
        ):
            return JsonResponse(
                {'error': 'The replacement must cover the same date and time as the displaced class.'},
                status=400,
            )

    # Race guard: the room must still be free for the requested window.
    occupied_by = _occupancy(room, day, start, end, date=date_obj)
    if occupied_by is not None:
        return JsonResponse(
            {'error': f'That window is no longer free — {occupied_by}.'},
            status=409,
        )

    # Create the request and resolve the displaced class atomically — locking
    # the displaced row so two submissions can never both resolve it.
    with transaction.atomic():
        if displaced_obj is not None:
            displaced_obj = DisplacedClass.objects.select_for_update().get(pk=displaced_obj.pk)
            if displaced_obj.status != DisplacedClass.Status.PENDING:
                return JsonResponse(
                    {'error': 'That displaced class has already been rescheduled.'}, status=400
                )

        status = (
            ExtraClassRequest.Status.APPROVED
            if auto_approve
            else ExtraClassRequest.Status.PENDING
        )
        request_obj = ExtraClassRequest.objects.create(
            faculty=request.user,
            room=room,
            department=department,
            batch=batch,
            section=section,
            subject=subject[:100],
            reason=reason,
            day=day,
            date=date_obj,
            start_time=start,
            end_time=end,
            status=status,
        )

        message = (
            'Room booked — the slot is now locked.'
            if status == ExtraClassRequest.Status.APPROVED
            else 'Request submitted — awaiting admin approval.'
        )
        if displaced_obj is not None:
            # The displaced class is now covered: link the replacement request
            # and tell the enrolled students where the class moved.
            displaced_obj.status = DisplacedClass.Status.RESCHEDULED
            displaced_obj.request = request_obj
            displaced_obj.save(update_fields=['status', 'request'])
            day_label = DAY_LABELS.get(displaced_obj.day, displaced_obj.day)
            Notice.objects.create(
                title=f'Class relocated: {displaced_obj.subject}',
                content=(
                    f'Your {displaced_obj.subject} class on {displaced_obj.date:%A, %b %d, %Y} '
                    f'({day_label} {displaced_obj.start_time:%H:%M}–{displaced_obj.end_time:%H:%M}) '
                    f'has moved to Room {request_obj.room.room_number} '
                    f'({request_obj.room.building}). Please attend the class at the new room.'
                ),
                priority=Notice.Priority.NORMAL,
                target_role=Notice.TargetRole.STUDENT,
                department=displaced_obj.department,
                batch=displaced_obj.batch,
                section=displaced_obj.section,
                created_by=request.user,
            )
            message = (
                'Replacement submitted — the displaced class is covered and students have been notified.'
            )

    return JsonResponse(
        {'ok': True, 'request': _request_payload(request_obj), 'message': message},
        status=201,
    )


# ---------------------------------------------------------------------------
# Request actions (cancel / approve / reject)
# ---------------------------------------------------------------------------

@require_http_methods(['PATCH'])
@login_required
def extra_class_request_action(request, request_id):
    """PATCH /api/room-booking/requests/<id>/  body: {"action": "..."}

    Actions:
      * cancel  — owner or admin: pending/approved -> cancelled (slot freed)
      * undo    — owner or admin: approved/rejected/cancelled -> pending
                  (re-locks the slot; blocked if the window was taken meanwhile)
      * trash   — owner or admin: any request -> trash (hidden, recoverable)
      * restore — owner or admin: trashed request -> back to live list
      * approve / reject   — admin only, pending -> approved / rejected
      * delete  — admin only: permanently remove a trashed request
    """
    request_obj = get_object_or_404(
        ExtraClassRequest.objects.select_related('room', 'faculty'), pk=request_id
    )
    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)
    action = str(payload.get('action', '')).strip()

    is_admin = request.user.role == User.Role.ADMIN
    is_owner = (
        request.user.role == User.Role.TEACHER
        and request_obj.faculty_id == request.user.id
    )
    if not (is_admin or is_owner):
        if request.user.role == User.Role.TEACHER:
            return JsonResponse(
                {'error': 'You can only manage your own requests.'}, status=403
            )
        return JsonResponse({'error': 'Students cannot manage bookings.'}, status=403)

    allowed = (
        {'cancel', 'undo', 'trash', 'restore'}
        if is_owner
        else {'cancel', 'approve', 'reject', 'undo', 'trash', 'restore', 'delete'}
    )
    if action not in allowed:
        return JsonResponse({'error': 'Unknown action.'}, status=400)

    Status = ExtraClassRequest.Status

    if action == 'cancel':
        if request_obj.trashed_at is not None:
            return JsonResponse({'error': 'This request is in the trash.'}, status=400)
        if request_obj.status not in (Status.PENDING, Status.APPROVED):
            return JsonResponse(
                {'error': 'This request can no longer be cancelled.'}, status=400
            )
        request_obj.status = Status.CANCELLED
    elif action == 'approve':
        if request_obj.trashed_at is not None or request_obj.status != Status.PENDING:
            return JsonResponse(
                {'error': 'Only pending requests can be approved.'}, status=400
            )
        request_obj.status = Status.APPROVED
    elif action == 'reject':
        if request_obj.trashed_at is not None or request_obj.status != Status.PENDING:
            return JsonResponse(
                {'error': 'Only pending requests can be rejected.'}, status=400
            )
        request_obj.status = Status.REJECTED
        # If this request was the replacement for a displaced class, rejecting
        # it puts the class back on the faculty's plate (Pending Reschedule)
        # instead of leaving it silently resolved without a new room.
        request_obj.displacements.filter(status=DisplacedClass.Status.RESCHEDULED).update(
            status=DisplacedClass.Status.PENDING,
            request=None,
        )
    elif action == 'undo':
        if request_obj.status == Status.PENDING:
            return JsonResponse(
                {'error': 'This request is already pending.'}, status=400
            )
        # Faculty may only undo their own cancellations — reopening a
        # rejection is the admin's call.
        if is_owner and request_obj.status != Status.CANCELLED:
            return JsonResponse(
                {'error': 'You can only undo a cancelled request.'}, status=403
            )
        # Re-opening the slot: fail if the window got taken by someone else
        # (another request, a routine edit, or a one-off booking).
        occupied_by = _occupancy(
            request_obj.room,
            request_obj.day,
            request_obj.start_time,
            request_obj.end_time,
            date=request_obj.date,
            exclude_id=request_obj.id,
        )
        if occupied_by is not None:
            return JsonResponse(
                {'error': f'The slot is taken again — {occupied_by}.'},
                status=409,
            )
        request_obj.status = Status.PENDING
    elif action == 'trash':
        if request_obj.trashed_at is not None:
            return JsonResponse(
                {'error': 'This request is already in the trash.'}, status=400
            )
        request_obj.trashed_at = timezone.now()
    elif action == 'restore':
        if request_obj.trashed_at is None:
            return JsonResponse(
                {'error': 'This request is not in the trash.'}, status=400
            )
        # Trashing freed the slot — a pending/approved request can only come
        # back if the window is still free (never double-book).
        if request_obj.status in (Status.PENDING, Status.APPROVED):
            occupied_by = _occupancy(
                request_obj.room,
                request_obj.day,
                request_obj.start_time,
                request_obj.end_time,
                date=request_obj.date,
                exclude_id=request_obj.id,
            )
            if occupied_by is not None:
                return JsonResponse(
                    {'error': f'The slot was taken while in trash — {occupied_by}.'},
                    status=409,
                )
        request_obj.trashed_at = None
    elif action == 'delete':
        if request_obj.trashed_at is None:
            return JsonResponse(
                {'error': 'Only trashed requests can be deleted.'}, status=400
            )
        request_obj.delete()
        return JsonResponse({'ok': True, 'deleted': True})

    request_obj.save()
    return JsonResponse({'ok': True, 'request': _request_payload(request_obj)})
