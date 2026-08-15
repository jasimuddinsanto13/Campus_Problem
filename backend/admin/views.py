"""
Admin section — dashboard & registration moderation.

Admins see a panel of pending student/faculty registrations with Approve and
Reject buttons. Approving activates the account instantly; rejecting blocks
login. Only accounts with role=admin may use these views.
"""

from datetime import time

from django.contrib import messages
from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import PasswordChangeForm
from django.http import HttpResponseForbidden
from django.shortcuts import get_object_or_404, redirect, render
from django.utils.http import url_has_allowed_host_and_scheme
from django.views.decorators.http import require_POST

from booking.models import Room, RoomBooking, Routine

from .forms import ProfileForm

User = get_user_model()

ROLE_LABELS = {
    User.Role.STUDENT: 'Student',
    User.Role.TEACHER: 'Faculty',
    User.Role.ADMIN: 'Admin',
}

# Weekly routine grid days, Sunday to Thursday, per the NITER-Pulse SRS.
ROUTINE_DAYS = [
    ('SUN', 'Sunday'),
    ('MON', 'Monday'),
    ('TUE', 'Tuesday'),
    ('WED', 'Wednesday'),
    ('THU', 'Thursday'),
]


@login_required
def settings_view(request):
    """Settings page: edit profile info / photo and change the password.

    Both forms live on one page but submit independently, so a profile save
    never touches the password and vice-versa. Password changes rotate the
    session auth hash, keeping the user logged in.
    """
    profile_form = ProfileForm(instance=request.user)
    password_form = PasswordChangeForm(request.user)

    if request.method == 'POST':
        if 'profile_submit' in request.POST:
            profile_form = ProfileForm(request.POST, request.FILES, instance=request.user)
            if profile_form.is_valid():
                user = profile_form.save(commit=False)
                if profile_form.cleaned_data.get('remove_photo') and user.profile_picture:
                    user.profile_picture.delete(save=False)
                    user.profile_picture = None
                email = profile_form.cleaned_data['email']
                user.email = email
                user.username = email  # login accepts email or username — keep them in sync
                user.save()
                messages.success(request, 'Your profile was updated.')
            else:
                messages.error(request, 'Please fix the errors in your profile form.')
            return redirect('admin_portal:settings')

        if 'password_submit' in request.POST:
            password_form = PasswordChangeForm(request.user, request.POST)
            if password_form.is_valid():
                password_form.save()
                # Django 5.2's PasswordChangeForm no longer rotates the session
                # auth hash, so without this the user would be logged out.
                update_session_auth_hash(request, request.user)
                messages.success(request, 'Your password was changed successfully.')
            else:
                messages.error(request, 'Please fix the errors in the password form.')
            return redirect('admin_portal:settings')

    context = {
        'role_label': 'Admin',
        'profile_form': profile_form,
        'password_form': password_form,
    }
    return render(request, 'admin/settings.html', context)


@login_required
def admin_users(request):
    """Two-tab directory of registered students and faculty (SRS §3.2)."""
    if request.user.role != User.Role.ADMIN:
        return redirect('dashboard')

    tab = request.GET.get('tab', 'students')
    if tab not in ('students', 'teachers', 'all'):
        tab = 'students'

    context = {
        'role_label': 'Admin',
        'active_tab': tab,
        'students': User.objects.filter(role=User.Role.STUDENT).order_by('username'),
        'teachers': User.objects.filter(role=User.Role.TEACHER).order_by('username'),
        'students_count': User.objects.filter(role=User.Role.STUDENT).count(),
        'teachers_count': User.objects.filter(role=User.Role.TEACHER).count(),
        # The "User info" tab — every account with its password hash.
        'all_users': User.objects.order_by('-date_joined'),
        'all_users_count': User.objects.count(),
    }
    return render(request, 'admin/users.html', context)


def _routine_form_options():
    """Sources for the routine entry module (SRS §3.3).

    The scope picker is a cascading batch -> department -> section flow.
    The tree is built from user profiles (which carry all three fields) plus
    any routine rows that have a batch attached, so the dropdowns always
    offer real combinations.
    """
    subjects = sorted(Routine.objects.values_list('subject', flat=True).distinct())
    teachers = User.objects.filter(
        role=User.Role.TEACHER, registration_status=User.RegistrationStatus.APPROVED
    ).order_by('first_name')

    tree = {}
    for user in User.objects.all():
        if user.batch and user.department:
            tree.setdefault(user.batch, {}).setdefault(user.department, set())
            if user.section:
                tree[user.batch][user.department].add(user.section)
    for routine in Routine.objects.all():
        if routine.batch and routine.department:
            tree.setdefault(routine.batch, {}).setdefault(routine.department, set())
            if routine.section:
                tree[routine.batch][routine.department].add(routine.section)
    batch_tree = {
        batch: {dept: sorted(sections) for dept, sections in sorted(depts.items())}
        for batch, depts in sorted(tree.items())
    }

    return {
        'subjects': subjects,
        'batch_tree': batch_tree,
        'teachers': teachers,
        'rooms': Room.objects.all(),
    }


