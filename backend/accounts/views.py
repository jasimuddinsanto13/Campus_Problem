"""
3-tier role-based authentication for the campus platform.

Roles: student, teacher (faculty), admin.
Workflow:
  * Students & faculty register as "pending" and stay inactive until an
    admin approves them from the admin portal.
  * Admin registrations are auto-approved on the spot, but only when a valid
    passkey is supplied — an active key in the booking_adminpasskey table
    (seeded with add001–add010), or the legacy ADMIN_PASSKEY env var when it
    is explicitly configured.
  * Login requires the correct role to be selected and an approved account.

After login everyone lands on the single modern dashboard served at '/' (the
React app on port 8000). The legacy role portals (admin/, faculty/, student/)
were deprecated and their landing routes now redirect to '/'.
"""

import json
import os
from datetime import time

from django.conf import settings
from django.contrib import messages
from django.contrib.auth import get_user_model, login, logout
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_http_methods
from PIL import Image

from booking.fcm import clean_token, register_device_token
from booking.models import AdminPasskey, MealCancellation, RegistrationRequest, Room, RoutineSlot

User = get_user_model()


def _valid_admin_passkey(passkey):
    """True when the key is an active DB passkey, or the legacy ADMIN_PASSKEY
    env var (only honored when explicitly configured — never the default)."""
    if AdminPasskey.objects.filter(code__iexact=passkey, is_active=True).exists():
        return True
    return 'ADMIN_PASSKEY' in os.environ and passkey == settings.ADMIN_PASSKEY

# Display labels for the login/registration role selector.
ROLE_LABELS = {
    User.Role.STUDENT: 'Student',
    User.Role.TEACHER: 'Faculty',
    User.Role.ADMIN: 'Admin',
}
ROLE_CHOICES = [(key, label) for key, label in ROLE_LABELS.items()]

AUTH_BACKEND = 'django.contrib.auth.backends.ModelBackend'


def _role_dashboard(user):
    """Where each role lands after login, in the React app on port 8000."""
    return {
        User.Role.ADMIN: '/admin/dashboard',
        User.Role.TEACHER: '/faculty/dashboard',
        User.Role.STUDENT: '/student/dashboard',
    }.get(user.role, '/admin/dashboard')


def home(request):
    """Site root entry point.

    Not signed in -> the login page (so entering the site always starts at
    the login screen); signed in -> that role's dedicated portal dashboard.
    """
    if not request.user.is_authenticated:
        return redirect('login')
    return redirect(_role_dashboard(request.user))


def register(request):
    """Public self-registration with the admin passkey / approval rules."""
    if request.user.is_authenticated:
        return redirect('home')

    # Redirect-after-POST: the error and entered values travel through the
    # session so a browser refresh re-loads a clean GET instead of re-sending
    # the failed POST and re-triggering the same error.
    error = request.session.pop('register_error', None)
    stored = request.session.pop('register_data', None) or {}
    form_data = {key: stored.get(key, '') for key in (
        'full_name', 'campus_id', 'email', 'department', 'batch', 'section',
    )}
    done_role = request.session.pop('register_done_role', None)

    if request.method == 'POST':
        full_name = request.POST.get('full_name', '').strip()
        email = request.POST.get('email', '').strip().lower()
        password = request.POST.get('password', '')
        confirm_password = request.POST.get('confirm_password', '')
        role = request.POST.get('role', '')
        is_admin = role == User.Role.ADMIN

        # The form's ID/Key field is role-aware on the frontend — students
        # submit student_id, faculty submit faculty_id, admins submit their
        # admin security key (admin_key). Non-admin IDs map onto the single
        # stored campus_id column; admin_key aliases the legacy passkey input.
        campus_id = (
            request.POST.get('campus_id')
            or request.POST.get('student_id')
            or request.POST.get('faculty_id')
            or request.POST.get('admin_id')
            or ''
        ).strip()
        admin_key = (
            request.POST.get('admin_key')
            or request.POST.get('admin_passkey')  # legacy alias kept for compat
            or ''
        ).strip()
        # Student academics (department / batch / section) — the frontend only
        # renders these fields for the Student role, and the server requires
        # them to match the routine wizard's allowed values.
        department = request.POST.get('department', '').strip().upper()
        batch = request.POST.get('batch', '').strip()
        section = request.POST.get('section', '').strip().upper()

        valid_email = True
        try:
            validate_email(email)
        except ValidationError:
            valid_email = False

        if not full_name or not email or not password or not confirm_password:
            error = 'All fields are required.'
        elif not valid_email:
            error = 'Enter a valid email address.'
        elif role not in ROLE_LABELS:
            error = 'Please choose a valid role.'
        elif len(password) < 8:
            error = 'Password must be at least 8 characters.'
        elif password != confirm_password:
            error = 'Passwords do not match.'
        elif is_admin and not admin_key:
            error = 'The admin security key is required.'
        elif not is_admin and not campus_id:
            error = 'Please enter your student or faculty ID.'
        elif role == User.Role.STUDENT and department not in ROUTINE_DEPARTMENTS:
            error = 'Please choose your department.'
        elif role == User.Role.STUDENT and batch not in ROUTINE_BATCHES:
            error = 'Please choose a valid batch (0-16).'
        elif role == User.Role.STUDENT and section not in ROUTINE_SECTIONS_BY_DEPT.get(department, []):
            error = f'Please choose a valid section for {department}.'
        elif User.objects.filter(username=email).exists() or User.objects.filter(email=email).exists():
            error = 'An account with this email already exists.'
        elif not is_admin and User.objects.filter(campus_id=campus_id).exists():
            error = 'This campus ID is already registered.'
        elif is_admin and not _valid_admin_passkey(admin_key):
            error = 'Invalid admin security key. Admin registration rejected.'

        if error:
            request.session['register_error'] = error
            request.session['register_data'] = {
                'full_name': full_name,
                'campus_id': campus_id,
                'email': email,
                'department': department,
                'batch': batch,
                'section': section,
            }
            return redirect('register')

        user = User(
            username=email,
            email=email,
            first_name=full_name,
            # Admins hold no campus ID (their admin_key is a secret, never
            # stored); students/faculty keep theirs for the directory.
            campus_id=None if is_admin else campus_id,
            # Students register with their department / batch / section —
            # used to filter notices and routine lookups precisely.
            department=department if role == User.Role.STUDENT else '',
            batch=batch if role == User.Role.STUDENT else '',
            section=section if role == User.Role.STUDENT else '',
            role=role,
            # Admins are trusted on the spot; students & faculty wait for approval.
            registration_status=(
                User.RegistrationStatus.APPROVED if is_admin else User.RegistrationStatus.PENDING
            ),
            is_active=is_admin,
            is_staff=is_admin,
        )
        user.set_password(password)
        # The account and its audit row are created atomically, so we never
        # end up with a login account that has no registration-request record.
        with transaction.atomic():
            user.save()
            # Admins are approved on the spot; students/faculty stay pending.
            RegistrationRequest.objects.create(
                user=user,
                full_name=full_name,
                email=email,
                campus_id=campus_id or '',
                role=role,
                status=user.registration_status,
            )

        if is_admin:
            login(request, user, backend=AUTH_BACKEND)
            messages.success(request, 'Welcome! Your admin account was verified and is active.')
            return redirect(_role_dashboard(user))

        # PRG for the success screen too — a refresh must not re-submit the
        # form and re-trigger "an account with this email already exists.".
        request.session['register_done_role'] = role
        return redirect('register')

    return render(request, 'accounts/register.html', {
        'registered': done_role is not None,
        'role_label': ROLE_LABELS.get(done_role) if done_role else None,
        'error': error,
        'roles': ROLE_CHOICES,
        'form_data': form_data,
        'departments': list(ROUTINE_DEPARTMENTS.keys()),
        'batches': ROUTINE_BATCHES,
    })


