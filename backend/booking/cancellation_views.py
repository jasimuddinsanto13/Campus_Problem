"""REST endpoints for Class Cancellation & mass student notification.

Backs the React Faculty + Student dashboards:

    POST /api/teacher/cancel-class/   teacher: save a ClassCancellation and
                                      auto-publish an URGENT notice scoped to
                                      the matching students
    GET  /api/student/cancellations/  student: active (today & upcoming)
                                      cancellations for the student's own
                                      department / batch / section

A cancellation targets exactly the students with
``role='student' AND department/batch/section`` matching the class, which is
the same audience rule the Notice feed applies (see notice_views).
"""

import json
from datetime import date, time

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from booking.fcm import clean_token, push_class_cancellation, register_device_token
from booking.models import ClassCancellation, DeviceToken, Notice, User
from campus_project.firestore_notifications import create_notification

# Departments an admin may target (matches the routine manager / wizard).
DEPARTMENTS = ['CSE', 'EEE', 'TE', 'IPE', 'FDAE']
BATCHES = [str(n) for n in range(17)]
SECTIONS_BY_DEPT = {
    'CSE': ['A', 'B'],
    'EEE': ['A'],
    'TE': ['A', 'B', 'C', 'D'],
    'IPE': ['A', 'B'],
    'FDAE': ['A'],
}

# Python date.weekday() -> the routine grid's day code (Sunday-first week).
_WEEKDAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

# The message template used for the mass student notification.
NOTICE_TEMPLATE = (
    '🚨 CLASS CANCELLATION NOTICE: Your {course} class scheduled for '
    '{date} during {start} – {end} has been CANCELLED by {faculty}. '
    'Reason: {reason}.'
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _payload(request):
    """Accept a JSON body or form fields, whichever the client sent."""
    if (request.content_type or '').startswith('application/json'):
        try:
            return json.loads(request.body or b'{}')
        except ValueError:
            return {}
    return request.POST.dict()


def _author_name(user):
    return user.get_display_name()


def _time24(value):
    return value.strftime('%H:%M')


def _time12(value):
    return value.strftime('%I:%M %p').lstrip('0')


def _parse_time(raw, label):
    """'HH:MM' / 'HH:MM:SS' -> time, or None when invalid."""
    try:
        parts = str(raw).strip().split(':')
        if not parts:
            return None
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour < 24 and 0 <= minute < 60):
            return None
        return time(hour, minute)
    except (ValueError, TypeError, IndexError):
        return None


def _cancellation_payload(cancellation, request=None):
    """Serialized cancellation row for the React pages."""
    return {
        'id': cancellation.id,
        'faculty': _author_name(cancellation.faculty),
        'department': cancellation.department,
        'batch': cancellation.batch,
        'section': cancellation.section,
        'course_code': cancellation.course_code,
        'date': cancellation.date.isoformat(),
        'day': _WEEKDAY_CODES[cancellation.date.weekday()],
        'start_time': _time24(cancellation.start_time),
        'end_time': _time24(cancellation.end_time),
        'start_label': _time12(cancellation.start_time),
        'end_label': _time12(cancellation.end_time),
        'reason': cancellation.reason,
        'reason_label': cancellation.get_reason_display(),
        'reason_note': cancellation.reason_note,
        'created_at': cancellation.created_at.isoformat(),
    }


def _notify_students(cancellation):
    """Publish the URGENT notice scoped to the cancelled class's students.

    Uses the exact audience rule from notice_views: target_role + optional
    department / batch / section narrowing, so only the matched students see
    it in their feed.
    """
    reason = cancellation.get_reason_display()
    if cancellation.reason_note:
        reason += f' — {cancellation.reason_note.strip()}'
    content = NOTICE_TEMPLATE.format(
        course=cancellation.course_code,
        date=f'{cancellation.date:%b %d, %Y}',
        start=_time12(cancellation.start_time),
        end=_time12(cancellation.end_time),
        faculty=_author_name(cancellation.faculty),
        reason=reason,
    )
    return Notice.objects.create(
        created_by=cancellation.faculty,
        title=f'🚨 Class Cancelled — {cancellation.course_code}',
        content=content,
        priority=Notice.Priority.URGENT,
        target_role=Notice.TargetRole.STUDENT,
        department=cancellation.department,
        batch=cancellation.batch,
        section=cancellation.section,
    )


