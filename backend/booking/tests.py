"""Tests for the routine setup module (admin portal).

The admin portal app lives inside ``backend/`` and is registered in
``INSTALLED_APPS``, so its own test files are picked up by ``py manage.py
test`` from this directory. These tests cover the admin routine page and
the batch → department → section cascade, and live here so the default
test suite picks them up.
"""

import base64
import json
from datetime import date, time, timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .models import (
    ClassCancellation,
    DeviceToken,
    DisplacedClass,
    ExtraClassRequest,
    Notice,
    Room,
    Routine,
    RoutineSlot,
)

User = get_user_model()

# A 1x1 transparent PNG used to exercise the profile-picture ImageField.
_PNG = base64.b64decode(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
)


class UserDisplayNameTests(TestCase):
    """get_display_name() — Title Case display names across the app.

    Every user-facing surface (profiles, user directory, notice authors,
    booking request rows, push bodies) renders through this helper, so the
    stored names are normalized once at display time.
    """

    def _user(self, **kwargs):
        return User.objects.create_user(
            kwargs.pop('username', 'display@niter.local'),
            email=kwargs.pop('email', 'display@niter.local'),
            password='strongpass123',
            role='student',
            registration_status='approved',
            is_active=True,
            **kwargs,
        )

    def test_full_name_is_title_cased(self):
        user = self._user(full_name='santo jasim')
        self.assertEqual(user.get_display_name(), 'Santo Jasim')

    def test_mixed_case_full_name_is_normalized(self):
        user = self._user(full_name='sAnTo JaSiM')
        self.assertEqual(user.get_display_name(), 'Santo Jasim')

    def test_falls_back_to_first_and_last_name(self):
        user = self._user(full_name='', first_name='AYESHA', last_name='RAHMAN')
        self.assertEqual(user.get_display_name(), 'Ayesha Rahman')

    def test_falls_back_to_username_when_no_name_fields(self):
        user = self._user(full_name='', first_name='', last_name='')
        self.assertEqual(user.get_display_name(), 'display@niter.local')

    def test_empty_full_name_does_not_shadow_names(self):
        """Whitespace-only full_name must not win over first+last."""
        user = self._user(full_name='   ', first_name='Santo', last_name='Jasim')
        self.assertEqual(user.get_display_name(), 'Santo Jasim')

    def test_stored_values_are_not_rewritten(self):
        """Formatting is display-only — the stored fields stay untouched."""
        user = self._user(full_name='santo jasim')
        self.assertEqual(user.get_display_name(), 'Santo Jasim')
        user.refresh_from_db()
        self.assertEqual(user.full_name, 'santo jasim')

    def test_profile_api_returns_title_case_name(self):
        """GET /api/profile/ surfaces the Title Case display name."""
        user = self._user(full_name='santo jasim')
        self.client.force_login(user)
        profile = self.client.get('/api/profile/').json()['profile']
        self.assertEqual(profile['full_name'], 'Santo Jasim')


