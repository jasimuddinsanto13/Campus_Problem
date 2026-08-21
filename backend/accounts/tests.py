import json
import os

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

User = get_user_model()


class ProfileApiTests(TestCase):
    """GET/PUT /api/profile/ — the REST layer behind the React Settings page.

    GET returns the signed-in user's profile; PUT accepts multipart form data
    (full_name, email, optional profile_picture, remove_photo) and persists
    it to the database + media storage.
    """

    def _create_admin(self, **kwargs):
        return User.objects.create_user(
            kwargs.pop('username', 'profile@niter.local'),
            email=kwargs.pop('email', 'profile@niter.local'),
            password='strongpass123',
            role='admin',
            registration_status='approved',
            is_active=True,
            is_staff=True,
            **kwargs,
        )

    def _png(self, seed=b'0'):
        """A real, valid PNG (the API verifies image bytes with Pillow)."""
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new('RGB', (2, 2), (seed[0] % 256, 80, 120)).save(buf, format='PNG')
        return buf.getvalue()

    def _put_profile(self, payload):
        """Multipart PUT, encoded like a browser FormData request.

        Django's test client only form-encodes dicts for POST — put() would
        send the dict's repr as an octet-stream body — so the multipart body
        is built explicitly, exactly as the React Settings page sends it.
        """
        from django.test.client import BOUNDARY, encode_multipart

        body = encode_multipart(BOUNDARY, payload)
        return self.client.put(
            '/api/profile/', body,
            content_type=f'multipart/form-data; boundary={BOUNDARY}',
        )

    def test_anonymous_gets_401(self):
        response = self.client.get('/api/profile/')
        self.assertEqual(response.status_code, 401)

    def test_anonymous_put_gets_401(self):
        response = self._put_profile({'full_name': 'X Y', 'email': 'x@y.z'})
        self.assertEqual(response.status_code, 401)

    def test_get_returns_profile(self):
        self._create_admin(first_name='Santo', last_name='Uddin')
        user = User.objects.get(email='profile@niter.local')
        self.client.force_login(user)

        response = self.client.get('/api/profile/')
        self.assertEqual(response.status_code, 200)
        profile = response.json()['profile']
        self.assertEqual(profile['full_name'], 'Santo Uddin')
        self.assertEqual(profile['email'], 'profile@niter.local')
        self.assertEqual(profile['role'], 'admin')
        self.assertIsNone(profile['profile_picture'])

    def test_put_updates_name_email_and_username(self):
        user = self._create_admin()
        self.client.force_login(user)

        response = self._put_profile({
            'full_name': 'Jasim Uddin Santo',
            'email': 'santo@niter.local',
        })
        self.assertEqual(response.status_code, 200)

        user.refresh_from_db()
        self.assertEqual(user.full_name, 'Jasim Uddin Santo')
        self.assertEqual(user.first_name, 'Jasim')
        self.assertEqual(user.last_name, 'Uddin Santo')
        self.assertEqual(user.email, 'santo@niter.local')
        self.assertEqual(user.username, 'santo@niter.local')  # login identifier stays in sync
        self.assertEqual(response.json()['profile']['full_name'], 'Jasim Uddin Santo')

    def test_put_requires_full_name(self):
        user = self._create_admin()
        self.client.force_login(user)
        response = self._put_profile({'full_name': '  ', 'email': 'x@niter.local'})
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_invalid_email(self):
        user = self._create_admin()
        self.client.force_login(user)
        response = self._put_profile({'full_name': 'X Y', 'email': 'not-an-email'})
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_duplicate_email(self):
        self._create_admin(username='other@niter.local', email='other@niter.local')
        user = self._create_admin()
        self.client.force_login(user)

        response = self._put_profile({'full_name': 'X Y', 'email': 'other@niter.local'})
        self.assertEqual(response.status_code, 400)
        self.assertIn('already exists', response.json()['error'])

    def test_put_uploads_photo_and_returns_absolute_url(self):
        user = self._create_admin()
        self.client.force_login(user)
        png = SimpleUploadedFile('me.png', self._png(), content_type='image/png')

        response = self._put_profile({
            'full_name': 'Photo Person',
            'email': 'photo@niter.local',
            'profile_picture': png,
        })
        self.assertEqual(response.status_code, 200)

        user.refresh_from_db()
        self.assertTrue(user.profile_picture)
        url = response.json()['profile']['profile_picture']
        self.assertTrue(url.startswith('http://'))
        self.assertTrue(url.endswith(user.profile_picture.url))

        # A subsequent GET returns the same absolute media URL.
        again = self.client.get('/api/profile/')
        self.assertEqual(again.json()['profile']['profile_picture'], url)

    def test_put_replacing_photo_deletes_old_file(self):
        user = self._create_admin()
        self.client.force_login(user)
        first = SimpleUploadedFile('one.png', self._png(b'1'), content_type='image/png')
        self._put_profile({'full_name': 'A B', 'email': 'rep@niter.local', 'profile_picture': first})
        user.refresh_from_db()
        old_path = user.profile_picture.path
        self.assertTrue(os.path.exists(old_path))

        second = SimpleUploadedFile('two.png', self._png(b'2'), content_type='image/png')
        response = self._put_profile({'full_name': 'A B', 'email': 'rep@niter.local', 'profile_picture': second})
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.profile_picture)
        self.assertFalse(os.path.exists(old_path))  # replaced file removed

    def test_put_rejects_non_image_content_type(self):
        user = self._create_admin()
        self.client.force_login(user)
        fake = SimpleUploadedFile('x.html', b'<html>hi</html>', content_type='text/html')
        response = self._put_profile({'full_name': 'A B', 'email': 'fake@niter.local', 'profile_picture': fake})
        self.assertEqual(response.status_code, 400)

    def test_put_rejects_forged_image_bytes(self):
        """A forged image/* content-type on non-image bytes is rejected by the
        Pillow byte-verification."""
        user = self._create_admin()
        self.client.force_login(user)
        fake = SimpleUploadedFile('x.png', b'not really a png', content_type='image/png')
        response = self._put_profile({'full_name': 'A B', 'email': 'fake2@niter.local', 'profile_picture': fake})
        self.assertEqual(response.status_code, 400)

    def test_put_remove_photo_deletes_file_and_nulls_picture(self):
        user = self._create_admin()
        self.client.force_login(user)
        png = SimpleUploadedFile('me.png', self._png(), content_type='image/png')
        self._put_profile({
            'full_name': 'Photo Person',
            'email': 'photo@niter.local',
            'profile_picture': png,
        })
        user.refresh_from_db()
        path = user.profile_picture.path
        self.assertTrue(os.path.exists(path))

        response = self._put_profile({
            'full_name': 'Photo Person',
            'email': 'photo@niter.local',
            'remove_photo': '1',
        })
        self.assertEqual(response.status_code, 200)

        user.refresh_from_db()
        self.assertFalse(user.profile_picture)
        self.assertFalse(os.path.exists(path))
        self.assertIsNone(response.json()['profile']['profile_picture'])

    def test_put_rejects_oversized_photo(self):
        user = self._create_admin()
        self.client.force_login(user)
        big = SimpleUploadedFile('big.png', b'x' * (2 * 1024 * 1024 + 1), content_type='image/png')

        response = self._put_profile({
            'full_name': 'A B',
            'email': 'big@niter.local',
            'profile_picture': big,
        })
        self.assertEqual(response.status_code, 400)