def _targeted_students(cancellation):
    """Active students matching the cancelled class's department/batch/section."""
    return User.objects.filter(
        role=User.Role.STUDENT,
        registration_status=User.RegistrationStatus.APPROVED,
        is_active=True,
        department=cancellation.department,
        batch=cancellation.batch,
        section=cancellation.section,
    )


# ---------------------------------------------------------------------------
# Faculty: cancel a class + notify students
# ---------------------------------------------------------------------------

@require_http_methods(['POST'])
@login_required
def cancel_class_api(request):
    """POST /api/teacher/cancel-class/ — save + notify (teacher only)."""
    if request.user.role != User.Role.TEACHER:
        return JsonResponse({'error': 'Faculty only.'}, status=403)

    data = _payload(request)
    department = str(data.get('department', '')).strip().upper()
    batch = str(data.get('batch', '')).strip()
    section = str(data.get('section', '')).strip().upper()
    course_code = str(data.get('course_code', '')).strip()
    reason = str(data.get('reason', '')).strip()
    reason_note = str(data.get('reason_note', '')).strip()

    if department not in DEPARTMENTS:
        return JsonResponse({'error': 'Pick a valid department.'}, status=400)
    if batch not in BATCHES:
        return JsonResponse({'error': 'Pick a valid batch (0-16).'}, status=400)
    if section not in SECTIONS_BY_DEPT.get(department, []):
        return JsonResponse({'error': f'Pick a valid section for {department}.'}, status=400)
    if not course_code:
        return JsonResponse({'error': 'Course name / code is required.'}, status=400)
    if len(course_code) > 200:
        return JsonResponse({'error': 'Course name is too long.'}, status=400)
    if reason not in ClassCancellation.Reason.values:
        return JsonResponse({'error': 'Pick a valid reason.'}, status=400)

    try:
        cancel_date = date.fromisoformat(str(data.get('date', '')).strip())
    except (ValueError, TypeError):
        return JsonResponse({'error': 'Pick a valid date.'}, status=400)
    if cancel_date < date.today():
        return JsonResponse({'error': 'Cancellation date cannot be in the past.'}, status=400)

    start = _parse_time(data.get('start_time'), 'start time')
    end = _parse_time(data.get('end_time'), 'end time')
    if start is None or end is None:
        return JsonResponse({'error': 'Enter valid start and end times.'}, status=400)
    if start >= end:
        return JsonResponse({'error': 'Start time must be before end time.'}, status=400)

    # One cancellation per class window — never double-notify the students.
    duplicate = ClassCancellation.objects.filter(
        department=department,
        batch=batch,
        section=section,
        course_code=course_code,
        date=cancel_date,
        start_time=start,
        end_time=end,
    ).exists()
    if duplicate:
        return JsonResponse({'error': 'This class was already cancelled.'}, status=409)

    cancellation = ClassCancellation.objects.create(
        faculty=request.user,
        department=department,
        batch=batch,
        section=section,
        course_code=course_code,
        date=cancel_date,
        start_time=start,
        end_time=end,
        reason=reason,
        reason_note=reason_note,
    )
    notice = _notify_students(cancellation)
    cancellation.notice = notice
    cancellation.save(update_fields=['notice'])

    matched = _targeted_students(cancellation)
    notified = matched.count()
    # OS-level push to the matched students' registered devices (best-effort).
    push_class_cancellation(cancellation, list(matched.values_list('id', flat=True)))

    # Also write to Firestore for real-time in-app notification feed.
    student_uids = list(matched.values_list('uid', flat=True))
    create_notification(
        title=f'🚨 Class Cancelled: {cancellation.course_code}',
        body=(
            f'Your {cancellation.start_time.strftime("%I:%M %p").lstrip("0")} – '
            f'{cancellation.end_time.strftime("%I:%M %p").lstrip("0")} class today '
            f'has been cancelled by {_author_name(cancellation.faculty)}.'
        ),
        url='/student/cancellations',
        target_user_ids=student_uids,
        priority='urgent',
        created_by_uid=str(cancellation.faculty.uid),
    )

    return JsonResponse({
        'ok': True,
        'cancellation': _cancellation_payload(cancellation, request),
        'notice_id': notice.id,
        'students_notified': notified,
        'push_targeted': matched.filter(device_tokens__isnull=False).count(),
        'message': f'Class cancelled — {notified} student'
                   f'{"s" if notified != 1 else ""} notified.',
    }, status=201)