def login_view(request):
    """Login with email/username, password, and a role selector."""
    if request.user.is_authenticated:
        return redirect('home')

    # Redirect-after-POST (same pattern as register): errors survive in the
    # session so a refresh re-loads the form instead of re-submitting it.
    error = request.session.pop('login_error', None)
    identifier = request.session.pop('login_identifier', '')

    if request.method == 'POST':
        identifier = request.POST.get('email', '').strip().lower()
        password = request.POST.get('password', '')
        role = request.POST.get('role', '')
        # The ?next= target survives in the session until login succeeds, so a
        # corrected login still lands on the page the user first requested.
        next_url = request.session.pop('login_next', '') or request.GET.get('next', '')

        user = User.objects.filter(username=identifier).first() or User.objects.filter(email=identifier).first()

        if user is None:
            error = 'No account found with that email or username.'
        elif role not in ROLE_LABELS:
            error = 'Please select your role.'
        elif user.role != role:
            error = f'That account is registered as {ROLE_LABELS[user.role]}. Select the matching role.'
        elif user.registration_status == User.RegistrationStatus.PENDING:
            error = 'Your registration is still pending admin approval. You will be able to log in once approved.'
        elif user.registration_status == User.RegistrationStatus.REJECTED:
            error = 'Your registration was rejected. Contact the campus administrator.'
        elif not user.check_password(password):
            error = 'Incorrect password. Try again.'

        if error:
            request.session['login_error'] = error
            request.session['login_identifier'] = identifier
            request.session['login_next'] = next_url
            return redirect('login')

        login(request, user, backend=AUTH_BACKEND)
        messages.success(request, f'Welcome back, {user.first_name or user.username}!')

        # A safe ?next= wins; otherwise each role lands on its own portal.
        if next_url and url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
            return redirect(next_url)
        return redirect(_role_dashboard(user))

    return render(request, 'accounts/login.html', {
        'error': error,
        'roles': ROLE_CHOICES,
        'identifier': identifier,
    })


def logout_view(request):
    logout(request)
    return redirect('login')


@login_required
def dashboard(request):
    """Landing page after login — sends each role to its own portal."""
    return redirect(_role_dashboard(request.user))


MAX_PHOTO_BYTES = 2 * 1024 * 1024  # 2MB, matching the Settings page helper text


def _parse_form(request):
    """Read form fields + files for PUT/PATCH requests.

    Django only populates ``request.POST`` for POST, so the profile endpoint
    (which accepts PUT) parses the body itself. Returns a
    ``(QueryDict, MultiValueDict)`` pair, like ``request.POST/FILES``.
    """
    if request.content_type == 'multipart/form-data':
        return request.parse_file_upload(request.META, request)
    from django.http import QueryDict

    return QueryDict(request.body, encoding=request.encoding or 'utf-8'), {}