class ProfilePictureApiTests(TestCase):
    """DELETE /api/profile/picture/ — the confirmed remove-photo flow behind
    the Settings page confirmation modal."""

    def _create_admin(self):
        return User.objects.create_user(
            'pic@niter.local',
            email='pic@niter.local',
            password='strongpass123',
            role='admin',
            registration_status='approved',
            is_active=True,
            is_staff=True,
        )

    def _png(self):
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new('RGB', (2, 2), (200, 80, 120)).save(buf, format='PNG')
        return buf.getvalue()

    def _upload_photo(self, user):
        from django.core.files.uploadedfile import SimpleUploadedFile
        from django.test.client import BOUNDARY, encode_multipart

        png = SimpleUploadedFile('me.png', self._png(), content_type='image/png')
        body = encode_multipart(BOUNDARY, {'full_name': 'Photo Person', 'email': user.email, 'profile_picture': png})
        return self.client.put(
            '/api/profile/', body,
            content_type=f'multipart/form-data; boundary={BOUNDARY}',
        )

    def test_anonymous_delete_gets_401(self):
        response = self.client.delete('/api/profile/picture/')
        self.assertEqual(response.status_code, 401)

    def test_delete_removes_file_and_nulls_picture(self):
        user = self._create_admin()
        self.client.force_login(user)
        self._upload_photo(user)
        user.refresh_from_db()
        path = user.profile_picture.path
        self.assertTrue(os.path.exists(path))

        response = self.client.delete('/api/profile/picture/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'ok': True, 'profile_picture': None})

        user.refresh_from_db()
        self.assertFalse(user.profile_picture)
        self.assertFalse(os.path.exists(path))  # file removed from storage

        # The profile API now reports no picture (initials fallback).
        profile = self.client.get('/api/profile/').json()['profile']
        self.assertIsNone(profile['profile_picture'])

    def test_delete_without_photo_is_idempotent_noop(self):
        user = self._create_admin()
        self.client.force_login(user)

        response = self.client.delete('/api/profile/picture/')
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertFalse(user.profile_picture)


class RoutinesApiTests(TestCase):
    """GET/PUT /api/routines/ — the REST layer behind the admin Routines
    wizard (department → batch → section → editable weekly table)."""

    def _make(self, username, role='admin', **kwargs):
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

    def _admin(self):
        user = self._make('routines-admin@niter.local', role='admin')
        self.client.force_login(user)
        return user

    def _put(self, payload):
        return self.client.put(
            '/api/routines/',
            data=json.dumps(payload),
            content_type='application/json',
        )

    def _slot(self, day='SUN', start='09:00', end='10:30', subject='Data Structures',
              faculty='Dr. Rahman', room='C-201'):
        return {'day': day, 'start_time': start, 'end_time': end,
                'subject': subject, 'faculty': faculty, 'room': room}

    def test_anonymous_gets_401(self):
        response = self.client.get('/api/routines/?department=CSE&batch=10&section=A')
        self.assertEqual(response.status_code, 401)

    def test_non_admin_cannot_write_routines(self):
        """Students/faculty may view routines but never write them."""
        self.client.force_login(self._make('stu@niter.local', role='student'))
        response = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                              'slots': [self._slot()]})
        self.assertEqual(response.status_code, 403)

    def test_faculty_can_view_routines(self):
        """Faculty (and any signed-in user) can read routines for their
        department/batch — the read-only view behind the faculty portal."""
        self._admin()
        self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                   'slots': [self._slot(subject='CSE Viewable')]})
        self.client.logout()

        self.client.force_login(self._make('teach@niter.local', role='teacher'))
        fetched = self.client.get('/api/routines/?department=CSE&batch=10&section=A')
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()['slots'][0]['subject'], 'CSE Viewable')

        # ...but the write path stays admin-only.
        put = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                         'slots': [self._slot()]})
        self.assertEqual(put.status_code, 403)

    def test_put_saves_rows_and_get_returns_them(self):
        from booking.models import RoutineSlot

        self._admin()
        response = self._put({
            'department': 'CSE',
            'batch': '10',
            'section': 'A',
            'slots': [
                self._slot(day='SUN'),
                self._slot(day='MON', subject='Algorithms', faculty='Prof. Khan', room='C-305'),
            ],
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['count'], 2)
        self.assertEqual(RoutineSlot.objects.count(), 2)

        fetched = self.client.get('/api/routines/?department=CSE&batch=10&section=A')
        self.assertEqual(fetched.status_code, 200)
        data = fetched.json()
        self.assertEqual(data['department'], 'CSE')
        self.assertEqual(data['batch'], '10')
        self.assertEqual(data['section'], 'A')
        self.assertEqual(len(data['slots']), 2)
        self.assertEqual(data['slots'][0]['subject'], 'Data Structures')
        self.assertEqual(data['slots'][0]['faculty'], 'Dr. Rahman')
        # 12-hour formatted times come back.
        self.assertEqual(data['slots'][0]['start_time'], '9:00 AM')
        self.assertEqual(data['slots'][0]['end_time'], '10:30 AM')

        # A different department+batch+section stays empty.
        other = self.client.get('/api/routines/?department=EEE&batch=10&section=A')
        self.assertEqual(other.json()['slots'], [])

    def test_sections_are_isolated(self):
        from booking.models import RoutineSlot

        self._admin()
        self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                   'slots': [self._slot(subject='Section A Subject')]})
        self._put({'department': 'CSE', 'batch': '10', 'section': 'B',
                   'slots': [self._slot(subject='Section B Subject')]})
        self.assertEqual(RoutineSlot.objects.count(), 2)

        a = self.client.get('/api/routines/?department=CSE&batch=10&section=A').json()['slots']
        b = self.client.get('/api/routines/?department=CSE&batch=10&section=B').json()['slots']
        self.assertEqual(a[0]['subject'], 'Section A Subject')
        self.assertEqual(b[0]['subject'], 'Section B Subject')

    def test_sections_are_department_dependent(self):
        """TE has 4 sections (A-D); CSE only has A and B."""
        self._admin()

        # TE accepts section D.
        ok = self._put({'department': 'TE', 'batch': '5', 'section': 'D',
                        'slots': [self._slot(subject='TE D Subject')]})
        self.assertEqual(ok.status_code, 200)

        # CSE rejects section C — it only offers A and B.
        bad = self._put({'department': 'CSE', 'batch': '10', 'section': 'C',
                         'slots': [self._slot(subject='Should fail')]})
        self.assertEqual(bad.status_code, 400)
        self.assertIn('section', bad.json()['error'].lower())

        # EEE / FDAE only have section A.
        bad_eee = self._put({'department': 'EEE', 'batch': '3', 'section': 'B',
                             'slots': [self._slot(subject='Should fail')]})
        self.assertEqual(bad_eee.status_code, 400)

        # GET validates against the department's sections too.
        bad_get = self.client.get('/api/routines/?department=CSE&batch=10&section=C')
        self.assertEqual(bad_get.status_code, 400)

    def test_put_replaces_existing_table(self):
        from booking.models import RoutineSlot

        self._admin()
        self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                   'slots': [self._slot(subject='Old Subject')]})
        self.assertEqual(RoutineSlot.objects.count(), 1)

        response = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                              'slots': [
                                  self._slot(day='TUE', subject='New Subject', faculty='Sir', room='A-1'),
                                  self._slot(day='WED', subject='Another', faculty='Maam', room='A-2'),
                              ]})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(RoutineSlot.objects.count(), 2)
        self.assertFalse(RoutineSlot.objects.filter(subject='Old Subject').exists())

    def test_put_validation_rejects_bad_input(self):
        self._admin()

        bad_dept = self._put({'department': 'ROBOT', 'batch': '10', 'section': 'A', 'slots': []})
        self.assertEqual(bad_dept.status_code, 400)

        bad_batch = self._put({'department': 'CSE', 'batch': '99', 'section': 'A', 'slots': []})
        self.assertEqual(bad_batch.status_code, 400)

        bad_section = self._put({'department': 'CSE', 'batch': '10', 'section': 'Z', 'slots': []})
        self.assertEqual(bad_section.status_code, 400)

        bad_day = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                             'slots': [self._slot(day='FRI')]})
        self.assertEqual(bad_day.status_code, 400)
        self.assertIn('day', bad_day.json()['error'].lower())

        # Saturday is a valid grid day.
        sat_ok = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                            'slots': [self._slot(day='SAT', subject='Saturday Class')]})
        self.assertEqual(sat_ok.status_code, 200)
        fetched = self.client.get('/api/routines/?department=CSE&batch=10&section=A')
        self.assertEqual(fetched.json()['slots'][0]['day'], 'SAT')
        self.assertEqual(fetched.json()['slots'][0]['subject'], 'Saturday Class')

        no_subject = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                                'slots': [self._slot(subject='   ')]})
        self.assertEqual(no_subject.status_code, 400)
        self.assertIn('subject', no_subject.json()['error'].lower())

        bad_time = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                              'slots': [self._slot(start='nope')]})
        self.assertEqual(bad_time.status_code, 400)
        self.assertIn('time', bad_time.json()['error'].lower())

        reversed_time = self._put({'department': 'CSE', 'batch': '10', 'section': 'A',
                                   'slots': [self._slot(start='11:00', end='09:00')]})
        self.assertEqual(reversed_time.status_code, 400)
        self.assertIn('before', reversed_time.json()['error'].lower())

        not_a_list = self._put({'department': 'CSE', 'batch': '10', 'section': 'A', 'slots': 'nope'})
        self.assertEqual(not_a_list.status_code, 400)

    def test_get_requires_valid_params(self):
        self._admin()
        response = self.client.get('/api/routines/?department=CSE&batch=abc&section=A')
        self.assertEqual(response.status_code, 400)
        response = self.client.get('/api/routines/?department=CSE&batch=10&section=Z')
        self.assertEqual(response.status_code, 400)