@login_required
def admin_routines(request):
    """Routine setup & entry module: header parameters + Sun-Thu grid (SRS §3.3).

    Saving a routine establishes baseline occupancy: rooms with a scheduled
    class no longer appear free for that window in the availability search.
    """
    if request.user.role != User.Role.ADMIN:
        return redirect('dashboard')

    if request.method == 'POST':
        department = request.POST.get('department', '').strip()
        batch = request.POST.get('batch', '').strip()
        section = request.POST.get('section', '').strip()
        subject = request.POST.get('subject', '').strip()

        errors = []
        if not department:
            errors.append('Department is required.')
        if not subject:
            errors.append('Subject is required.')

        created = 0
        if not errors:
            for day, _label in ROUTINE_DAYS:
                course = request.POST.get(f'{day}_course', '').strip()
                if not course:
                    continue  # empty row — skip
                teacher_id = request.POST.get(f'{day}_teacher', '').strip()
                room_id = request.POST.get(f'{day}_room', '').strip()
                start = request.POST.get(f'{day}_start', '').strip()
                end = request.POST.get(f'{day}_end', '').strip()
                if not teacher_id or not room_id or not start or not end:
                    errors.append(f'{_label}: every slot needs a teacher, room and time range.')
                    continue
                try:
                    teacher_pk = int(teacher_id)
                    room_pk = int(room_id)
                    start_t = time.fromisoformat(start)
                    end_t = time.fromisoformat(end)
                except (ValueError, TypeError):
                    errors.append(f'{_label}: invalid teacher, room or time range.')
                    continue
                if start_t >= end_t:
                    errors.append(f'{_label}: start must be before end.')
                    continue
                Routine.objects.create(
                    teacher_id=teacher_pk,
                    subject=course,
                    department=department,
                    batch=batch,
                    section=section,
                    room_id=room_pk,
                    day=day,
                    start_time=start_t,
                    end_time=end_t,
                )
                created += 1
            if not created and not errors:
                errors.append('No rows were filled in — enter a course name on at least one day.')

        if errors:
            messages.error(request, ' '.join(errors))
        else:
            messages.success(request, f'Saved {created} routine entr{"y" if created == 1 else "ies"} for {department}.')
        return redirect('admin_portal:admin_routines')

    context = {
        'role_label': 'Admin',
        'routine_days': ROUTINE_DAYS,
        'routines': Routine.objects.select_related('teacher', 'room').order_by('day', 'start_time'),
        'routines_count': Routine.objects.count(),
        **_routine_form_options(),
    }
    return render(request, 'admin/routines.html', context)


@login_required
@require_POST
def delete_routine(request, routine_id):
    """Remove a routine entry (invalid schedules can be corrected)."""
    if request.user.role != User.Role.ADMIN:
        return HttpResponseForbidden('Only admins can remove routines.')
    routine = get_object_or_404(Routine, pk=routine_id)
    detail = str(routine)
    routine.delete()
    messages.success(request, f'Removed routine: {detail}.')
    return redirect('admin_portal:admin_routines')


@login_required
@require_POST
def delete_booking(request, booking_id):
    """Override an invalid booking by removing it (SRS §2.1 admin powers)."""
    if request.user.role != User.Role.ADMIN:
        return HttpResponseForbidden('Only admins can override bookings.')
    booking = get_object_or_404(RoomBooking, pk=booking_id)
    detail = str(booking)
    booking.delete()
    messages.success(request, f'Overrode booking: {detail} — the room is available again.')
    return redirect('/')


def _resolve_decision(request, user_id, approve):
    """Shared approve/reject logic (admin only)."""
    if request.user.role != User.Role.ADMIN:
        return HttpResponseForbidden('Only admins can approve registrations.')
    target = get_object_or_404(User, pk=user_id)
    if target.role not in (User.Role.STUDENT, User.Role.TEACHER):
        messages.error(request, 'Admins are auto-approved and cannot be moderated here.')
    else:
        if approve:
            target.registration_status = User.RegistrationStatus.APPROVED
            target.is_active = True
            target.save()
            messages.success(request, f'{target.first_name or target.username} ({ROLE_LABELS[target.role]}) was approved.')
        else:
            target.registration_status = User.RegistrationStatus.REJECTED
            target.is_active = False
            target.save()
            messages.warning(request, f'{target.first_name or target.username} ({ROLE_LABELS[target.role]}) was rejected.')

        # Mirror the outcome onto the registration-request audit record.
        request_obj = getattr(target, 'registration_request', None)
        if request_obj is not None:
            request_obj.status = target.registration_status
            request_obj.save()

    # When the admin acted from the user directory, send them back to the
    # exact view/tab they were on instead of the dashboard.
    next_url = request.POST.get('next') or request.GET.get('next') or ''
    if next_url and url_has_allowed_host_and_scheme(next_url, allowed_hosts={request.get_host()}):
        return redirect(next_url)
    return redirect('/')


@login_required
@require_POST
def approve_user(request, user_id):
    return _resolve_decision(request, user_id, approve=True)


@login_required
@require_POST
def reject_user(request, user_id):
    return _resolve_decision(request, user_id, approve=False)