# ---------------------------------------------------------------------------
# Faculty: cancellation history + restore (delete)
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def teacher_cancellations_api(request):
    """GET /api/teacher/cancellations/ — the faculty member's own history."""
    if request.user.role != User.Role.TEACHER:
        return JsonResponse({'error': 'Faculty only.'}, status=403)
    cancellations = (
        ClassCancellation.objects.filter(faculty=request.user)
        .select_related('faculty')
        .order_by('-created_at')
    )
    return JsonResponse({
        'cancellations': [_cancellation_payload(c, request) for c in cancellations],
    })


@require_http_methods(['DELETE'])
@login_required
def teacher_cancellation_delete(request, cancellation_id):
    """DELETE /api/teacher/cancellations/<id>/ — restore a cancelled class.

    Only the faculty member who made the cancellation may remove it. Deleting
    also removes the linked URGENT notice (CASCADE), so the class disappears
    from student banners, grids and notice feeds again.
    """
    if request.user.role != User.Role.TEACHER:
        return JsonResponse({'error': 'Faculty only.'}, status=403)
    cancellation = get_object_or_404(ClassCancellation, pk=cancellation_id)
    if cancellation.faculty_id != request.user.id:
        return JsonResponse({'error': 'You can only manage your own cancellations.'}, status=403)

    detail = str(cancellation)
    # Retract the published notice too (CASCADE only fires when the Notice is
    # deleted — the FK lives on the cancellation side), so the class vanishes
    # from student banners, grids and notice feeds.
    notice = cancellation.notice
    cancellation.delete()
    if notice is not None:
        notice.delete()
    return JsonResponse({
        'ok': True,
        'deleted': cancellation_id,
        'message': f'Restored: {detail} — the class is back on student schedules.',
    })


# ---------------------------------------------------------------------------
# Push subscription (FCM device tokens)
# ---------------------------------------------------------------------------

@require_http_methods(['POST'])
@login_required
def push_subscribe_api(request):
    """POST /api/push/subscribe/ — register an FCM token for the user."""
    data = _payload(request)
    token = clean_token(data.get('token'))
    platform = str(data.get('platform', 'web')).strip()[:20] or 'web'
    if token is None:
        return JsonResponse({'error': 'A valid device token is required.'}, status=400)

    # A token is unique per device: if it was previously registered by another
    # user on this device, ownership moves to the current sign-in (shared
    # device / re-login semantics).
    register_device_token(request.user, token, platform)
    return JsonResponse({'ok': True, 'message': 'Push notifications enabled.'})


@require_http_methods(['POST'])
@login_required
def push_unsubscribe_api(request):
    """POST /api/push/unsubscribe/ — forget a token (no-op when unknown)."""
    data = _payload(request)
    token = str(data.get('token', '')).strip()
    if token:
        DeviceToken.objects.filter(token=token, user=request.user).delete()
    return JsonResponse({'ok': True, 'message': 'Push notifications disabled.'})


# ---------------------------------------------------------------------------
# Student: active cancellations for the signed-in student
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def student_cancellations_api(request):
    """GET /api/student/cancellations/ — today & upcoming (student only).

    Scoped to the signed-in student's registered department / batch / section,
    so the dashboard banner and routine grid only ever show relevant rows.
    """
    user = request.user
    if user.role != User.Role.STUDENT:
        return JsonResponse({'error': 'Students only.'}, status=403)

    department = (user.department or '').strip().upper()
    batch = (user.batch or '').strip()
    section = (user.section or '').strip().upper()

    if department not in DEPARTMENTS or batch not in BATCHES \
            or section not in SECTIONS_BY_DEPT.get(department, []):
        # A student without a valid registration simply has no cancellations.
        return JsonResponse({'cancellations': []})

    cancellations = (
        ClassCancellation.objects.filter(
            department=department,
            batch=batch,
            section=section,
            date__gte=date.today(),
        )
        .select_related('faculty')
        .order_by('date', 'start_time')
    )
    return JsonResponse({
        'cancellations': [_cancellation_payload(c, request) for c in cancellations],
    })