class UsersApiTests(TestCase):
    """GET /api/users/ + POST /api/users/<id>/<action>/ — the directory
    behind the React "Users" management page."""

    def _make(self, username, role='student', status='approved', active=True, **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status=status,
            is_active=active,
            is_staff=(role == 'admin'),
            **kwargs,
        )

    def _admin(self):
        user = self._make('admin@niter.local', role='admin')
        self.client.force_login(user)
        return user

    def test_anonymous_gets_401(self):
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 401)

    def test_non_admin_gets_403(self):
        self.client.force_login(self._make('stu@niter.local', role='student'))
        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 403)

    def test_list_returns_status_mapped_rows(self):
        self._make('active-stu@niter.local', role='student', status='approved',
                   active=True, department='CSE', batch='13')
        self._make('pending-stu@niter.local', role='student', status='pending', active=False)
        self._make('rejected-teach@niter.local', role='teacher', status='rejected', active=False)
        self._admin()

        response = self.client.get('/api/users/')
        self.assertEqual(response.status_code, 200)
        rows = {r['username']: r for r in response.json()['users']}

        self.assertEqual(rows['active-stu@niter.local']['status'], 'active')
        self.assertEqual(rows['active-stu@niter.local']['department'], 'CSE')
        self.assertEqual(rows['active-stu@niter.local']['batch'], '13')
        self.assertEqual(rows['pending-stu@niter.local']['status'], 'pending')
        self.assertEqual(rows['rejected-teach@niter.local']['status'], 'inactive')

    def test_approve_activates_user_and_syncs_request(self):
        from booking.models import RegistrationRequest

        pending = self._make('new-stu@niter.local', role='student', status='pending', active=False)
        RegistrationRequest.objects.create(
            user=pending, full_name='New Student', email=pending.email,
            role='student', status='pending',
        )
        self._admin()

        response = self.client.post(f'/api/users/{pending.id}/approve/')
        self.assertEqual(response.status_code, 200)
        pending.refresh_from_db()
        self.assertEqual(pending.registration_status, 'approved')
        self.assertTrue(pending.is_active)
        self.assertEqual(response.json()['user']['status'], 'active')
        self.assertEqual(pending.registration_request.status, 'approved')

    def test_deactivate_marks_inactive(self):
        active = self._make('old-stu@niter.local', role='student', status='approved', active=True)
        self._admin()

        response = self.client.post(f'/api/users/{active.id}/deactivate/')
        self.assertEqual(response.status_code, 200)
        active.refresh_from_db()
        self.assertEqual(active.registration_status, 'rejected')
        self.assertFalse(active.is_active)
        self.assertEqual(response.json()['user']['status'], 'inactive')

    def test_delete_removes_user(self):
        victim = self._make('victim@niter.local', role='student')
        admin = self._admin()

        response = self.client.post(f'/api/users/{victim.id}/delete/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(User.objects.filter(pk=victim.id).exists())

        # Cannot delete your own account.
        response = self.client.post(f'/api/users/{admin.id}/delete/')
        self.assertEqual(response.status_code, 400)
        self.assertTrue(User.objects.filter(pk=admin.id).exists())

    def test_role_change_validates_and_blocks_self_demotion(self):
        admin = self._admin()
        teacher = self._make('teach@niter.local', role='teacher')

        response = self.client.post(
            f'/api/users/{teacher.id}/role/', data='{"role": "admin"}', content_type='application/json')
        self.assertEqual(response.status_code, 200)
        teacher.refresh_from_db()
        self.assertEqual(teacher.role, 'admin')

        response = self.client.post(
            f'/api/users/{teacher.id}/role/', data='{"role": "robot"}', content_type='application/json')
        self.assertEqual(response.status_code, 400)

        response = self.client.post(
            f'/api/users/{admin.id}/role/', data='{"role": "student"}', content_type='application/json')
        self.assertEqual(response.status_code, 400)

    def test_unknown_action_rejected(self):
        user = self._make('any@niter.local', role='student')
        self._admin()
        response = self.client.post(f'/api/users/{user.id}/explode/')
        self.assertEqual(response.status_code, 400)

class NoticeApiTests(TestCase):
    """GET/POST /api/notices/ + role feeds — the role-based Notice Board.

    Admins manage notices (create / edit / pin / delete, optional PDF/image
    attachment); faculty and students only read the feed filtered to their
    role and department.
    """

    def _make(self, username, role='admin', department='', **kwargs):
        return User.objects.create_user(
            username,
            email=kwargs.pop('email', username),
            password='strongpass123',
            role=role,
            registration_status='approved',
            is_active=True,
            is_staff=(role == 'admin'),
            department=department,
            **kwargs,
        )

    def _admin(self):
        user = self._make('notices-admin@niter.local', role='admin')
        self.client.force_login(user)
        return user

    def _notice(self, title='Midterm Schedule', **kwargs):
        from booking.models import Notice

        defaults = {
            'title': title,
            'content': 'The schedule is out.',
            'priority': Notice.Priority.NORMAL,
            'target_role': Notice.TargetRole.ALL,
            'department': '',
            'pinned': False,
        }
        defaults.update(kwargs)
        return Notice.objects.create(created_by=None, **defaults)

    def _multipart(self, payload):
        """(body, content_type) pair for a multipart request, matching the
        browser FormData encoding the React pages send."""
        from django.test.client import BOUNDARY, encode_multipart

        body = encode_multipart(BOUNDARY, payload)
        return body, f'multipart/form-data; boundary={BOUNDARY}'

    def test_anonymous_is_redirected_to_login(self):
        response = self.client.get('/api/notices/')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse('login')))

    def test_non_admin_cannot_create_or_list(self):
        self.client.force_login(self._make('stu@niter.local', role='student'))
        response = self.client.get('/api/notices/')
        self.assertEqual(response.status_code, 403)
        body, ct = self._multipart({'title': 'X', 'content': 'Y'})
        response = self.client.post('/api/notices/', body, content_type=ct)
        self.assertEqual(response.status_code, 403)

    def test_admin_creates_and_lists_notice(self):
        self._admin()
        body, ct = self._multipart({
            'title': 'Midterm Exam Schedule Released',
            'content': 'See the routine for your batch.',
            'priority': 'urgent',
            'target_role': 'all',
            'department': '',
            'pinned': '1',
        })
        response = self.client.post('/api/notices/', body, content_type=ct)
        self.assertEqual(response.status_code, 201)
        notice = response.json()['notice']
        self.assertEqual(notice['title'], 'Midterm Exam Schedule Released')
        self.assertEqual(notice['priority_label'], 'Urgent')
        self.assertEqual(notice['target_label'], 'All Users')
        self.assertTrue(notice['pinned'])
        self.assertIsNone(notice['attachment_url'])

        listed = self.client.get('/api/notices/').json()['notices']
        self.assertEqual(len(listed), 1)
        self.assertEqual(listed[0]['id'], notice['id'])

    def test_create_validates_title_priority_and_department(self):
        self._admin()

        def post(fields):
            body, ct = self._multipart(fields)
            return self.client.post('/api/notices/', body, content_type=ct)

        self.assertEqual(post({'title': '  ', 'content': 'Body', 'priority': 'normal', 'target_role': 'all'}).status_code, 400)
        self.assertEqual(post({'title': 'T', 'content': 'Body', 'priority': 'critical', 'target_role': 'all'}).status_code, 400)
        self.assertEqual(post({'title': 'T', 'content': 'Body', 'priority': 'normal', 'target_role': 'all', 'department': 'ROBOT'}).status_code, 400)

    def test_attachment_upload_and_delete_removes_file(self):
        import os

        from booking.models import Notice

        self._admin()
        pdf = SimpleUploadedFile('notice.pdf', b'%PDF-1.4 fake', content_type='application/pdf')
        body, ct = self._multipart({
            'title': 'With File',
            'content': 'Body',
            'priority': 'normal',
            'target_role': 'all',
            'attachment': pdf,
        })
        response = self.client.post('/api/notices/', body, content_type=ct)
        self.assertEqual(response.status_code, 201)
        notice = Notice.objects.get()
        path = notice.attachment.path
        self.assertTrue(os.path.exists(path))
        self.assertTrue(response.json()['notice']['attachment_url'].startswith('http://'))
        self.assertEqual(response.json()['notice']['attachment_name'], 'notice.pdf')

        # Non-PDF / non-image attachments are rejected.
        bad = SimpleUploadedFile('x.html', b'<html>', content_type='text/html')
        body, ct = self._multipart({'title': 'Bad', 'content': 'Body', 'priority': 'normal', 'target_role': 'all', 'attachment': bad})
        rejected = self.client.post('/api/notices/', body, content_type=ct)
        self.assertEqual(rejected.status_code, 400)
        self.assertIn('PDF', rejected.json()['error'])

        # Deleting the notice also removes the attachment file from storage.
        delete = self.client.delete(f'/api/notices/{notice.id}/')
        self.assertEqual(delete.status_code, 200)
        self.assertFalse(os.path.exists(path))
        self.assertFalse(Notice.objects.exists())

    def test_admin_list_filters_by_target_and_category(self):
        """GET /api/notices/?target=&category=&dept= — the tab filter view on
        the admin Notice board."""
        from booking.models import Notice

        self._admin()
        self._notice('All Users General', target_role=Notice.TargetRole.ALL)
        self._notice('Student General', target_role=Notice.TargetRole.STUDENT)
        self._notice('Faculty General', target_role=Notice.TargetRole.FACULTY)
        self._notice('Student CSE', target_role=Notice.TargetRole.STUDENT, department='CSE')
        self._notice('Student CSE Batch10', target_role=Notice.TargetRole.STUDENT, department='CSE', batch='10')
        self._notice('Faculty EEE', target_role=Notice.TargetRole.FACULTY, department='EEE')

        def titles(url):
            return {n['title'] for n in self.client.get(url).json()['notices']}

        # Student + General: student/all audience, no dept/batch/section scope.
        got = titles('/api/notices/?target=student&category=general')
        self.assertIn('All Users General', got)
        self.assertIn('Student General', got)
        self.assertNotIn('Faculty General', got)
        self.assertNotIn('Student CSE', got)

        # Student + Department + dept=CSE: scoped student notices only.
        got = titles('/api/notices/?target=student&category=department&dept=CSE')
        self.assertIn('Student CSE', got)
        self.assertIn('Student CSE Batch10', got)
        self.assertNotIn('Student General', got)
        self.assertNotIn('Faculty EEE', got)

        # Faculty: all-users + faculty audience (scope-agnostic).
        got = titles('/api/notices/?target=faculty')
        self.assertIn('All Users General', got)
        self.assertIn('Faculty General', got)
        self.assertIn('Faculty EEE', got)
        self.assertNotIn('Student General', got)

        # Faculty + Department: dept-scoped faculty notices.
        got = titles('/api/notices/?target=faculty&category=department&dept=EEE')
        self.assertIn('Faculty EEE', got)
        self.assertNotIn('Faculty General', got)
        self.assertNotIn('Student CSE', got)

        # Invalid filter params are rejected.
        self.assertEqual(self.client.get('/api/notices/?target=robot').status_code, 400)
        self.assertEqual(self.client.get('/api/notices/?category=department&dept=ROBOT').status_code, 400)
        self.assertEqual(self.client.get('/api/notices/?category=banana').status_code, 400)

    def test_faculty_notice_can_be_department_specific(self):
        """Faculty-only notices may target a department (batch/section stay
        student-only) — backs the 'Department Faculty Notices' sub-tab."""
        self._admin()
        body, ct = self._multipart({'title': 'Dept Faculty', 'content': 'B',
                                    'priority': 'normal', 'target_role': 'faculty',
                                    'department': 'CSE'})
        response = self.client.post('/api/notices/', body, content_type=ct)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['notice']['department'], 'CSE')

    def test_faculty_feed_filters_role_and_department(self):
        from booking.models import Notice

        self._notice('All Users', target_role=Notice.TargetRole.ALL)
        self._notice('Faculty Only', target_role=Notice.TargetRole.FACULTY)
        self._notice('Students Only', target_role=Notice.TargetRole.STUDENT)
        self._notice('CSE Specific', target_role=Notice.TargetRole.ALL, department='CSE')
        self._notice('EEE Specific', target_role=Notice.TargetRole.ALL, department='EEE')

        self.client.force_login(self._make('teach@niter.local', role='teacher', department='CSE'))
        feed = self.client.get('/api/notices/faculty/').json()['notices']
        titles = {n['title'] for n in feed}
        self.assertIn('All Users', titles)
        self.assertIn('Faculty Only', titles)
        self.assertIn('CSE Specific', titles)
        self.assertNotIn('Students Only', titles)  # wrong role
        self.assertNotIn('EEE Specific', titles)   # wrong department

    def test_student_feed_filters_role_and_department(self):
        from booking.models import Notice

        self._notice('All Users', target_role=Notice.TargetRole.ALL)
        self._notice('Faculty Only', target_role=Notice.TargetRole.FACULTY)
        self._notice('Students Only', target_role=Notice.TargetRole.STUDENT)
        self._notice('CSE Specific', target_role=Notice.TargetRole.STUDENT, department='CSE')
        self._notice('EEE Specific', target_role=Notice.TargetRole.STUDENT, department='EEE')

        self.client.force_login(self._make('stu@niter.local', role='student', department='CSE'))
        feed = self.client.get('/api/notices/student/').json()['notices']
        titles = {n['title'] for n in feed}
        self.assertIn('All Users', titles)
        self.assertIn('Students Only', titles)
        self.assertIn('CSE Specific', titles)
        self.assertNotIn('Faculty Only', titles)
        self.assertNotIn('EEE Specific', titles)

    def test_student_feed_filters_batch_and_section(self):
        """A student only sees notices whose batch/section scope is empty or
        exactly matches their own registration."""
        from booking.models import Notice

        self._notice('All Students', target_role=Notice.TargetRole.STUDENT)
        self._notice('CSE Batch 10', target_role=Notice.TargetRole.STUDENT, department='CSE', batch='10')
        self._notice('CSE Batch 10 Sec A', target_role=Notice.TargetRole.STUDENT, department='CSE', batch='10', section='A')
        self._notice('CSE Batch 10 Sec B', target_role=Notice.TargetRole.STUDENT, department='CSE', batch='10', section='B')
        self._notice('EEE Batch 10', target_role=Notice.TargetRole.STUDENT, department='EEE', batch='10')

        self.client.force_login(self._make('stu@niter.local', role='student',
                                           department='CSE', batch='10', section='A'))
        feed = self.client.get('/api/notices/student/').json()['notices']
        titles = {n['title'] for n in feed}
        self.assertIn('All Students', titles)
        self.assertIn('CSE Batch 10', titles)
        self.assertIn('CSE Batch 10 Sec A', titles)
        self.assertNotIn('CSE Batch 10 Sec B', titles)  # wrong section
        self.assertNotIn('EEE Batch 10', titles)        # wrong department

    def test_create_notice_validates_batch_and_section(self):
        self._admin()

        body, ct = self._multipart({'title': 'T', 'content': 'B', 'priority': 'normal',
                                    'target_role': 'student', 'department': 'CSE', 'batch': '99'})
        self.assertEqual(self.client.post('/api/notices/', body, content_type=ct).status_code, 400)

        body, ct = self._multipart({'title': 'T', 'content': 'B', 'priority': 'normal',
                                    'target_role': 'student', 'department': 'CSE',
                                    'batch': '10', 'section': 'Z'})
        self.assertEqual(self.client.post('/api/notices/', body, content_type=ct).status_code, 400)

        # A section without a department is meaningless.
        body, ct = self._multipart({'title': 'T', 'content': 'B', 'priority': 'normal',
                                    'target_role': 'student', 'section': 'A'})
        self.assertEqual(self.client.post('/api/notices/', body, content_type=ct).status_code, 400)

        # A batch without a department would be invisible to the admin
        # filter tabs (neither general nor any department) — reject it.
        body, ct = self._multipart({'title': 'T', 'content': 'B', 'priority': 'normal',
                                    'target_role': 'student', 'batch': '10'})
        self.assertEqual(self.client.post('/api/notices/', body, content_type=ct).status_code, 400)

        # Faculty-only notices cannot carry batch/section narrowing (they
        # would match no one — faculty accounts have no batch/section).
        body, ct = self._multipart({'title': 'T', 'content': 'B', 'priority': 'normal',
                                    'target_role': 'faculty', 'department': 'CSE',
                                    'batch': '10', 'section': 'A'})
        self.assertEqual(self.client.post('/api/notices/', body, content_type=ct).status_code, 400)

    def test_create_persists_batch_and_section(self):
        self._admin()
        body, ct = self._multipart({'title': 'Precise', 'content': 'B', 'priority': 'normal',
                                    'target_role': 'student', 'department': 'CSE',
                                    'batch': '10', 'section': 'B'})
        response = self.client.post('/api/notices/', body, content_type=ct)
        self.assertEqual(response.status_code, 201)
        notice = response.json()['notice']
        self.assertEqual(notice['department'], 'CSE')
        self.assertEqual(notice['batch'], '10')
        self.assertEqual(notice['section'], 'B')

    def test_admin_feed_endpoint_is_forbidden(self):
        self._admin()
        response = self.client.get('/api/notices/faculty/')
        self.assertEqual(response.status_code, 403)

    def test_pin_toggle_and_edit(self):
        from booking.models import Notice

        self._admin()
        notice = self._notice('Pin Me')

        pin = self.client.patch(
            f'/api/notices/{notice.id}/',
            data=json.dumps({'pinned': True}),
            content_type='application/json',
        )
        self.assertEqual(pin.status_code, 200)
        self.assertTrue(pin.json()['notice']['pinned'])

        # Pinned notices float above unpinned ones in the admin list.
        self._notice('Older')
        listed = self.client.get('/api/notices/').json()['notices']
        self.assertEqual(listed[0]['id'], notice.id)

        body, ct = self._multipart({'title': 'Renamed', 'content': 'New body', 'priority': 'important', 'target_role': 'faculty'})
        edit = self.client.patch(f'/api/notices/{notice.id}/', body, content_type=ct)
        self.assertEqual(edit.status_code, 200)
        notice.refresh_from_db()
        self.assertEqual(notice.title, 'Renamed')
        self.assertEqual(notice.priority, Notice.Priority.IMPORTANT)
        self.assertEqual(notice.target_role, Notice.TargetRole.FACULTY)
        self.assertTrue(notice.pinned)  # unchanged by the edit

    def test_non_admin_cannot_delete_or_edit(self):
        from booking.models import Notice

        notice = self._notice('Protected')
        self.client.force_login(self._make('teach@niter.local', role='teacher'))
        self.assertEqual(self.client.delete(f'/api/notices/{notice.id}/').status_code, 403)
        self.assertEqual(
            self.client.patch(f'/api/notices/{notice.id}/', data=json.dumps({'pinned': True}),
                              content_type='application/json').status_code,
            403,
        )
        self.assertTrue(Notice.objects.filter(pk=notice.id).exists())