def _profile_payload(user, request):
    """Serialized profile for the React dashboard (GET /api/profile/)."""
    full_name = user.get_display_name()
    return {
        'id': user.id,
        'username': user.username,
        'full_name': full_name,
        'email': user.email,
        'role': user.role,
        'department': user.department,
        'batch': user.batch,
        'section': user.section,
        'is_cr': user.is_cr,
        'profile_picture': (
            request.build_absolute_uri(user.profile_picture.url)
            if user.profile_picture
            else None
        ),
    }


@require_http_methods(['GET', 'PUT', 'PATCH'])
def profile_api(request):
    """REST endpoint backing the React Settings page.

    GET  -> the signed-in user's profile (full name, email, picture URL).
    PUT  -> accepts multipart form data: full_name, email, an optional
            profile_picture file, and remove_photo='1' to delete the image.
            Keeps username in sync with email (same rule as the Django
            settings page) and deletes replaced/removed files from storage.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)

    if request.method == 'GET':
        return JsonResponse({'profile': _profile_payload(request.user, request)})

    # PUT/PATCH — multipart form data from the Settings form.
    post, files = _parse_form(request)
    full_name = post.get('full_name', '').strip()
    email = post.get('email', '').strip().lower()
    remove_photo = post.get('remove_photo', '') in ('1', 'true', 'on')
    photo = files.get('profile_picture')

    if not full_name:
        return JsonResponse({'error': 'Full name is required.'}, status=400)
    if not email:
        return JsonResponse({'error': 'Email is required.'}, status=400)
    try:
        validate_email(email)
    except ValidationError:
        return JsonResponse({'error': 'Enter a valid email address.'}, status=400)
    if User.objects.filter(email=email).exclude(pk=request.user.pk).exists():
        return JsonResponse({'error': 'An account with this email already exists.'}, status=400)

    if photo:
        if photo.size > MAX_PHOTO_BYTES:
            return JsonResponse({'error': 'Photo must be 2MB or smaller.'}, status=400)
        if not (photo.content_type or '').startswith('image/'):
            return JsonResponse({'error': 'Upload an image file.'}, status=400)
        # Verify the bytes are a real image, not just a forged content-type.
        try:
            photo.seek(0)
            Image.open(photo).verify()
            photo.seek(0)
        except Exception:
            return JsonResponse({'error': 'Upload a valid image file.'}, status=400)

    user = request.user
    user.full_name = full_name[:100]  # matches the model's max_length
    parts = user.full_name.split(' ', 1)
    user.first_name = parts[0]
    user.last_name = parts[1] if len(parts) > 1 else ''
    user.email = email
    user.username = email  # login accepts email or username — keep them in sync

    if photo:
        # Replace: drop the old file so storage doesn't accumulate orphans.
        if user.profile_picture:
            user.profile_picture.delete(save=False)
        user.profile_picture = photo
    elif remove_photo and user.profile_picture:
        user.profile_picture.delete(save=False)
        user.profile_picture = None

    try:
        user.save()
    except IntegrityError:
        # Lost a concurrent email-uniqueness race — the DB constraint wins.
        return JsonResponse({'error': 'An account with this email already exists.'}, status=400)
    return JsonResponse({'profile': _profile_payload(user, request)})


@require_http_methods(['POST'])
def profile_fcm_token_api(request):
    """Register an FCM device token (POST /api/profile/fcm-token/).

    Authenticated endpoint: accepts a JSON body like ``{"fcm_token": ...}``
    (an optional ``platform`` field is honored; ``token`` is accepted as an
    alias for clients that already speak the subscribe endpoint's payload).
    The token is stored on the shared ``DeviceToken`` table — one row per
    device, several per user — which is exactly what
    ``push_class_cancellation()`` targets when a class is cancelled.

    Returns 401 when signed out, 400 for a missing / oversized token.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)

    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        payload = {}

    token = clean_token(payload.get('fcm_token') or payload.get('token'))
    platform = str(payload.get('platform', 'web')).strip()[:20] or 'web'
    if token is None:
        return JsonResponse({'error': 'A valid device token is required.'}, status=400)

    register_device_token(request.user, token, platform)
    return JsonResponse({'ok': True, 'message': 'Push notifications enabled.'})