class RoutinePageTests(TestCase):
    """The routine setup page renders the batch → department → section cascade."""

    def _admin(self):
        return User.objects.create_user(
            'routines-admin@niter.local', email='routines-admin@niter.local',
            password='strongpass123', role='admin',
            registration_status='approved', is_active=True, is_staff=True,
        )

    def test_routine_page_renders_cascade_for_admin(self):
        self.client.force_login(self._admin())
        response = self.client.get(reverse('admin_portal:admin_routines'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'id="cascade-batch"')
        self.assertContains(response, 'id="cascade-dept"')
        self.assertContains(response, 'id="cascade-section"')
        self.assertContains(response, 'routine-combo')

    def test_cascade_tree_includes_user_batch_department_section(self):
        User.objects.create_user(
            'stu-cascade@niter.local', email='stu-cascade@niter.local',
            password='strongpass123', role='student', batch='15th',
            department='EEE', section='1B',
            registration_status='approved', is_active=True,
        )
        self.client.force_login(self._admin())
        response = self.client.get(reverse('admin_portal:admin_routines'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '"15th"')
        self.assertContains(response, '"EEE"')
        self.assertContains(response, '"1B"')

    def test_routine_page_requires_admin(self):
        # Non-admins are bounced back to the dashboard.
        student = User.objects.create_user(
            'stu-plain@niter.local', email='stu-plain@niter.local',
            password='strongpass123', role='student',
            registration_status='approved', is_active=True,
        )
        self.client.force_login(student)
        response = self.client.get(reverse('admin_portal:admin_routines'))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('dashboard'))

    def test_save_routine_uses_cascade_fields(self):
        """The cascade picker posts batch/department/section straight into the
        routine row (same field names as before)."""
        self.client.force_login(self._admin())
        teacher = User.objects.create_user(
            't-cascade@niter.local', email='t-cascade@niter.local',
            password='strongpass123', role='teacher', department='CSE',
            registration_status='approved', is_active=True,
        )
        room = Room.objects.create(room_number='999', building='Test Block', capacity=10)

        response = self.client.post(reverse('admin_portal:admin_routines'), {
            'department': 'CSE',
            'batch': '13th',
            'section': '2A',
            'subject': 'Test Cascade',
            'MON_course': 'Test Cascade',
            'MON_teacher': teacher.id,
            'MON_room': room.id,
            'MON_start': '09:00',
            'MON_end': '10:30',
        })

        self.assertEqual(response.status_code, 302)  # PRG back to the routine page
        self.assertTrue(Routine.objects.filter(
            subject='Test Cascade', batch='13th', department='CSE', section='2A'
        ).exists())


class SettingsPageTests(TestCase):
    """The admin Settings page updates profile info / photo and the password."""

    def _admin(self):
        return User.objects.create_user(
            'settings-admin@niter.local', email='settings-admin@niter.local',
            password='strongpass123', role='admin',
            registration_status='approved', is_active=True, is_staff=True,
        )

    def test_settings_page_renders_for_admin(self):
        self.client.force_login(self._admin())
        response = self.client.get(reverse('admin_portal:settings'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'PROFILE INFORMATION')
        self.assertContains(response, 'id_new_password1')
        self.assertContains(response, 'Change password')

    def test_settings_requires_login(self):
        response = self.client.get(reverse('admin_portal:settings'))
        self.assertEqual(response.status_code, 302)
        self.assertEqual(
            response.url,
            reverse('login') + '?next=' + reverse('admin_portal:settings'),
        )

    def test_profile_update_with_photo_and_email(self):
        admin = self._admin()
        self.client.force_login(admin)
        photo = SimpleUploadedFile('me.png', _PNG, content_type='image/png')

        response = self.client.post(reverse('admin_portal:settings'), {
            'profile_submit': '1',
            'first_name': 'New',
            'last_name': 'Name',
            'email': 'admin@new.local',
            'profile_picture': photo,
        })
        admin.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('admin_portal:settings'))
        self.assertEqual(admin.first_name, 'New')
        self.assertEqual(admin.last_name, 'Name')
        self.assertEqual(admin.email, 'admin@new.local')
        self.assertTrue(admin.profile_picture)
        # The success toast is shown on the redirected page.
        self.assertContains(self.client.get(response.url), 'Your profile was updated.')

    def test_profile_email_conflict_is_rejected(self):
        admin = self._admin()
        User.objects.create_user(
            'taken@niter.local', email='taken@niter.local',
            password='strongpass123', role='student',
            registration_status='approved', is_active=True,
        )
        self.client.force_login(admin)

        response = self.client.post(reverse('admin_portal:settings'), {
            'profile_submit': '1',
            'first_name': 'A',
            'email': 'taken@niter.local',
        })
        admin.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertNotEqual(admin.email, 'taken@niter.local')
        self.assertContains(
            self.client.get(response.url),
            'Please fix the errors in your profile form.',
        )

    def test_change_password_with_correct_current(self):
        admin = self._admin()
        self.client.force_login(admin)

        response = self.client.post(reverse('admin_portal:settings'), {
            'password_submit': '1',
            'old_password': 'strongpass123',
            'new_password1': 'newpass456!',
            'new_password2': 'newpass456!',
        })
        admin.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertTrue(admin.check_password('newpass456!'))
        self.assertContains(
            self.client.get(response.url),
            'Your password was changed successfully.',
        )

    def test_change_password_wrong_current_is_rejected(self):
        admin = self._admin()
        self.client.force_login(admin)

        response = self.client.post(reverse('admin_portal:settings'), {
            'password_submit': '1',
            'old_password': 'wrongpass',
            'new_password1': 'newpass456!',
            'new_password2': 'newpass456!',
        })
        admin.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertTrue(admin.check_password('strongpass123'))
        self.assertContains(
            self.client.get(response.url),
            'Please fix the errors in the password form.',
        )


class AdminUserModerationTests(TestCase):
    """Admins can approve/reject any student or teacher from the user
    directory (Student view / Teacher view tabs)."""

    def _admin(self):
        return User.objects.create_user(
            'mod-admin@niter.local', email='mod-admin@niter.local',
            password='strongpass123', role='admin',
            registration_status='approved', is_active=True, is_staff=True,
        )

    def _user(self, username, role, status='pending'):
        return User.objects.create_user(
            username, email=username, password='strongpass123', role=role,
            registration_status=status, is_active=(status == 'approved'),
        )

    def test_users_page_shows_approve_and_reject_buttons(self):
        self.client.force_login(self._admin())
        self._user('stu-pending@niter.local', 'student')
        self._user('tea-pending@niter.local', 'teacher')

        response = self.client.get(reverse('admin_portal:admin_users'))
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, 'admin-btn-approve')
        self.assertContains(response, 'admin-btn-reject')
        self.assertContains(response, 'admin-status-chip')

    def test_approve_pending_student(self):
        self.client.force_login(self._admin())
        student = self._user('stu-approve@niter.local', 'student')

        response = self.client.post(reverse('admin_portal:approve_user', args=[student.id]))
        student.refresh_from_db()

        # After the legacy dashboard deprecation, the fallback lands on the
        # single modern dashboard at '/'.
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, '/')
        self.assertEqual(student.registration_status, 'approved')
        self.assertTrue(student.is_active)

    def test_reject_approved_teacher(self):
        self.client.force_login(self._admin())
        teacher = self._user('tea-reject@niter.local', 'teacher', status='approved')

        response = self.client.post(reverse('admin_portal:reject_user', args=[teacher.id]))
        teacher.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(teacher.registration_status, 'rejected')
        self.assertFalse(teacher.is_active)

    def test_rejected_student_can_be_approved_again(self):
        self.client.force_login(self._admin())
        student = self._user('stu-reapprove@niter.local', 'student', status='rejected')

        response = self.client.post(reverse('admin_portal:approve_user', args=[student.id]))
        student.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(student.registration_status, 'approved')
        self.assertTrue(student.is_active)

    def test_non_admin_cannot_approve(self):
        target = self._user('stu-victim@niter.local', 'student')
        other = self._user('stu-other@niter.local', 'student', status='approved')
        self.client.force_login(other)

        response = self.client.post(reverse('admin_portal:approve_user', args=[target.id]))
        target.refresh_from_db()

        self.assertEqual(response.status_code, 403)
        self.assertEqual(target.registration_status, 'pending')
        self.assertFalse(target.is_active)

    def test_approve_returns_to_same_users_tab(self):
        """Acting from the user directory keeps the admin on that tab."""
        self.client.force_login(self._admin())
        student = self._user('stu-tab@niter.local', 'student')

        response = self.client.post(
            reverse('admin_portal:approve_user', args=[student.id]),
            {'next': '/portal/admin/users/?tab=students'},
        )
        student.refresh_from_db()

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, '/portal/admin/users/?tab=students')
        self.assertEqual(student.registration_status, 'approved')
        self.assertTrue(student.is_active)