def _admin_payload(email, campus_id, passkey):
    return {
        'full_name': 'Test Admin',
        'email': email,
        'campus_id': campus_id,
        'password': 'strongpass123',
        'confirm_password': 'strongpass123',
        'role': 'admin',
        'admin_passkey': passkey,
    }


class AdminPasskeyRegistrationTests(TestCase):
    """Admin registration must accept any DB-seeded passkey (add001..add010
    and ad001..ad010)."""

    def test_seeded_db_passkey_registers_approved_admin(self):
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-add001@niter.local', 'ADM-00001', 'add001'))

        self.assertEqual(response.status_code, 302)  # auto-login redirect
        user = User.objects.get(username='admin-add001@niter.local')
        self.assertEqual(user.role, 'admin')
        self.assertEqual(user.registration_status, User.RegistrationStatus.APPROVED)
        self.assertTrue(user.is_active)

    def test_last_seeded_passkey_registers_admin(self):
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-add010@niter.local', 'ADM-00010', 'add010'))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(User.objects.filter(username='admin-add010@niter.local').exists())

    # ---- Alt passkeys: ad001..ad010 ----

    def test_alt_passkey_ad001_registers_approved_admin(self):
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-ad001@niter.local', 'ADM-01001', 'ad001'))

        self.assertEqual(response.status_code, 302)  # auto-login redirect
        user = User.objects.get(username='admin-ad001@niter.local')
        self.assertEqual(user.role, 'admin')
        self.assertEqual(user.registration_status, User.RegistrationStatus.APPROVED)
        self.assertTrue(user.is_active)

    def test_alt_passkey_ad010_registers_admin(self):
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-ad010@niter.local', 'ADM-01010', 'ad010'))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(User.objects.filter(username='admin-ad010@niter.local').exists())

    def test_alt_passkey_via_admin_key_field(self):
        """The admin_key POST field (the one the frontend actually submits)
        must also accept the ad001..ad010 alt passkeys."""
        response = self.client.post(reverse('register'), {
            'full_name': 'Alt Key Admin',
            'email': 'alt-admin@niter.local',
            'admin_key': 'ad005',
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'admin',
        })
        self.assertEqual(response.status_code, 302)
        user = User.objects.get(email='alt-admin@niter.local')
        self.assertEqual(user.role, 'admin')
        self.assertEqual(user.registration_status, User.RegistrationStatus.APPROVED)
        self.assertTrue(user.is_active)

    def test_alt_passkey_case_insensitive(self):
        """Passkey matching is case-insensitive: AD003 should work like ad003."""
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-adupper@niter.local', 'ADM-01003', 'AD003'))

        self.assertEqual(response.status_code, 302)
        self.assertTrue(User.objects.filter(username='admin-adupper@niter.local').exists())

    def test_deactivated_passkey_rejects_admin_registration(self):
        from booking.models import AdminPasskey

        AdminPasskey.objects.filter(code='add001').update(is_active=False)
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-revoked@niter.local', 'ADM-00002', 'add001'))

        # PRG: failed POST redirects to a clean GET, then the error shows once.
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('register'))
        page = self.client.get(reverse('register'))
        self.assertContains(page, 'Invalid admin security key')
        self.assertFalse(User.objects.filter(username='admin-revoked@niter.local').exists())

    def test_invalid_passkey_rejects_admin_registration(self):
        response = self.client.post(reverse('register'), _admin_payload(
            'admin-bad@niter.local', 'ADM-00099', 'not-a-passkey'))

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('register'))
        page = self.client.get(reverse('register'))
        self.assertContains(page, 'Invalid admin security key')
        self.assertFalse(User.objects.filter(username='admin-bad@niter.local').exists())

    def test_refresh_after_error_shows_clean_form(self):
        """A refresh (repeat GET) must not re-show the previous error."""
        self.client.post(reverse('register'), _admin_payload(
            'admin-bad@niter.local', 'ADM-00099', 'not-a-passkey'))
        self.client.get(reverse('register'))  # first render with the error

        refreshed = self.client.get(reverse('register'))  # the "F5"
        self.assertNotContains(refreshed, 'Invalid admin passkey')

    def test_register_rejects_invalid_email(self):
        """Registration must validate the email format (well-formed address)."""
        response = self.client.post(reverse('register'), {
            'full_name': 'Bad Email',
            'email': 'not-an-email',
            'campus_id': 'CSE-12345',
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'student',
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('register'))
        page = self.client.get(reverse('register'))
        self.assertContains(page, 'Enter a valid email address')
        self.assertFalse(User.objects.filter(email='not-an-email').exists())

    def test_admin_registers_with_admin_key_field(self):
        """The Admin tab submits admin_key (and no campus ID at all); it maps
        to the passkey check and the admin is approved instantly."""
        response = self.client.post(reverse('register'), {
            'full_name': 'Key Admin',
            'email': 'key-admin@niter.local',
            'admin_key': 'add002',
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'admin',
        })
        self.assertEqual(response.status_code, 302)  # auto-login redirect
        user = User.objects.get(email='key-admin@niter.local')
        self.assertEqual(user.role, 'admin')
        self.assertEqual(user.registration_status, User.RegistrationStatus.APPROVED)
        self.assertTrue(user.is_active)
        self.assertIsNone(user.campus_id)  # the key is a secret, never stored

    def test_admin_requires_security_key_and_student_requires_id(self):
        """Each role validates ITS OWN field: admin needs admin_key, students
        need an ID — the other role's field is not accepted as a substitute."""
        no_key = self.client.post(reverse('register'), {
            'full_name': 'No Key',
            'email': 'nokey@niter.local',
            'student_id': 'CSE-11111',  # a student ID must not satisfy admin
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'admin',
        })
        self.assertEqual(no_key.status_code, 302)
        page = self.client.get(reverse('register'))
        self.assertContains(page, 'security key is required')
        self.assertFalse(User.objects.filter(email='nokey@niter.local').exists())

        no_id = self.client.post(reverse('register'), {
            'full_name': 'No Id',
            'email': 'noid@niter.local',
            'admin_key': 'add003',  # an admin key must not satisfy student
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'student',
        })
        page2 = self.client.get(reverse('register'))
        self.assertContains(page2, 'student or faculty ID')
        self.assertFalse(User.objects.filter(email='noid@niter.local').exists())

    def test_register_accepts_role_specific_id_field(self):
        """Faculty/student/admin tabs submit faculty_id/student_id/admin_id;
        any of them must map to the stored campus_id column."""
        response = self.client.post(reverse('register'), {
            'full_name': 'Faculty Person',
            'email': 'faculty@niter.local',
            'faculty_id': 'FAC-2024-01',
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'teacher',
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('register'))

        user = User.objects.get(email='faculty@niter.local')
        self.assertEqual(user.role, 'teacher')
        self.assertEqual(user.campus_id, 'FAC-2024-01')
        # Faculty stays pending until an admin approves them.
        self.assertEqual(user.registration_status, User.RegistrationStatus.PENDING)
        self.assertFalse(user.is_active)

    def test_student_success_screen_does_not_resubmit_on_refresh(self):
        """A successful student registration also PRG-redirects, so a refresh
        on the success screen can't re-submit and error with 'already exists'."""
        response = self.client.post(reverse('register'), {
            'full_name': 'New Student',
            'email': 'stu@niter.local',
            'campus_id': 'CSE-99999',
            'department': 'CSE',
            'batch': '12',
            'section': 'A',
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'student',
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('register'))

        user = User.objects.get(email='stu@niter.local')
        self.assertEqual(user.department, 'CSE')
        self.assertEqual(user.batch, '12')
        self.assertEqual(user.section, 'A')

        page = self.client.get(reverse('register'))
        self.assertContains(page, 'Registration submitted')

        refreshed = self.client.get(reverse('register'))  # the "F5"
        self.assertNotContains(refreshed, 'Registration submitted')
        self.assertNotContains(refreshed, 'already exists')
        self.assertEqual(User.objects.filter(username='stu@niter.local').count(), 1)

    def test_student_registration_requires_department_batch_section(self):
        """Students must pick a department, a batch (0-16) and a section that
        the chosen department actually offers; the values are persisted and
        the account stays pending for admin approval."""
        base = {
            'full_name': 'Academy Student',
            'email': 'academy@niter.local',
            'campus_id': 'CSE-55555',
            'password': 'strongpass123',
            'confirm_password': 'strongpass123',
            'role': 'student',
        }

        # No department at all.
        self.client.post(reverse('register'), base)
        self.assertContains(self.client.get(reverse('register')), 'Please choose your department')

        # Department but no batch.
        self.client.post(reverse('register'), {**base, 'email': 'academy2@niter.local', 'department': 'CSE'})
        self.assertContains(self.client.get(reverse('register')), 'Please choose a valid batch')

        # A section that CSE does not offer.
        self.client.post(reverse('register'), {**base, 'email': 'academy3@niter.local',
                                               'department': 'CSE', 'batch': '10', 'section': 'Z'})
        self.assertContains(self.client.get(reverse('register')), 'Please choose a valid section for CSE')
        self.assertFalse(User.objects.filter(email='academy3@niter.local').exists())

        # A complete, valid registration persists the academics and stays pending.
        response = self.client.post(reverse('register'), {
            **base, 'email': 'academy-ok@niter.local',
            'department': 'CSE', 'batch': '10', 'section': 'B',
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('register'))
        user = User.objects.get(email='academy-ok@niter.local')
        self.assertEqual(user.department, 'CSE')
        self.assertEqual(user.batch, '10')
        self.assertEqual(user.section, 'B')
        self.assertEqual(user.registration_status, User.RegistrationStatus.PENDING)
        self.assertFalse(user.is_active)

    def test_login_preserves_next_across_error_redirect(self):
        """After a failed login, fixing the credentials still lands on the
        protected page the user originally requested (?next=)."""
        User.objects.create_user(
            'carol@niter.local', email='carol@niter.local', password='rightpass123',
            role='student', registration_status='approved', is_active=True,
        )

        bad = self.client.post(
            reverse('login') + '?next=/portal/student/',
            {'email': 'carol@niter.local', 'password': 'wrongpass', 'role': 'student'},
        )
        self.assertEqual(bad.status_code, 302)
        self.assertEqual(bad.url, reverse('login'))
        self.assertContains(self.client.get(reverse('login')), 'Incorrect password')

        good = self.client.post(
            reverse('login'),
            {'email': 'carol@niter.local', 'password': 'rightpass123', 'role': 'student'},
        )
        self.assertEqual(good.status_code, 302)
        self.assertEqual(good.url, '/portal/student/')


class RootEntryPointTests(TestCase):
    """The site root must be an entry point: login page when signed out,
    the single modern dashboard when signed in. The issue desk now lives at
    /issues/."""

    def test_anonymous_root_redirects_to_login(self):
        response = self.client.get('/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('login'))

    def test_logged_in_admin_root_redirects_to_admin_portal(self):
        user = User.objects.create_user(
            'root-admin@niter.local', email='root-admin@niter.local',
            password='strongpass123', role='admin',
            registration_status='approved', is_active=True, is_staff=True,
        )
        self.client.force_login(user)
        response = self.client.get('/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, '/admin/dashboard')

    def test_logged_in_student_root_redirects_to_student_portal(self):
        user = User.objects.create_user(
            'root-stu@niter.local', email='root-stu@niter.local',
            password='strongpass123', role='student',
            registration_status='approved', is_active=True,
        )
        self.client.force_login(user)
        response = self.client.get('/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, '/student/dashboard')

    def test_login_redirects_each_role_to_its_own_portal(self):
        """Admin -> /admin/dashboard, Faculty -> /faculty/dashboard,
        Student -> /student/dashboard."""
        for username, role, target in (
            ('login-admin@niter.local', 'admin', '/admin/dashboard'),
            ('login-teach@niter.local', 'teacher', '/faculty/dashboard'),
            ('login-stu@niter.local', 'student', '/student/dashboard'),
        ):
            User.objects.create_user(
                username, email=username, password='rightpass123', role=role,
                registration_status='approved', is_active=True, is_staff=(role == 'admin'),
            )
            response = self.client.post(reverse('login'), {
                'email': username, 'password': 'rightpass123', 'role': role,
            })
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.url, target)
            self.client.logout()

    def test_legacy_role_portals_redirect_to_their_role_portal(self):
        """Deprecated role-portal landings bounce to each role's new portal."""
        user = User.objects.create_user(
            'legacy-admin@niter.local', email='legacy-admin@niter.local',
            password='strongpass123', role='admin',
            registration_status='approved', is_active=True, is_staff=True,
        )
        self.client.force_login(user)

        expected = {
            'admin_portal:admin_dashboard': '/admin/dashboard',
            'faculty_portal:faculty_dashboard': '/faculty/dashboard',
            'student_portal:student_dashboard': '/student/dashboard',
        }
        for url_name, target in expected.items():
            response = self.client.get(reverse(url_name))
            self.assertEqual(response.status_code, 302)
            self.assertEqual(response.url, target)

    def test_issue_desk_requires_login(self):
        response = self.client.get('/issues/')
        self.assertEqual(response.status_code, 302)
        self.assertEqual(response.url, reverse('login') + '?next=/issues/')

    def test_logged_in_user_can_open_issue_desk(self):
        user = User.objects.create_user(
            'desk-stu@niter.local', email='desk-stu@niter.local',
            password='strongpass123', role='student',
            registration_status='approved', is_active=True,
        )
        self.client.force_login(user)
        response = self.client.get('/issues/')
        self.assertEqual(response.status_code, 200)