@require_http_methods(['DELETE'])
def profile_picture_api(request):
    """Remove the signed-in user's profile picture (DELETE /api/profile/picture/).

    Deletes the image file from media storage and nulls the ``profile_picture``
    field so the UI falls back to the initials avatar. Idempotent: removing a
    picture when none is set is a clean 200 no-op.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)

    user = request.user
    if user.profile_picture:
        # delete() removes the file from disk and clears the field on the
        # model instance; save=False defers the DB write to the save below.
        user.profile_picture.delete(save=False)
        user.profile_picture = None
        user.save()

    return JsonResponse({'ok': True, 'profile_picture': None})


# ---------------------------------------------------------------------------
# Routine manager (admin dashboard "Routines" page)
# ---------------------------------------------------------------------------

ROUTINE_DEPARTMENTS = {
    'CSE': 'Computer Science & Engineering',
    'EEE': 'Electrical & Electronic Engineering',
    'TE': 'Textile Engineering',
    'IPE': 'Industrial & Production Engineering',
    'FDAE': 'Fashion Design & Apparel Engineering',
}

# Weekly grid days: Sunday to Thursday plus Saturday, matching the
# routine entry wizard's day sequence (Sun -> Mon -> Tue -> Wed -> Thu -> Sat).
ROUTINE_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'SAT']
ROUTINE_BATCHES = [str(n) for n in range(17)]  # 0..16
# Sections offered per department (the admin wizard shows exactly these).
ROUTINE_SECTIONS_BY_DEPT = {
    'CSE': ['A', 'B'],
    'EEE': ['A'],
    'TE': ['A', 'B', 'C', 'D'],
    'IPE': ['A', 'B'],
    'FDAE': ['A'],
}


def _routine_slot_payload(slot):
    """Serialized routine row for the React Routines page."""
    return {
        'id': slot.id,
        'day': slot.day,
        'start_time': slot.start_time.strftime('%I:%M %p').lstrip('0'),
        'end_time': slot.end_time.strftime('%I:%M %p').lstrip('0'),
        'subject': slot.subject,
        'faculty': slot.faculty,
        'room': slot.room,
    }


def _mine_slot_payload(slot, building_map):
    """Serialized routine row for the faculty dashboard's personal schedule.

    Times are 24h 'HH:MM' so the weekly grid can compare them directly; the
    building is resolved best-effort from ``building_map`` (room number ->
    building), since RoutineSlot only stores the plain-text room number.
    """
    return {
        'id': slot.id,
        'day': slot.day,
        'start_time': slot.start_time.strftime('%H:%M'),
        'end_time': slot.end_time.strftime('%H:%M'),
        'subject': slot.subject,
        'faculty': slot.faculty,
        'room': slot.room,
        'building': building_map.get(slot.room, ''),
        'department': slot.department,
        'batch': slot.batch,
        'section': slot.section,
    }


def _parse_routine_time(raw, index, label):
    """Parse an 'HH:MM' / 'HH:MM:SS' time for a routine slot."""
    try:
        parts = str(raw).strip().split(':')
        if not parts:
            raise ValueError
        hour, minute = int(parts[0]), int(parts[1])
        if not (0 <= hour < 24 and 0 <= minute < 60):
            raise ValueError
        return time(hour, minute)
    except (ValueError, TypeError, IndexError):
        raise ValueError(f'Slot {index}: {label} must be a valid time (HH:MM).')


def _teacher_name(user):
    """The name to match a teacher against the routine's plain-text faculty column."""
    return (
        user.full_name.strip()
        or ' '.join(filter(None, [user.first_name, user.last_name])).strip()
    )


def _slots_with_buildings(slots):
    """Serialize ordered RoutineSlot rows into 24h grid payloads, resolving
    building names for every room in one query instead of one per slot."""
    room_numbers = [slot.room for slot in slots if slot.room]
    building_map = {
        room.room_number: room.building
        for room in Room.objects.filter(room_number__in=room_numbers)
    }
    return [_mine_slot_payload(slot, building_map) for slot in slots]


def _my_schedule_slots(user):
    """The RoutineSlot rows belonging to one teacher, as 24h grid payloads.

    Matches the routine's plain-text ``faculty`` column against the teacher's
    profile name — first/last-name fallback included — using the same rule the
    displaced-class pipeline applies. Rows come back sorted by day (Sunday
    first) then start time, with buildings resolved in bulk.
    """
    name = _teacher_name(user)
    if not name:
        return []
    name_match = Q(faculty__iexact=name)
    parts = [p for p in name.replace('.', ' ').split() if p]
    if len(parts) > 1:
        name_match |= Q(faculty__iexact=f'{parts[0]} {" ".join(parts[1:])}')
    day_rank = {day: i for i, day in enumerate(ROUTINE_DAYS)}
    mine = sorted(
        RoutineSlot.objects.filter(name_match),
        key=lambda slot: (day_rank.get(slot.day, 99), slot.start_time),
    )
    return _slots_with_buildings(mine)


@require_http_methods(['GET'])
def my_schedule_api(request):
    """The signed-in teacher's own weekly schedule (GET /api/routines/my-schedule/).

    Returns the classes matched to this teacher by name, with 24h times and the
    room's building resolved — exactly what the faculty "My Routine" tab renders
    as a weekly grid.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.TEACHER:
        return JsonResponse({'error': 'Faculty only.'}, status=403)
    return JsonResponse({'slots': _my_schedule_slots(request.user)})


@require_http_methods(['GET'])
def department_routine_api(request):
    """Published routine for one department+batch+section (GET /api/routines/department/).

    Query params: dept (one of the campus departments), batch (0-16), section
    (optional, defaults to 'A'). Returns 24h slot payloads with the room's
    building resolved, so both the browse grid and students' own-routine view
    can render chips with room number, building and faculty name.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    department = request.GET.get('dept', '').strip().upper()
    batch = request.GET.get('batch', '').strip()
    section = request.GET.get('section', 'A').strip().upper()
    if department not in ROUTINE_DEPARTMENTS or batch not in ROUTINE_BATCHES:
        return JsonResponse({'error': 'Pick a valid department and batch.'}, status=400)
    if section not in ROUTINE_SECTIONS_BY_DEPT.get(department, []):
        return JsonResponse({'error': f'Pick a valid section for {department}.'}, status=400)
    slots = RoutineSlot.objects.filter(
        department=department, batch=batch, section=section)
    day_rank = {day: i for i, day in enumerate(ROUTINE_DAYS)}
    ordered = sorted(slots, key=lambda slot: (day_rank.get(slot.day, 99), slot.start_time))
    return JsonResponse({
        'department': department,
        'batch': batch,
        'section': section,
        'slots': _slots_with_buildings(ordered),
    })