class RoomBookingPermissionTests(TestCase):
    """Server-side role enforcement on the extra-class booking API.

    The React room-booking view hides booking controls for students, but the
    API must reject their requests too — a student cannot create or manage
    requests no matter what the client sends.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _room(self):
        return Room.objects.create(room_number='PT-101', building='Test Block', capacity=40)

    def _next_wednesday(self):
        delta = (2 - date.today().weekday()) % 7 or 7  # Wednesday == 2
        return (date.today() + timedelta(days=delta)).isoformat()

    def _payload(self, room):
        return {
            'room_id': room.id,
            'department': 'CSE',
            'batch': '10',
            'section': 'A',
            'subject': 'Permission Test',
            'reason': 'extra',
            'day': 'WED',
            'date': self._next_wednesday(),
            'start_time': '09:00',
            'end_time': '10:00',
        }

    def _post(self, url, data):
        return self.client.post(url, data=json.dumps(data), content_type='application/json')

    def test_student_post_is_forbidden(self):
        student = self._make('stu@niter.local', role='student')
        self.client.force_login(student)
        response = self._post('/api/room-booking/requests/', self._payload(self._room()))
        self.assertEqual(response.status_code, 403)

    def test_student_cannot_manage_requests(self):
        teacher = self._make('teach@niter.local', role='teacher')
        self.client.force_login(teacher)
        created = self._post('/api/room-booking/requests/', self._payload(self._room()))
        self.assertEqual(created.status_code, 201)
        rid = created.json()['request']['id']

        student = self._make('stu2@niter.local', role='student')
        self.client.force_login(student)
        response = self.client.patch(
            f'/api/room-booking/requests/{rid}/',
            data=json.dumps({'action': 'cancel'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 403)

    def test_teacher_can_submit_and_cancel_own_request(self):
        teacher = self._make('teach2@niter.local', role='teacher', department='CSE')
        self.client.force_login(teacher)
        created = self._post('/api/room-booking/requests/', self._payload(self._room()))
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.json()['request']['status'], 'pending')

        rid = created.json()['request']['id']
        cancelled = self.client.patch(
            f'/api/room-booking/requests/{rid}/',
            data=json.dumps({'action': 'cancel'}),
            content_type='application/json',
        )
        self.assertEqual(cancelled.status_code, 200)
        self.assertEqual(cancelled.json()['request']['status'], 'cancelled')

    def test_anonymous_availability_requires_login(self):
        response = self.client.get('/api/room-booking/availability/?day=WED&start=09:00&end=10:00')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse('login')))


class AdminBookingCreateTests(TestCase):
    """Admin instant bookings + the exam-conflict override pipeline.

    Covers: free-slot booking (created approved), the exam override that
    displaces a regular class and notifies its faculty, the 409 for other
    occupants, the teacher replacement flow (resolves the displaced class and
    notifies students), and the per-teacher displaced feed.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _room(self, number='OB-101'):
        return Room.objects.create(room_number=number, building='Test Block', capacity=40)

    def _next_wednesday(self):
        delta = (2 - date.today().weekday()) % 7 or 7  # Wednesday == 2
        return (date.today() + timedelta(days=delta)).isoformat()

    def _slot(self, room_number='OB-101', faculty='Ayesha Rahman'):
        return RoutineSlot.objects.create(
            department='CSE', batch='10', section='A',
            day='WED',
            start_time=time(9, 0),
            end_time=time(10, 0),
            subject='Displaced Class',
            faculty=faculty,
            room=room_number,
        )

    def _admin_payload(self, room, purpose='exam', **over):
        payload = {
            'purpose': purpose,
            'room_id': room.id,
            'department': 'CSE',
            'batch': '10',
            'section': 'A',
            'subject': 'CSE-2101 Final Exam',
            'notes': 'Admin-created booking',
            'date': self._next_wednesday(),
            'start_time': '09:00',
            'end_time': '10:00',
        }
        payload.update(over)
        return payload

    def _payload(self, room, **over):
        """Teacher-facing extra-class request payload (WED 09:00-10:00)."""
        payload = {
            'room_id': room.id,
            'department': 'CSE',
            'batch': '10',
            'section': 'A',
            'subject': 'Instant Booking Test',
            'reason': 'extra',
            'day': 'WED',
            'date': self._next_wednesday(),
            'start_time': '09:00',
            'end_time': '10:00',
        }
        payload.update(over)
        return payload

    def _post(self, url, data):
        return self.client.post(url, data=json.dumps(data), content_type='application/json')

    def test_admin_creates_approved_booking_in_free_room(self):
        admin = self._make('admin@niter.local', role='admin')
        room = self._room()
        self.client.force_login(admin)
        response = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['created'], 'approved')
        self.assertEqual(body['request']['status'], 'approved')
        self.assertFalse(body['request']['is_override'])
        self.assertEqual(body['request']['requester_role'], 'admin')
        # The approved booking locks the room — a second admin booking fails.
        duplicate = self._post(
            '/api/admin/room-booking/create/',
            self._admin_payload(Room.objects.get(pk=room.id)),
        )
        self.assertEqual(duplicate.status_code, 409)

    def test_admin_exam_override_displaces_regular_class(self):
        admin = self._make('admin@niter.local', role='admin')
        teacher = self._make(
            'ayesha@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman',
        )
        room = self._room()
        self._slot(room_number=room.room_number, faculty='Ayesha Rahman')
        self.client.force_login(admin)

        response = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['created'], 'override')
        self.assertTrue(body['request']['is_override'])
        self.assertEqual(body['request']['status'], 'approved')

        displaced = DisplacedClass.objects.get()
        self.assertEqual(displaced.faculty, teacher)
        self.assertEqual(displaced.subject, 'Displaced Class')
        self.assertEqual(displaced.status, DisplacedClass.Status.PENDING)
        self.assertEqual(displaced.room, room)
        self.assertIn('Ayesha Rahman', body['displaced']['faculty_name'])

    def test_student_cannot_create_admin_booking(self):
        student = self._make('stu@niter.local', role='student')
        self.client.force_login(student)
        response = self._post('/api/admin/room-booking/create/', self._admin_payload(self._room()))
        self.assertEqual(response.status_code, 403)

    def test_conflict_with_other_booking_is_not_overridden(self):
        """A window held by another booking (not a regular class) is a hard 409."""
        admin = self._make('admin@niter.local', role='admin')
        teacher = self._make('teach@niter.local', role='teacher')
        room = self._room()
        # Lock the window with an approved extra-class request instead of a slot.
        ExtraClassRequest.objects.create(
            faculty=teacher, room=room, department='CSE', batch='10', section='A',
            subject='Existing Booking', reason='extra', day='WED',
            date=date.fromisoformat(self._next_wednesday()),
            start_time=time(9, 0),
            end_time=time(10, 0),
            status=ExtraClassRequest.Status.APPROVED,
        )
        self.client.force_login(admin)
        response = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(response.status_code, 409)
        self.assertFalse(DisplacedClass.objects.exists())

    def test_teacher_replacement_resolves_displaced_and_notifies_students(self):
        admin = self._make('admin@niter.local', role='admin')
        teacher = self._make(
            'ayesha@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman',
        )
        room = self._room()
        self._slot(room_number=room.room_number, faculty='Ayesha Rahman')
        self.client.force_login(admin)
        created = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(created.status_code, 201)
        displaced = DisplacedClass.objects.get()

        # The displaced teacher books a different free room for the same window.
        spare = self._room(number='OB-102')
        self.client.force_login(teacher)
        replacement = self._post('/api/room-booking/requests/', {
            'room_id': spare.id,
            'department': 'CSE',
            'batch': '10',
            'section': 'A',
            'subject': 'Displaced Class (replacement)',
            'reason': 'makeup',
            'day': 'WED',
            'date': self._next_wednesday(),
            'start_time': '09:00',
            'end_time': '10:00',
            'displaced_id': displaced.id,
        })
        self.assertEqual(replacement.status_code, 201)

        displaced.refresh_from_db()
        self.assertEqual(displaced.status, DisplacedClass.Status.RESCHEDULED)
        self.assertEqual(displaced.request_id, replacement.json()['request']['id'])
        # Students of that department / batch / section got the relocation notice.
        notice = Notice.objects.get()
        self.assertEqual(notice.target_role, Notice.TargetRole.STUDENT)
        self.assertEqual(notice.department, 'CSE')
        self.assertEqual(notice.batch, '10')
        self.assertEqual(notice.section, 'A')
        self.assertIn('Room', notice.content)
        self.assertIn('OB-102', notice.content)

    def test_teacher_auto_approved_booking(self):
        """Faculty can book instantly: the request is created as Approved."""
        teacher = self._make('teach@niter.local', role='teacher', department='CSE')
        self.client.force_login(teacher)
        payload = self._payload(self._room())
        payload['auto_approve'] = True
        response = self._post('/api/room-booking/requests/', payload)
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['request']['status'], 'approved')
        self.assertIn('locked', body['message'])
        # Without the flag the request stays pending (legacy / displaced flow).
        pending = self._post('/api/room-booking/requests/', self._payload(self._room(number='OB-103')))
        self.assertEqual(pending.status_code, 201)
        self.assertEqual(pending.json()['request']['status'], 'pending')

    def test_auto_approved_booking_still_blocked_by_occupant(self):
        """Instant booking never skips the occupancy guard."""
        holder = self._make('holder@niter.local', role='teacher')
        self.client.force_login(holder)
        first = self._post('/api/room-booking/requests/', self._payload(self._room()))
        self.assertEqual(first.status_code, 201)

        other = self._make('other@niter.local', role='teacher')
        self.client.force_login(other)
        payload = self._payload(Room.objects.get(pk=first.json()['request']['room_id']))
        payload['auto_approve'] = True
        blocked = self._post('/api/room-booking/requests/', payload)
        self.assertEqual(blocked.status_code, 409)

    def test_auto_approved_replacement_resolves_displaced(self):
        """A replacement booked instantly still resolves the displaced class."""
        admin = self._make('admin@niter.local', role='admin')
        teacher = self._make(
            'ayesha@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman',
        )
        room = self._room()
        self._slot(room_number=room.room_number, faculty='Ayesha Rahman')
        self.client.force_login(admin)
        created = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(created.status_code, 201)
        displaced = DisplacedClass.objects.get()

        spare = self._room(number='OB-102')
        self.client.force_login(teacher)
        replacement = self._post('/api/room-booking/requests/', {
            'room_id': spare.id,
            'department': 'CSE', 'batch': '10', 'section': 'A',
            'subject': 'Replacement (instant)', 'reason': 'extra', 'day': 'WED',
            'date': self._next_wednesday(),
            'start_time': '09:00', 'end_time': '10:00',
            'displaced_id': displaced.id,
            'auto_approve': True,
        })
        self.assertEqual(replacement.status_code, 201)
        self.assertEqual(replacement.json()['request']['status'], 'approved')
        displaced.refresh_from_db()
        self.assertEqual(displaced.status, DisplacedClass.Status.RESCHEDULED)
        self.assertEqual(displaced.request_id, replacement.json()['request']['id'])
        self.assertTrue(Notice.objects.filter(title__startswith='Class relocated').exists())

    def test_replacement_must_match_displaced_window(self):
        """A replacement that covers a different window cannot resolve the class."""
        admin = self._make('admin@niter.local', role='admin')
        teacher = self._make(
            'ayesha@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman',
        )
        room = self._room()
        self._slot(room_number=room.room_number, faculty='Ayesha Rahman')
        self.client.force_login(admin)
        created = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(created.status_code, 201)
        displaced = DisplacedClass.objects.get()

        spare = self._room(number='OB-102')
        self.client.force_login(teacher)
        wrong_window = self._post('/api/room-booking/requests/', {
            'room_id': spare.id,
            'department': 'CSE', 'batch': '10', 'section': 'A',
            'subject': 'Wrong window', 'reason': 'makeup', 'day': 'WED',
            'date': self._next_wednesday(),
            'start_time': '11:00', 'end_time': '12:00',
            'displaced_id': displaced.id,
        })
        self.assertEqual(wrong_window.status_code, 400)
        displaced.refresh_from_db()
        self.assertEqual(displaced.status, DisplacedClass.Status.PENDING)

    def test_rejected_replacement_restores_displaced_class(self):
        """Rejecting a replacement puts the class back to Pending Reschedule."""
        admin = self._make('admin@niter.local', role='admin')
        teacher = self._make(
            'ayesha@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman',
        )
        room = self._room()
        self._slot(room_number=room.room_number, faculty='Ayesha Rahman')
        self.client.force_login(admin)
        created = self._post('/api/admin/room-booking/create/', self._admin_payload(room))
        self.assertEqual(created.status_code, 201)
        displaced = DisplacedClass.objects.get()

        spare = self._room(number='OB-102')
        self.client.force_login(teacher)
        replacement = self._post('/api/room-booking/requests/', {
            'room_id': spare.id,
            'department': 'CSE', 'batch': '10', 'section': 'A',
            'subject': 'Replacement', 'reason': 'makeup', 'day': 'WED',
            'date': self._next_wednesday(),
            'start_time': '09:00', 'end_time': '10:00',
            'displaced_id': displaced.id,
        })
        self.assertEqual(replacement.status_code, 201)
        rid = replacement.json()['request']['id']

        self.client.force_login(admin)
        rejected = self.client.patch(
            f'/api/room-booking/requests/{rid}/',
            data=json.dumps({'action': 'reject'}),
            content_type='application/json',
        )
        self.assertEqual(rejected.status_code, 200)
        displaced.refresh_from_db()
        self.assertEqual(displaced.status, DisplacedClass.Status.PENDING)
        self.assertIsNone(displaced.request_id)

    def test_displaced_feed_is_scoped_to_owner(self):
        admin = self._make('admin@niter.local', role='admin')
        first = self._make('first@niter.local', role='teacher', first_name='Ayesha', last_name='Rahman')
        second = self._make('second@niter.local', role='teacher', first_name='Other', last_name='Teacher')
        room_a = self._room(number='OB-201')
        room_b = self._room(number='OB-202')
        self._slot(room_number=room_a.room_number, faculty='Ayesha Rahman')
        self._slot(room_number=room_b.room_number, faculty='Other Teacher')
        self.client.force_login(admin)
        self._post('/api/admin/room-booking/create/', self._admin_payload(room_a))
        self._post('/api/admin/room-booking/create/', self._admin_payload(room_b))
        self.assertEqual(DisplacedClass.objects.count(), 2)

        self.client.force_login(first)
        feed = self.client.get('/api/room-booking/displaced/')
        self.assertEqual(feed.status_code, 200)
        rows = feed.json()['displaced']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['faculty_id'], first.id)
        # Students cannot read the displaced feed.
        student = self._make('stu@niter.local', role='student')
        self.client.force_login(student)
        self.assertEqual(self.client.get('/api/room-booking/displaced/').status_code, 403)