@require_http_methods(['GET', 'PUT'])
def routines_api(request):
    """REST endpoint backing the admin Routines wizard (GET/PUT /api/routines/).

    GET -> rows for one department+batch+section
           (?department=CSE&batch=10&section=A).
    PUT -> JSON body {department, batch, section,
           slots: [{day, start_time, end_time, subject, faculty, room}, ...]};
           atomically replaces the whole table for that combination.
           Admin only.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    # Any signed-in user may VIEW routines (students & faculty check their
    # schedules); only admins may write them.
    if request.method != 'GET' and request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    if request.method == 'GET':
        # ?mine=1 — the signed-in teacher's own classes, matched by name against
        # the routine's plain-text faculty column (same rule the displaced-class
        # pipeline uses). Lets the dashboard render a personal weekly schedule
        # without requiring the teacher to hold a department/batch/section combo.
        # ?mine=1 — the signed-in teacher's own classes, matched by name against
        # the routine's plain-text faculty column (same rule the displaced-class
        # pipeline uses). Lets the dashboard render a personal weekly schedule
        # without requiring the teacher to hold a department/batch/section combo.
        # The named /api/routines/my-schedule/ endpoint serves the same data.
        if request.GET.get('mine') in ('1', 'true', 'yes'):
            if request.user.role != User.Role.TEACHER:
                return JsonResponse({'error': 'Faculty only.'}, status=403)
            return JsonResponse({'slots': _my_schedule_slots(request.user)})

        department = request.GET.get('department', '').strip().upper()
        batch = request.GET.get('batch', '').strip()
        section = request.GET.get('section', 'A').strip().upper()  # matches the PUT default
        if department not in ROUTINE_DEPARTMENTS or batch not in ROUTINE_BATCHES:
            return JsonResponse({'error': 'Pick a valid department and batch.'}, status=400)
        if section not in ROUTINE_SECTIONS_BY_DEPT.get(department, []):
            return JsonResponse({'error': f'Pick a valid section for {department}.'}, status=400)
        slots = RoutineSlot.objects.filter(
            department=department, batch=batch, section=section)
        # Sort by the Sunday-first grid order (not the alphabetized day code).
        # .get() keeps rows written outside this PUT path from 500ing.
        day_rank = {day: i for i, day in enumerate(ROUTINE_DAYS)}
        ordered = sorted(slots, key=lambda slot: (day_rank.get(slot.day, 99), slot.start_time))
        return JsonResponse({
            'department': department,
            'batch': batch,
            'section': section,
            'slots': [_routine_slot_payload(slot) for slot in ordered],
        })

    # PUT — full replace for one department+batch+section.
    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    department = str(payload.get('department', '')).strip().upper()
    batch = str(payload.get('batch', '')).strip()
    section = str(payload.get('section', 'A')).strip().upper()
    rows = payload.get('slots')

    if department not in ROUTINE_DEPARTMENTS:
        return JsonResponse({'error': 'Pick a valid department.'}, status=400)
    if batch not in ROUTINE_BATCHES:
        return JsonResponse({'error': 'Pick a valid batch (0-16).'}, status=400)
    if section not in ROUTINE_SECTIONS_BY_DEPT.get(department, []):
        return JsonResponse({'error': f'Pick a valid section for {department}.'}, status=400)
    if not isinstance(rows, list):
        return JsonResponse({'error': 'slots must be a list.'}, status=400)

    valid_days = set(ROUTINE_DAYS)
    clean = []
    for index, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            return JsonResponse({'error': f'Slot {index}: every row needs day, time, subject.'}, status=400)
        day = str(row.get('day', '')).strip().upper()
        subject = str(row.get('subject', '')).strip()
        if day not in valid_days:
            return JsonResponse({'error': f'Slot {index}: pick a valid day (Sun-Thu).'}, status=400)
        if not subject:
            return JsonResponse({'error': f'Slot {index}: subject name is required.'}, status=400)
        try:
            start_t = _parse_routine_time(row.get('start_time'), index, 'start time')
            end_t = _parse_routine_time(row.get('end_time'), index, 'end time')
        except ValueError as exc:
            return JsonResponse({'error': str(exc)}, status=400)
        if start_t >= end_t:
            return JsonResponse({'error': f'Slot {index}: start time must be before end time.'}, status=400)
        clean.append(RoutineSlot(
            department=department,
            batch=batch,
            section=section,
            day=day,
            start_time=start_t,
            end_time=end_t,
            subject=subject[:100],
            faculty=str(row.get('faculty', '')).strip()[:100],
            room=str(row.get('room', '')).strip()[:20],
        ))

    with transaction.atomic():
        RoutineSlot.objects.filter(
            department=department, batch=batch, section=section).delete()
        RoutineSlot.objects.bulk_create(clean)

    return JsonResponse({'ok': True, 'department': department, 'batch': batch,
                         'section': section, 'count': len(clean)})


# ---------------------------------------------------------------------------
# User directory (admin dashboard "Users" page)
# ---------------------------------------------------------------------------

def _user_status(user):
    """Computed directory status: active / pending / inactive."""
    if user.registration_status == User.RegistrationStatus.PENDING:
        return 'pending'
    if user.registration_status == User.RegistrationStatus.REJECTED or not user.is_active:
        return 'inactive'
    return 'active'


def _user_row(user, request):
    """Serialized row for the admin user directory."""
    return {
        'id': user.id,
        'username': user.username,
        'full_name': user.get_display_name(),
        'email': user.email,
        'role': user.role,
        'status': _user_status(user),
        'department': user.department,
        'batch': user.batch,
        'section': user.section,
        'campus_id': user.campus_id,
        'is_cr': user.is_cr,
        'profile_picture': (
            request.build_absolute_uri(user.profile_picture.url)
            if user.profile_picture
            else None
        ),
        'date_joined': user.date_joined.isoformat(),
    }


@require_http_methods(['GET'])
def users_api(request):
    """User directory for the admin dashboard (GET /api/users/)."""
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)
    users = User.objects.all().order_by('-date_joined')
    return JsonResponse({'users': [_user_row(user, request) for user in users]})


def _sync_registration_request(user):
    """Mirror an approve/deactivate outcome onto the audit record."""
    request_obj = getattr(user, 'registration_request', None)
    if request_obj is not None:
        request_obj.status = user.registration_status
        request_obj.save()


@require_http_methods(['POST'])
def user_action(request, user_id, action):
    """Approve / deactivate / delete / change-role for one directory row.

    Actions: approve, deactivate, delete, role (JSON body: {"role": ...}).
    Returns the updated user row (or {"deleted": id} for delete).
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    target = get_object_or_404(User, pk=user_id)

    if action == 'approve':
        target.registration_status = User.RegistrationStatus.APPROVED
        target.is_active = True
        target.save()
        _sync_registration_request(target)
    elif action == 'deactivate':
        target.registration_status = User.RegistrationStatus.REJECTED
        target.is_active = False
        target.save()
        _sync_registration_request(target)
    elif action == 'delete':
        if target.pk == request.user.pk:
            return JsonResponse({'error': 'You cannot delete your own account.'}, status=400)
        target.delete()
        return JsonResponse({'ok': True, 'deleted': user_id})
    elif action == 'role':
        try:
            payload = json.loads(request.body or b'{}')
        except ValueError:
            payload = {}
        new_role = str(payload.get('role', '')).strip()
        if new_role not in User.Role.values:
            return JsonResponse({'error': 'Invalid role.'}, status=400)
        if target.pk == request.user.pk and new_role != User.Role.ADMIN:
            return JsonResponse({'error': 'You cannot demote your own admin account.'}, status=400)
        target.role = new_role
        target.save()
    else:
        return JsonResponse({'error': 'Unknown action.'}, status=400)

    return JsonResponse({'user': _user_row(target, request)})


# ---------------------------------------------------------------------------
# Admin user profile (detail view + inline edit + force password reset)
# ---------------------------------------------------------------------------

def _user_profile_detail(user, request):
    """Full profile payload for the admin user-detail page.

    Includes all fields the profile page needs: personal info, academics,
    registration metadata, and the profile-picture URL.
    """
    return {
        'id': user.id,
        'username': user.username,
        'full_name': user.get_display_name(),
        'first_name': user.first_name,
        'last_name': user.last_name,
        'email': user.email,
        'role': user.role,
        'status': _user_status(user),
        'is_cr': user.is_cr,
        'department': user.department,
        'batch': user.batch,
        'section': user.section,
        'campus_id': user.campus_id,
        'phone_number': user.phone_number,
        'date_joined': user.date_joined.isoformat(),
        'profile_picture': (
            request.build_absolute_uri(user.profile_picture.url)
            if user.profile_picture
            else None
        ),
    }


@require_http_methods(['GET', 'PATCH'])
def user_profile_api(request, user_id):
    """Admin user detail + inline edit (GET / PATCH /api/users/<id>/).

    GET  -> full user profile for the dedicated profile page.
    PATCH -> updates allowed fields (full_name, email, department, batch,
             section, campus_id, phone_number, role, is_cr). Returns the
             refreshed user row. Admin only.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    target = get_object_or_404(User, pk=user_id)

    if request.method == 'GET':
        return JsonResponse({'user': _user_profile_detail(target, request)})

    # PATCH — partial update of profile fields.
    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    allowed_fields = {
        'full_name', 'email', 'department', 'batch', 'section',
        'campus_id', 'phone_number', 'role', 'is_cr',
    }
    updated = []
    for field in allowed_fields:
        if field not in payload:
            continue
        value = payload[field]
        if field == 'full_name':
            value = str(value).strip()[:100]
            target.full_name = value
            parts = value.split(' ', 1)
            target.first_name = parts[0]
            target.last_name = parts[1] if len(parts) > 1 else ''
        elif field == 'email':
            value = str(value).strip().lower()
            try:
                validate_email(value)
            except ValidationError:
                return JsonResponse({'error': 'Enter a valid email address.'}, status=400)
            if User.objects.filter(email=value).exclude(pk=target.pk).exists():
                return JsonResponse({'error': 'An account with this email already exists.'}, status=400)
            target.email = value
            target.username = value
        elif field == 'role':
            value = str(value).strip()
            if value not in User.Role.values:
                return JsonResponse({'error': 'Invalid role.'}, status=400)
            if target.pk == request.user.pk and value != User.Role.ADMIN:
                return JsonResponse({'error': 'You cannot demote your own admin account.'}, status=400)
            target.role = value
        elif field == 'is_cr':
            target.is_cr = bool(value)
        elif field == 'campus_id':
            value = str(value).strip() or None
            if value and User.objects.filter(campus_id=value).exclude(pk=target.pk).exists():
                return JsonResponse({'error': 'This campus ID is already in use.'}, status=400)
            target.campus_id = value
        elif field in ('department', 'batch', 'section', 'phone_number'):
            setattr(target, field, str(value).strip()[:50 if field == 'department' else 20 if field in ('batch', 'section') else 15])
        updated.append(field)

    if not updated:
        return JsonResponse({'error': 'No valid fields to update.'}, status=400)

    try:
        target.save()
    except IntegrityError:
        return JsonResponse({'error': 'An account with this email already exists.'}, status=400)
    return JsonResponse({'ok': True, 'user': _user_profile_detail(target, request)})


@require_http_methods(['POST'])
def user_force_reset_api(request, user_id):
    """Force a password reset for a user (POST /api/users/<id>/force-reset/).

    Generates a Django password-reset token and builds the reset URL that
    would be emailed to the user. In a production setup this would trigger
    ``PasswordResetForm.save()`` to actually dispatch the email; here we
    return the token + URL so the admin can share it manually (or the
    frontend can open it directly). Admin only.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    target = get_object_or_404(User, pk=user_id)

    # Django's built-in password-reset token generator.
    from django.contrib.auth.tokens import default_token_generator
    token = default_token_generator.make_token(target)

    # Build the frontend reset URL.  In production the domain should come
    # from settings.ALLOWED_HOSTS or an env var; here we derive it from the
    # request so it works in both dev (localhost) and deployed environments.
    domain = request.get_host()
    protocol = 'https' if request.is_secure() else 'http'
    reset_url = f'{protocol}://{domain}/accounts/password-reset/{target.pk}/{token}/'

    # Optionally actually send the email (when Django's email backend is
    # configured).  Falls back to returning the URL for admin to share.
    email_sent = False
    try:
        from django.core.mail import send_mail
        subject = 'Campus Problem — Password Reset'
        message = (
            f'Hello {target.get_display_name()},\n\n'
            f'An administrator has requested a password reset for your account.\n\n'
            f'Click the link below to set a new password:\n'
            f'{reset_url}\n\n'
            f'If you did not request this, please contact the campus administrator.\n'
        )
        send_mail(subject, message, settings.DEFAULT_FROM_EMAIL, [target.email], fail_silently=True)
        email_sent = True
    except Exception:
        pass  # email backend not configured — return the URL instead

    return JsonResponse({
        'ok': True,
        'message': f'Password reset link generated for {target.get_display_name()}.',
        'reset_url': reset_url,
        'email_sent': email_sent,
        'user': _user_profile_detail(target, request),
    })