class ClassCancellationApiTests(TestCase):
    """Class cancellation + mass student notification (faculty -> students).

    Covers: the teacher POST that saves a ClassCancellation and auto-publishes
    the scoped URGENT notice, audience counting, validation, and the student
    GET feed scoped to their own department / batch / section.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _teacher(self):
        return self._make(
            'cancel-teach@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman',
        )

    def _future_date(self):
        return (date.today() + timedelta(days=3)).isoformat()

    def _payload(self, **over):
        payload = {
            'department': 'CSE',
            'batch': '10',
            'section': 'A',
            'course_code': 'CSE-2101 Data Structures',
            'date': self._future_date(),
            'start_time': '10:30',
            'end_time': '11:45',
            'reason': 'official_meeting',
        }
        payload.update(over)
        return payload

    def _post(self, data):
        return self.client.post(
            '/api/teacher/cancel-class/',
            data=json.dumps(data),
            content_type='application/json',
        )

    def _matching_students(self, count=3, section='A'):
        for i in range(count):
            self._make(
                f'cse10a-{i}@niter.local', role='student',
                department='CSE', batch='10', section=section,
            )

    def test_teacher_cancels_class_saves_record_and_notifies_students(self):
        self.client.force_login(self._teacher())
        self._matching_students()
        # A student outside the target audience must NOT be counted.
        self._make('eee9b@niter.local', role='student',
                   department='EEE', batch='9', section='B')

        response = self._post(self._payload())
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body['ok'])
        self.assertEqual(body['students_notified'], 3)
        self.assertIn('3 students notified', body['message'])

        cancellation = ClassCancellation.objects.get()
        self.assertEqual(cancellation.faculty, User.objects.get(email='cancel-teach@niter.local'))
        self.assertEqual(cancellation.department, 'CSE')
        self.assertEqual(cancellation.batch, '10')
        self.assertEqual(cancellation.section, 'A')
        self.assertEqual(cancellation.course_code, 'CSE-2101 Data Structures')
        self.assertEqual(cancellation.date.isoformat(), self._future_date())
        self.assertEqual(cancellation.start_time, time(10, 30))
        self.assertEqual(cancellation.end_time, time(11, 45))
        self.assertEqual(cancellation.reason, 'official_meeting')

        # The audience query matches role + department + batch + section.
        self.assertEqual(cancellation.faculty.class_cancellations.count(), 1)

        notice = Notice.objects.get()
        self.assertEqual(notice.priority, Notice.Priority.URGENT)
        self.assertEqual(notice.target_role, Notice.TargetRole.STUDENT)
        self.assertEqual(notice.department, 'CSE')
        self.assertEqual(notice.batch, '10')
        self.assertEqual(notice.section, 'A')
        self.assertIn('🚨 CLASS CANCELLATION NOTICE', notice.content)
        self.assertIn('CSE-2101 Data Structures', notice.content)
        self.assertIn('Ayesha Rahman', notice.content)
        self.assertIn('10:30 AM', notice.content)
        self.assertIn('11:45 AM', notice.content)
        self.assertIn('Official Department Meeting', notice.content)

    def test_cancellation_notice_reaches_matching_students_feed(self):
        """End-to-end: the student notice feed surfaces the cancellation
        notice to a matching student and hides it from a non-matching one."""
        self.client.force_login(self._teacher())
        self._matching_students()
        self._post(self._payload())

        matching = self._make('stu-match@niter.local', role='student',
                              department='CSE', batch='10', section='A')
        self.client.force_login(matching)
        feed = self.client.get('/api/notices/student/').json()['notices']
        self.assertEqual(len(feed), 1)
        self.assertEqual(feed[0]['priority'], 'urgent')
        self.assertIn('CLASS CANCELLATION NOTICE', feed[0]['content'])

        other = self._make('stu-other@niter.local', role='student',
                           department='CSE', batch='10', section='B')
        self.client.force_login(other)
        feed = self.client.get('/api/notices/student/').json()['notices']
        self.assertEqual(feed, [])

    def test_student_cannot_cancel_a_class(self):
        student = self._make('stu@niter.local', role='student',
                             department='CSE', batch='10', section='A')
        self.client.force_login(student)
        response = self._post(self._payload())
        self.assertEqual(response.status_code, 403)
        self.assertFalse(ClassCancellation.objects.exists())
        self.assertFalse(Notice.objects.exists())

    def test_cancel_validation_rejects_bad_input(self):
        self.client.force_login(self._teacher())
        cases = [
            self._payload(department='ROBOT'),
            self._payload(batch='99'),
            self._payload(section='Z'),
            self._payload(course_code='   '),
            self._payload(date='not-a-date'),
            self._payload(start_time='11:45', end_time='10:30'),  # reversed
            self._payload(start_time='nope'),
            self._payload(reason='random'),
        ]
        for payload in cases:
            response = self._post(payload)
            self.assertEqual(response.status_code, 400, payload)
        self.assertFalse(ClassCancellation.objects.exists())

    def test_student_cancellations_feed_is_scoped(self):
        self.client.force_login(self._teacher())
        # Own class: CSE / batch 10 / sec A, in the future.
        self._post(self._payload(date=self._future_date(), course_code='CSE-2101'))
        # Past cancellation: must not appear.
        past = (date.today() - timedelta(days=5)).isoformat()
        self._post(self._payload(date=past, course_code='CSE-2100'))
        # Different section: must not appear either.
        self._post(self._payload(section='B', course_code='CSE-2099'))

        student = self._make('stu-scope@niter.local', role='student',
                             department='CSE', batch='10', section='A')
        self.client.force_login(student)
        response = self.client.get('/api/student/cancellations/')
        self.assertEqual(response.status_code, 200)
        rows = response.json()['cancellations']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['course_code'], 'CSE-2101')
        self.assertEqual(rows[0]['start_time'], '10:30')
        self.assertEqual(rows[0]['start_label'], '10:30 AM')
        self.assertEqual(rows[0]['faculty'], 'Ayesha Rahman')
        self.assertIn(rows[0]['day'], ('SUN', 'MON', 'TUE', 'WED', 'THU', 'SAT'))

    def test_non_student_cannot_read_cancellations(self):
        self.client.force_login(self._teacher())
        response = self.client.get('/api/student/cancellations/')
        self.assertEqual(response.status_code, 403)

    def test_student_without_valid_registration_gets_empty(self):
        student = self._make('stu-empty@niter.local', role='student')
        self.client.force_login(student)
        response = self.client.get('/api/student/cancellations/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['cancellations'], [])

    def test_past_date_is_rejected(self):
        self.client.force_login(self._teacher())
        past = (date.today() - timedelta(days=1)).isoformat()
        response = self._post(self._payload(date=past))
        self.assertEqual(response.status_code, 400)
        self.assertIn('past', response.json()['error'].lower())
        self.assertFalse(ClassCancellation.objects.exists())
        self.assertFalse(Notice.objects.exists())

    def test_duplicate_cancellation_is_rejected(self):
        self.client.force_login(self._teacher())
        first = self._post(self._payload())
        self.assertEqual(first.status_code, 201)

        duplicate = self._post(self._payload())
        self.assertEqual(duplicate.status_code, 409)
        self.assertIn('already cancelled', duplicate.json()['error'])
        self.assertEqual(ClassCancellation.objects.count(), 1)
        self.assertEqual(Notice.objects.count(), 1)  # students notified once

    def test_teacher_history_lists_only_own_cancellations(self):
        teacher = self._teacher()
        self.client.force_login(teacher)
        self._post(self._payload(course_code='CSE-2101'))
        self._post(self._payload(course_code='CSE-2102', date=(date.today() + timedelta(days=4)).isoformat()))

        # Another teacher's cancellation must not appear.
        other = self._make('other-teach@niter.local', role='teacher', department='EEE')
        self.client.force_login(other)
        self._post(self._payload(department='EEE', section='A', course_code='EEE-3101'))

        self.client.force_login(teacher)
        response = self.client.get('/api/teacher/cancellations/')
        self.assertEqual(response.status_code, 200)
        rows = response.json()['cancellations']
        self.assertEqual(len(rows), 2)
        self.assertEqual({r['course_code'] for r in rows}, {'CSE-2101', 'CSE-2102'})

        # Students cannot read the faculty history.
        student = self._make('stu@niter.local', role='student')
        self.client.force_login(student)
        self.assertEqual(self.client.get('/api/teacher/cancellations/').status_code, 403)

    def test_delete_restores_class_and_removes_notice(self):
        self.client.force_login(self._teacher())
        self._matching_students()
        created = self._post(self._payload())
        self.assertEqual(created.status_code, 201)
        self.assertEqual(Notice.objects.count(), 1)
        cancellation = ClassCancellation.objects.get()

        response = self.client.delete(f'/api/teacher/cancellations/{cancellation.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['ok'])
        self.assertFalse(ClassCancellation.objects.exists())
        self.assertFalse(Notice.objects.exists())  # notice retracted too

    def test_cannot_delete_another_teachers_cancellation(self):
        teacher = self._teacher()
        self.client.force_login(teacher)
        self._post(self._payload())
        cancellation = ClassCancellation.objects.get()

        other = self._make('other-teach@niter.local', role='teacher')
        self.client.force_login(other)
        response = self.client.delete(f'/api/teacher/cancellations/{cancellation.id}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(ClassCancellation.objects.filter(pk=cancellation.id).exists())
        self.assertTrue(Notice.objects.exists())

    def test_push_subscribe_and_unsubscribe(self):
        student = self._make('push-stu@niter.local', role='student')
        self.client.force_login(student)

        subscribe = self.client.post(
            '/api/push/subscribe/',
            data=json.dumps({'token': 'fcm-token-1', 'platform': 'web'}),
            content_type='application/json',
        )
        self.assertEqual(subscribe.status_code, 200)
        token = DeviceToken.objects.get()
        self.assertEqual(token.user, student)
        self.assertEqual(token.platform, 'web')
        self.assertEqual(token.token, 'fcm-token-1')

        # Re-subscribing the same token keeps a single row (idempotent upsert).
        again = self.client.post(
            '/api/push/subscribe/',
            data=json.dumps({'token': 'fcm-token-1'}),
            content_type='application/json',
        )
        self.assertEqual(again.status_code, 200)
        self.assertEqual(DeviceToken.objects.count(), 1)

        # Missing token is rejected.
        bad = self.client.post(
            '/api/push/subscribe/',
            data=json.dumps({'token': '  '}),
            content_type='application/json',
        )
        self.assertEqual(bad.status_code, 400)

        unsubscribe = self.client.post(
            '/api/push/unsubscribe/',
            data=json.dumps({'token': 'fcm-token-1'}),
            content_type='application/json',
        )
        self.assertEqual(unsubscribe.status_code, 200)
        self.assertFalse(DeviceToken.objects.exists())

    def test_push_subscribe_requires_login(self):
        response = self.client.post(
            '/api/push/subscribe/',
            data=json.dumps({'token': 'x'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 302)  # bounced to login


class ProfileFcmTokenApiTests(TestCase):
    """POST /api/profile/fcm-token/ — profile-centric FCM token registration.

    Mirrors the push-subscribe endpoint but with the ``{"fcm_token": ...}``
    payload shape. Rows land on the same shared DeviceToken table, so a token
    registered here is picked up by push_class_cancellation() exactly like
    one registered through /api/push/subscribe/.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _post(self, data):
        return self.client.post(
            '/api/profile/fcm-token/',
            data=json.dumps(data),
            content_type='application/json',
        )

    def test_registers_fcm_token_for_signed_in_user(self):
        student = self._make('fcm-stu@niter.local', role='student')
        self.client.force_login(student)

        response = self._post({'fcm_token': 'fcm-token-1', 'platform': 'android'})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()['ok'])

        token = DeviceToken.objects.get()
        self.assertEqual(token.user, student)
        self.assertEqual(token.platform, 'android')
        self.assertEqual(token.token, 'fcm-token-1')
        # The profile's primary-token field is kept in sync too.
        student.refresh_from_db()
        self.assertEqual(student.fcm_token, 'fcm-token-1')

    def test_accepts_token_alias_payload(self):
        """Clients that speak the subscribe payload ({'token': ...}) work too."""
        student = self._make('fcm-stu5@niter.local', role='student')
        self.client.force_login(student)

        response = self._post({'token': 'legacy-token'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(DeviceToken.objects.get().token, 'legacy-token')
        # The profile's primary-token field is kept in sync too.
        self.assertEqual(
            User.objects.get(email='fcm-stu5@niter.local').fcm_token,
            'legacy-token',
        )

    def test_resubscribe_is_idempotent(self):
        student = self._make('fcm-stu2@niter.local', role='student')
        self.client.force_login(student)
        self._post({'fcm_token': 'fcm-token-2'})
        again = self._post({'fcm_token': 'fcm-token-2'})
        self.assertEqual(again.status_code, 200)
        self.assertEqual(DeviceToken.objects.count(), 1)

    def test_multiple_devices_keep_one_row_each(self):
        student = self._make('fcm-stu3@niter.local', role='student')
        self.client.force_login(student)
        self._post({'fcm_token': 'device-a'})
        self._post({'fcm_token': 'device-b'})
        self.assertEqual(DeviceToken.objects.count(), 2)
        self.assertEqual(
            set(DeviceToken.objects.values_list('token', flat=True)),
            {'device-a', 'device-b'},
        )

    def test_token_moves_to_current_user_on_shared_device(self):
        first = self._make('fcm-first@niter.local', role='student')
        self.client.force_login(first)
        self._post({'fcm_token': 'shared-token'})
        self.assertEqual(DeviceToken.objects.get().user, first)

        second = self._make('fcm-second@niter.local', role='student')
        self.client.force_login(second)
        response = self._post({'fcm_token': 'shared-token'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(DeviceToken.objects.count(), 1)
        self.assertEqual(DeviceToken.objects.get().user, second)

    def test_missing_token_is_rejected(self):
        student = self._make('fcm-stu4@niter.local', role='student')
        self.client.force_login(student)
        response = self._post({'fcm_token': '   '})
        self.assertEqual(response.status_code, 400)
        self.assertIn('required', response.json()['error'].lower())
        self.assertFalse(DeviceToken.objects.exists())

    def test_requires_login(self):
        response = self._post({'fcm_token': 'x'})
        self.assertEqual(response.status_code, 401)  # JSON API: no redirect


class FacultyMineRoutineApiTests(TestCase):
    """GET /api/routines/?mine=1 — the signed-in teacher's own classes.

    Matches RoutineSlot rows by the plain-text faculty name against the
    teacher's profile (same rule the displaced-class pipeline uses), so the
    dashboard can render a personal weekly schedule without the teacher
    holding a department/batch/section combo.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _slot(self, **over):
        defaults = {
            'department': 'CSE', 'batch': '10', 'section': 'A',
            'day': 'SUN', 'start_time': time(9, 0), 'end_time': time(10, 0),
            'subject': 'Data Structures', 'faculty': 'Ayesha Rahman', 'room': '302',
        }
        defaults.update(over)
        return RoutineSlot.objects.create(**defaults)

    def test_mine_returns_only_own_slots_with_full_details(self):
        teacher = self._make(
            'aya@niter.local', role='teacher', department='CSE',
            first_name='Ayesha', last_name='Rahman', full_name='Ayesha Rahman',
        )
        other = self._make('other@niter.local', role='teacher', full_name='Other Teacher')
        Room.objects.create(room_number='302', building='Academic Building 1', capacity=60)
        self._slot()
        self._slot(
            department='EEE', batch='11', section='B', day='MON',
            subject='Circuit Theory', faculty='Other Teacher', room='204',
        )
        self.client.force_login(teacher)

        response = self.client.get('/api/routines/?mine=1')
        self.assertEqual(response.status_code, 200)
        slots = response.json()['slots']
        self.assertEqual(len(slots), 1)
        slot = slots[0]
        self.assertEqual(slot['subject'], 'Data Structures')
        self.assertEqual(slot['day'], 'SUN')
        self.assertEqual(slot['start_time'], '09:00')
        self.assertEqual(slot['end_time'], '10:00')
        self.assertEqual(slot['department'], 'CSE')
        self.assertEqual(slot['batch'], '10')
        self.assertEqual(slot['section'], 'A')
        self.assertEqual(slot['room'], '302')
        self.assertEqual(slot['building'], 'Academic Building 1')
        # The other teacher's slot is excluded (only 1 row returned above).

    def test_mine_matches_by_first_and_last_name(self):
        # Teachers whose profile has no full_name still match via first+last.
        teacher = self._make(
            'aya2@niter.local', role='teacher',
            first_name='Ayesha', last_name='Rahman', full_name='',
        )
        self._slot()
        self.client.force_login(teacher)

        response = self.client.get('/api/routines/?mine=1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()['slots']), 1)

    def test_mine_requires_teacher_role(self):
        student = self._make('stu@niter.local', role='student', department='CSE')
        self.client.force_login(student)
        response = self.client.get('/api/routines/?mine=1')
        self.assertEqual(response.status_code, 403)

        admin = self._make('admin@niter.local', role='admin')
        self.client.force_login(admin)
        self.assertEqual(self.client.get('/api/routines/?mine=1').status_code, 403)

    def test_mine_requires_login(self):
        response = self.client.get('/api/routines/?mine=1')
        self.assertEqual(response.status_code, 401)

    def test_mine_empty_when_no_slots_match(self):
        teacher = self._make('aya3@niter.local', role='teacher', full_name='Ayesha Rahman')
        self._slot(faculty='Somebody Else')
        self.client.force_login(teacher)
        response = self.client.get('/api/routines/?mine=1')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['slots'], [])


class MyScheduleApiTests(TestCase):
    """GET /api/routines/my-schedule/ — the signed-in teacher's own classes.

    The named sibling of ?mine=1 that powers the Routines page "My Routine"
    tab. Same name-matching rule, same 24h payload with building resolved.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _slot(self, **over):
        defaults = {
            'department': 'CSE', 'batch': '10', 'section': 'A',
            'day': 'SUN', 'start_time': time(9, 0), 'end_time': time(10, 30),
            'subject': 'Data Structures', 'faculty': 'Ayesha Rahman', 'room': '302',
        }
        defaults.update(over)
        return RoutineSlot.objects.create(**defaults)

    def test_returns_own_slots_sorted_with_building(self):
        teacher = self._make(
            'ms@niter.local', role='teacher',
            first_name='Ayesha', last_name='Rahman', full_name='Ayesha Rahman',
        )
        Room.objects.create(room_number='302', building='Academic Building 1', capacity=60)
        self._slot()
        self._slot(
            department='EEE', batch='11', section='B', day='TUE',
            subject='Circuit Theory', faculty='Ayesha Rahman', room='204',
        )
        self.client.force_login(teacher)

        response = self.client.get('/api/routines/my-schedule/')
        self.assertEqual(response.status_code, 200)
        slots = response.json()['slots']
        # SUN sorts before TUE; both of this teacher's classes are returned.
        self.assertEqual([s['day'] for s in slots], ['SUN', 'TUE'])
        slot = slots[0]
        self.assertEqual(slot['subject'], 'Data Structures')
        self.assertEqual(slot['start_time'], '09:00')
        self.assertEqual(slot['end_time'], '10:30')
        self.assertEqual(slot['room'], '302')
        self.assertEqual(slot['building'], 'Academic Building 1')
        self.assertEqual(slot['department'], 'CSE')
        self.assertEqual(slot['batch'], '10')
        self.assertEqual(slot['section'], 'A')

    def test_requires_teacher_role(self):
        student = self._make('ms2@niter.local', role='student', department='CSE')
        self.client.force_login(student)
        self.assertEqual(self.client.get('/api/routines/my-schedule/').status_code, 403)

        admin = self._make('ms3@niter.local', role='admin')
        self.client.force_login(admin)
        self.assertEqual(self.client.get('/api/routines/my-schedule/').status_code, 403)

    def test_requires_login(self):
        response = self.client.get('/api/routines/my-schedule/')
        self.assertEqual(response.status_code, 401)

    def test_empty_when_no_slots_match(self):
        teacher = self._make('ms4@niter.local', role='teacher', full_name='Ayesha Rahman')
        self._slot(faculty='Somebody Else')
        self.client.force_login(teacher)
        response = self.client.get('/api/routines/my-schedule/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['slots'], [])


class DepartmentRoutineApiTests(TestCase):
    """GET /api/routines/department/?dept=..&batch=..&section=.. — published routine.

    Read-only browse endpoint for the Routines page "All Routines" tab: any
    signed-in user may fetch a section's classes, enriched with the room
    building and sorted into the Sunday-first grid order.
    """

    def _make(self, username, role, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _slot(self, **over):
        defaults = {
            'department': 'CSE', 'batch': '10', 'section': 'A',
            'day': 'WED', 'start_time': time(11, 0), 'end_time': time(12, 0),
            'subject': 'Algorithms', 'faculty': 'Ayesha Rahman', 'room': '302',
        }
        defaults.update(over)
        return RoutineSlot.objects.create(**defaults)

    def test_returns_section_slots_with_building_and_faculty(self):
        student = self._make('dr@niter.local', role='student', department='CSE', batch='10', section='A')
        Room.objects.create(room_number='302', building='Academic Building 1', capacity=60)
        self._slot()
        self._slot(day='SUN', start_time=time(9, 0), end_time=time(10, 0), subject='Math')
        # A different section must stay out of the response.
        self._slot(department='EEE', batch='11', section='B', subject='Circuit Theory')
        self.client.force_login(student)

        response = self.client.get('/api/routines/department/?dept=CSE&batch=10&section=A')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data['department'], 'CSE')
        self.assertEqual(data['batch'], '10')
        self.assertEqual(data['section'], 'A')
        slots = data['slots']
        self.assertEqual(len(slots), 2)
        self.assertEqual([s['day'] for s in slots], ['SUN', 'WED'])
        slot = slots[0]
        self.assertEqual(slot['subject'], 'Math')
        self.assertEqual(slot['faculty'], 'Ayesha Rahman')
        self.assertEqual(slot['room'], '302')
        self.assertEqual(slot['building'], 'Academic Building 1')

    def test_section_defaults_to_a(self):
        student = self._make('dr2@niter.local', role='student', department='CSE', batch='10', section='A')
        self._slot()
        self.client.force_login(student)
        response = self.client.get('/api/routines/department/?dept=CSE&batch=10')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['section'], 'A')
        self.assertEqual(len(response.json()['slots']), 1)

    def test_invalid_selection_is_400(self):
        student = self._make('dr3@niter.local', role='student', department='CSE')
        self.client.force_login(student)
        self.assertEqual(
            self.client.get('/api/routines/department/?dept=XYZ&batch=10&section=A').status_code, 400)
        self.assertEqual(
            self.client.get('/api/routines/department/?dept=CSE&batch=99&section=A').status_code, 400)
        self.assertEqual(
            self.client.get('/api/routines/department/?dept=IPE&batch=10&section=C').status_code, 400)

    def test_requires_login(self):
        response = self.client.get('/api/routines/department/?dept=CSE&batch=10&section=A')
        self.assertEqual(response.status_code, 401)


class FcmPushTests(TestCase):
    """Firebase multicast dispatch (send_push_notification) + urgent-notice push.

    The Firebase SDK is mocked out — these tests verify the payload shape,
    the empty-token guard, the unconfigured no-op, and that URGENT notices
    (and only urgent ones) trigger a push when they are published.
    """

    def _admin(self):
        return User.objects.create_user(
            'fcm-admin@niter.local', email='fcm-admin@niter.local',
            password='strongpass123', role='admin',
            registration_status='approved', is_active=True, is_staff=True,
        )

    @mock.patch('booking.fcm._get_app', return_value=object())
    @mock.patch('firebase_admin.messaging', create=True)
    def test_send_push_notification_sends_multicast(self, messaging, _get_app):
        from booking.fcm import send_push_notification

        # Capture the exact payload the helper builds instead of relying on
        # Mock's auto-attributes (which swallow call arguments).
        message_kwargs = {}
        notification_kwargs = {}
        messaging.Notification.side_effect = lambda **kw: notification_kwargs.update(kw)
        messaging.MulticastMessage.side_effect = lambda **kw: message_kwargs.update(kw)
        messaging.send_multicast.return_value = 'RESPONSE'

        response = send_push_notification(
            ['tok-1', '  ', 'tok-2'], 'Hi', 'Body', data_payload={'url': '/x'},
        )
        self.assertEqual(response, 'RESPONSE')
        # Empty / whitespace tokens are filtered out before dispatch.
        self.assertEqual(message_kwargs['tokens'], ['tok-1', 'tok-2'])
        self.assertEqual(message_kwargs['data'], {'url': '/x'})
        self.assertEqual(notification_kwargs['title'], 'Hi')
        self.assertEqual(notification_kwargs['body'], 'Body')
        messaging.send_multicast.assert_called_once()

    @mock.patch('booking.fcm._get_app', return_value=object())
    @mock.patch('firebase_admin.messaging', create=True)
    def test_send_push_notification_skips_when_no_valid_tokens(self, messaging, _get_app):
        from booking.fcm import send_push_notification

        response = send_push_notification([None, '', '   '], 'Hi', 'Body')
        self.assertIsNone(response)
        messaging.send_multicast.assert_not_called()

    @mock.patch('booking.fcm._get_app', return_value=None)
    def test_send_push_notification_noops_without_firebase(self, _get_app):
        from booking.fcm import send_push_notification

        response = send_push_notification(['tok-1'], 'Hi', 'Body')
        self.assertIsNone(response)

    @mock.patch('booking.notice_views.push_urgent_notice', return_value=3)
    def test_urgent_notice_triggers_push(self, pushed):
        self.client.force_login(self._admin())
        response = self.client.post('/api/notices/', {
            'title': 'URGENT: Campus closed tomorrow',
            'content': 'All classes are cancelled due to maintenance.',
            'priority': 'urgent',
            'target_role': 'all',
        })
        self.assertEqual(response.status_code, 201)
        pushed.assert_called_once()
        notice = pushed.call_args.args[0]
        self.assertEqual(notice.priority, Notice.Priority.URGENT)
        self.assertEqual(response.json()['push_targeted'], 3)

    @mock.patch('booking.notice_views.push_urgent_notice')
    def test_normal_notice_does_not_push(self, pushed):
        self.client.force_login(self._admin())
        response = self.client.post('/api/notices/', {
            'title': 'Regular announcement',
            'content': 'Routine campus update.',
            'priority': 'normal',
            'target_role': 'all',
        })
        self.assertEqual(response.status_code, 201)
        pushed.assert_not_called()
        self.assertEqual(response.json()['push_targeted'], 0)

    @mock.patch('booking.notice_views.push_urgent_notice')
    def test_edit_to_urgent_triggers_push(self, pushed):
        self.client.force_login(self._admin())
        created = self.client.post('/api/notices/', {
            'title': 'Will be urgent',
            'content': 'Initial body.',
            'priority': 'normal',
            'target_role': 'all',
        })
        notice_id = created.json()['notice']['id']
        pushed.assert_not_called()

        response = self.client.patch(
            f'/api/notices/{notice_id}/',
            data=json.dumps({'priority': 'urgent'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['notice']['priority'], 'urgent')
        pushed.assert_called_once()

    @mock.patch('booking.notice_views.push_urgent_notice', return_value=0)
    def test_edit_urgent_to_urgent_does_not_repeat_push(self, pushed):
        self.client.force_login(self._admin())
        created = self.client.post('/api/notices/', {
            'title': 'Already urgent',
            'content': 'Body.',
            'priority': 'urgent',
            'target_role': 'all',
        })
        notice_id = created.json()['notice']['id']
        pushed.reset_mock()

        response = self.client.patch(
            f'/api/notices/{notice_id}/',
            data=json.dumps({'title': 'Already urgent (edited)'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        pushed.assert_not_called()