# ---------------------------------------------------------------------------
# Class Representative (CR) management
# ---------------------------------------------------------------------------

def _cr_row(user, request):
    """Serialized row for the CR directory."""
    return {
        'id': user.id,
        'full_name': user.get_display_name(),
        'email': user.email,
        'department': user.department,
        'batch': user.batch,
        'section': user.section,
        'campus_id': user.campus_id,
        'profile_picture': (
            request.build_absolute_uri(user.profile_picture.url)
            if user.profile_picture
            else None
        ),
    }


@require_http_methods(['GET'])
def cr_students_api(request):
    """Fetch students filterable by department, batch, and section.

    GET /api/cr/students/?department=CSE&batch=10&section=A

    Returns active students matching the given filters. Any signed-in user
    may call this (it powers the CR picker in the cancel-class form and
    similar widgets).
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)

    department = request.GET.get('department', '').strip().upper()
    batch = request.GET.get('batch', '').strip()
    section = request.GET.get('section', '').strip().upper()

    qs = User.objects.filter(
        role=User.Role.STUDENT,
        registration_status=User.RegistrationStatus.APPROVED,
        is_active=True,
    )
    if department:
        qs = qs.filter(department=department)
    if batch:
        qs = qs.filter(batch=batch)
    if section:
        qs = qs.filter(section=section)

    students = qs.order_by('department', 'batch', 'section', 'first_name')
    return JsonResponse({
        'students': [_cr_row(s, request) for s in students],
        'count': students.count(),
    })


@require_http_methods(['GET'])
def cr_list_api(request):
    """Fetch all users who currently hold the CR role.

    GET /api/cr/

    Returns every active student with ``is_cr=True``, grouped by
    department / batch / section for easy display. Admin only.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    crs = User.objects.filter(
        is_cr=True,
        role=User.Role.STUDENT,
        is_active=True,
    ).order_by('department', 'batch', 'section', 'first_name')

    return JsonResponse({
        'crs': [_cr_row(cr, request) for cr in crs],
        'count': crs.count(),
    })


@require_http_methods(['POST'])
def cr_assign_api(request):
    """Grant Class Representative status to a student.

    POST /api/cr/assign/  {"user_id": 42}

    Sets ``is_cr=True`` on the target student. Admin only. Rejects the
    request when the target is not an active student.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    user_id = payload.get('user_id')
    if not user_id:
        return JsonResponse({'error': 'user_id is required.'}, status=400)

    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return JsonResponse({'error': 'Student not found.'}, status=404)

    if target.role != User.Role.STUDENT:
        return JsonResponse(
            {'error': 'Only students can be assigned as Class Representatives.'},
            status=400,
        )
    if not target.is_active or target.registration_status != User.RegistrationStatus.APPROVED:
        return JsonResponse(
            {'error': 'Only active, approved students can be assigned as CRs.'},
            status=400,
        )
    if target.is_cr:
        return JsonResponse(
            {'error': f'{target.get_display_name()} is already a Class Representative.'},
            status=409,
        )

    target.is_cr = True
    target.save(update_fields=['is_cr'])

    return JsonResponse({
        'ok': True,
        'message': f'{target.get_display_name()} has been assigned as Class Representative.',
        'user': _user_row(target, request),
    })


@require_http_methods(['POST'])
def cr_revoke_api(request):
    """Remove Class Representative status from a student.

    POST /api/cr/revoke/  {"user_id": 42}

    Sets ``is_cr=False`` on the target student. Admin only.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    user_id = payload.get('user_id')
    if not user_id:
        return JsonResponse({'error': 'user_id is required.'}, status=400)

    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return JsonResponse({'error': 'Student not found.'}, status=404)

    if not target.is_cr:
        return JsonResponse(
            {'error': f'{target.get_display_name()} is not a Class Representative.'},
            status=409,
        )

    target.is_cr = False
    target.save(update_fields=['is_cr'])

    return JsonResponse({
        'ok': True,
        'message': f'{target.get_display_name()} has been removed from Class Representative role.',
        'user': _user_row(target, request),
    })


# ---------------------------------------------------------------------------
# Meal Query — hostel meal cancellation requests
# ---------------------------------------------------------------------------

def _meal_cancellation_row(mc, request):
    """Serialized row for the Meal Manager list view."""
    return {
        'id': mc.id,
        'student_name': mc.student_name,
        'student_id': mc.campus_student_id,
        'department': mc.department,
        'section': mc.section,
        'date': mc.date.isoformat(),
        'meal_type': mc.meal_type,
        'meal_type_display': mc.get_meal_type_display(),
        'status': mc.status,
        'status_display': mc.get_status_display(),
        'created_at': mc.created_at.isoformat(),
    }


@require_http_methods(['GET'])
@transaction.non_atomic_requests
def meal_cancellations_api(request):
    """List meal cancellation requests.

    GET /api/meal-query/

    Students see only their own requests; admins and meal managers see all.
    Filterable by status via ?status=pending.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)

    qs = MealCancellation.objects.select_related('student')

    # Students only see their own; admins/managers see everything.
    if request.user.role == User.Role.STUDENT:
        qs = qs.filter(student=request.user)

    status_filter = request.GET.get('status', '').strip().lower()
    if status_filter in dict(MealCancellation.Status.choices):
        qs = qs.filter(status=status_filter)

    cancellations = qs[:100]  # safety cap
    return JsonResponse({
        'cancellations': [_meal_cancellation_row(mc, request) for mc in cancellations],
        'count': cancellations.count() if hasattr(cancellations, 'count') else len(cancellations),
    })


@require_http_methods(['POST'])
def meal_cancellation_create_api(request):
    """Submit a new meal cancellation request.

    POST /api/meal-query/
    {"date": "2026-08-22", "mealType": "lunch"}

    The student's details (name, id, department, section) are pulled from
    the authenticated user — no client-supplied student fields are trusted.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)
    if request.user.role != User.Role.STUDENT:
        return JsonResponse({'error': 'Only students can submit meal cancellation requests.'}, status=403)

    try:
        payload = json.loads(request.body or b'{}')
    except ValueError:
        return JsonResponse({'error': 'Send valid JSON.'}, status=400)

    date_str = payload.get('date', '').strip()
    meal_type = payload.get('mealType', '').strip().lower()

    if not date_str:
        return JsonResponse({'error': 'Date is required.'}, status=400)
    if meal_type not in dict(MealCancellation.MealType.choices):
        return JsonResponse({'error': 'Invalid meal type. Choose lunch, dinner, or both.'}, status=400)

    from datetime import date as date_cls
    try:
        target_date = date_cls.fromisoformat(date_str)
    except ValueError:
        return JsonResponse({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=400)

    # Reject past dates.
    if target_date < date_cls.today():
        return JsonResponse({'error': 'Cannot cancel meals for past dates.'}, status=400)

    # Prevent duplicate request for the same student + date + meal type.
    existing = MealCancellation.objects.filter(
        student=request.user,
        date=target_date,
        meal_type=meal_type,
        status__in=[MealCancellation.Status.PENDING, MealCancellation.Status.APPROVED],
    ).exists()
    if existing:
        return JsonResponse(
            {'error': 'You already have a pending or approved request for this meal on this date.'},
            status=409,
        )

    mc = MealCancellation.objects.create(
        student=request.user,
        student_name=request.user.get_display_name(),
        campus_student_id=request.user.campus_id or '',
        department=request.user.department or '',
        section=request.user.section or '',
        date=target_date,
        meal_type=meal_type,
    )

    return JsonResponse({
        'ok': True,
        'message': 'Meal cancellation request submitted successfully.',
        'cancellation': _meal_cancellation_row(mc, request),
    }, status=201)


@require_http_methods(['DELETE'])
def meal_cancellation_delete_api(request, cancellation_id):
    """Cancel a pending meal cancellation request.

    DELETE /api/meal-query/<id>/

    Students can only delete their own pending requests. Admins can delete
    any request.
    """
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Not authenticated.'}, status=401)

    try:
        mc = MealCancellation.objects.get(pk=cancellation_id)
    except MealCancellation.DoesNotExist:
        return JsonResponse({'error': 'Request not found.'}, status=404)

    # Only the owner (pending) or admins can delete.
    if request.user.role != User.Role.ADMIN and mc.student != request.user:
        return JsonResponse({'error': 'Not authorized.'}, status=403)
    if request.user.role == User.Role.STUDENT and mc.status != MealCancellation.Status.PENDING:
        return JsonResponse({'error': 'Only pending requests can be withdrawn.'}, status=400)

    mc.delete()
    return JsonResponse({'ok': True, 'message': 'Request withdrawn successfully.'})
