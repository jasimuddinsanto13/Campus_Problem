"""Tests for the Campus Issue Desk REST endpoints (issues.api_views)."""

import json
import os

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.urls import reverse

from .models import CampusIssue

User = get_user_model()


class CampusIssueApiTests(TestCase):
    """Faculty submission / outbox + admin management endpoints."""

    def _make(self, username, role='student', **kwargs):
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
        user = self._make('teach@niter.local', role='teacher')
        self.client.force_login(user)
        return user

    def _admin(self):
        user = self._make('admin@niter.local', role='admin')
        self.client.force_login(user)
        return user

    def _png(self):
        """A real, valid PNG (the API verifies image bytes with Pillow)."""
        import io

        from PIL import Image

        buf = io.BytesIO()
        Image.new('RGB', (2, 2), (60, 120, 200)).save(buf, format='PNG')
        return buf.getvalue()

    def _multipart(self, payload):
        """(body, content_type) for a multipart request, matching the browser
        FormData encoding the React pages send."""
        from django.test.client import BOUNDARY, encode_multipart

        body = encode_multipart(BOUNDARY, payload)
        return body, f'multipart/form-data; boundary={BOUNDARY}'

    def _submit(self, fields=None, files=None):
        payload = {
            'category': 'electrical',
            'title': 'AC not cooling in Room 302',
            'building': 'Academic Building 1',
            'room': 'Room 302',
            'description': 'The AC unit has been blowing hot air all week.',
        }
        payload.update(fields or {})
        payload.update(files or {})
        body, ct = self._multipart(payload)
        return self.client.post('/api/issues/create/', body, content_type=ct)

    # ---- Auth & role gating ----

    def test_anonymous_is_redirected_to_login(self):
        response = self.client.get('/api/issues/my-issues/')
        self.assertEqual(response.status_code, 302)
        self.assertTrue(response.url.startswith(reverse('login')))

        response = self.client.post('/api/issues/create/')
        self.assertEqual(response.status_code, 302)

        response = self.client.get('/api/admin/issues/')
        self.assertEqual(response.status_code, 302)

    def test_non_admin_cannot_use_admin_endpoints(self):
        self._teacher()
        issue = CampusIssue.objects.create(
            user=User.objects.get(email='teach@niter.local'),
            category='other', title='Broken projector', location='Building X',
            description='Projector lamp is dead.',
        )
        self.assertEqual(self.client.get('/api/admin/issues/').status_code, 403)
        patch = self.client.patch(
            f'/api/admin/issues/{issue.id}/',
            data=json.dumps({'status': 'in_progress'}),
            content_type='application/json',
        )
        self.assertEqual(patch.status_code, 403)

    # ---- Create ----

    def test_create_issue(self):
        teacher = self._teacher()
        response = self._submit()
        self.assertEqual(response.status_code, 201)
        issue = response.json()['issue']
        self.assertEqual(issue['title'], 'AC not cooling in Room 302')
        self.assertEqual(issue['category_label'], 'Electrical / AC Fault')
        self.assertEqual(issue['location'], 'Academic Building 1 · Room 302')
        self.assertEqual(issue['status'], 'pending')
        self.assertEqual(issue['status_label'], 'Pending Admin Review')
        self.assertEqual(issue['reporter'], teacher.get_display_name())
        self.assertTrue(issue['ticket_id'].startswith('CMP-'))
        self.assertEqual(CampusIssue.objects.get().user_id, teacher.id)

    def test_create_without_room_keeps_building_only(self):
        self._teacher()
        response = self._submit({'room': ''})
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()['issue']['location'], 'Academic Building 1')

    def test_create_validates_input(self):
        self._teacher()
        self.assertEqual(self._submit({'category': 'robot'}).status_code, 400)
        self.assertEqual(self._submit({'title': '   '}).status_code, 400)
        self.assertEqual(self._submit({'building': ''}).status_code, 400)
        self.assertEqual(self._submit({'description': '  '}).status_code, 400)

    def test_create_accepts_png_attachment(self):
        self._teacher()
        png = SimpleUploadedFile('photo.png', self._png(), content_type='image/png')
        response = self._submit(files={'attachment': png})
        self.assertEqual(response.status_code, 201)
        issue = response.json()['issue']
        stored = CampusIssue.objects.get().attachment
        self.assertTrue(issue['attachment_url'].startswith('http://'))
        # Storage may append a suffix on name collision across runs — assert
        # the reported name is the stored file's base name.
        self.assertEqual(issue['attachment_name'], os.path.basename(stored.name))
        self.assertTrue(os.path.exists(stored.path))

    def test_create_rejects_invalid_attachment_types(self):
        self._teacher()
        html = SimpleUploadedFile('x.html', b'<html>', content_type='text/html')
        self.assertEqual(self._submit(files={'attachment': html}).status_code, 400)

        fake = SimpleUploadedFile('x.png', b'not really a png', content_type='image/png')
        rejected = self._submit(files={'attachment': fake})
        self.assertEqual(rejected.status_code, 400)
        self.assertIn('image', rejected.json()['error'].lower())

        big = SimpleUploadedFile('big.png', b'x' * (10 * 1024 * 1024 + 1), content_type='image/png')
        self.assertEqual(self._submit(files={'attachment': big}).status_code, 400)

    # ---- Outbox + delete ----

    def test_my_issues_returns_only_own(self):
        teacher = self._teacher()
        self._submit({'title': 'Mine'})
        other = self._make('other@niter.local', role='teacher')
        CampusIssue.objects.create(
            user=other, category='other', title='Not mine', location='Library',
            description='Some other person issue.',
        )

        got = self.client.get('/api/issues/my-issues/').json()['issues']
        self.assertEqual(len(got), 1)
        self.assertEqual(got[0]['title'], 'Mine')

    def test_delete_own_issue_removes_attachment(self):
        teacher = self._teacher()
        png = SimpleUploadedFile('del.png', self._png(), content_type='image/png')
        issue = CampusIssue.objects.create(
            user=teacher, category='other', title='To delete', location='Cafeteria',
            description='Issue with a file.', attachment=png,
        )
        path = issue.attachment.path
        self.assertTrue(os.path.exists(path))

        response = self.client.delete(f'/api/issues/{issue.id}/')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(os.path.exists(path))
        self.assertFalse(CampusIssue.objects.filter(pk=issue.id).exists())

    def test_cannot_delete_someone_elses_issue(self):
        teacher = self._teacher()
        other = self._make('other@niter.local', role='teacher')
        issue = CampusIssue.objects.create(
            user=other, category='other', title='Theirs', location='Library',
            description='Not yours.',
        )
        response = self.client.delete(f'/api/issues/{issue.id}/')
        self.assertEqual(response.status_code, 403)
        self.assertTrue(CampusIssue.objects.filter(pk=issue.id).exists())

    # ---- Admin management ----

    def test_admin_lists_all_issues_and_filters(self):
        self._make('t1@niter.local', role='teacher')
        self._make('t2@niter.local', role='teacher')
        CampusIssue.objects.create(user=User.objects.get(email='t1@niter.local'),
                                   category='electrical', title='AC A', location='B1',
                                   description='x', status='pending')
        CampusIssue.objects.create(user=User.objects.get(email='t2@niter.local'),
                                   category='cleanliness', title='Mess B', location='B2',
                                   description='y', status='resolved')
        self._admin()

        all_issues = self.client.get('/api/admin/issues/').json()['issues']
        self.assertEqual(len(all_issues), 2)

        pending = self.client.get('/api/admin/issues/?status=pending').json()['issues']
        self.assertEqual([i['title'] for i in pending], ['AC A'])

        cleanliness = self.client.get('/api/admin/issues/?category=cleanliness').json()['issues']
        self.assertEqual([i['title'] for i in cleanliness], ['Mess B'])

        bad = self.client.get('/api/admin/issues/?status=robot')
        self.assertEqual(bad.status_code, 400)
        bad_cat = self.client.get('/api/admin/issues/?category=robot')
        self.assertEqual(bad_cat.status_code, 400)

    def test_admin_updates_status_and_response(self):
        teacher = self._make('t@niter.local', role='teacher')
        admin = self._make('admin@niter.local', role='admin')
        issue = CampusIssue.objects.create(
            user=teacher, category='electrical', title='AC A', location='B1',
            description='x', status='pending',
        )
        self.client.force_login(admin)

        response = self.client.patch(
            f'/api/admin/issues/{issue.id}/',
            data=json.dumps({'status': 'in_progress', 'admin_response': 'Engineer dispatched.'}),
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()['issue']
        self.assertEqual(payload['status'], 'in_progress')
        self.assertEqual(payload['status_label'], 'In Progress')
        self.assertEqual(payload['admin_response'], 'Engineer dispatched.')

        # The faculty outbox now reflects the new status instantly.
        self.client.logout()
        self.client.force_login(teacher)
        mine = self.client.get('/api/issues/my-issues/').json()['issues'][0]
        self.assertEqual(mine['status'], 'in_progress')
        self.assertEqual(mine['admin_response'], 'Engineer dispatched.')

        # Partial update keeps the other field.
        self.client.logout()
        self.client.force_login(admin)
        resolved = self.client.patch(
            f'/api/admin/issues/{issue.id}/',
            data=json.dumps({'status': 'resolved'}),
            content_type='application/json',
        ).json()['issue']
        self.assertEqual(resolved['status'], 'resolved')
        self.assertEqual(resolved['admin_response'], 'Engineer dispatched.')

    def test_admin_update_validates_status(self):
        teacher = self._make('t@niter.local', role='teacher')
        issue = CampusIssue.objects.create(
            user=teacher, category='other', title='T', location='L',
            description='d', status='pending',
        )
        self._admin()
        bad = self.client.patch(
            f'/api/admin/issues/{issue.id}/',
            data=json.dumps({'status': 'banana'}),
            content_type='application/json',
        )
        self.assertEqual(bad.status_code, 400)
        empty = self.client.patch(
            f'/api/admin/issues/{issue.id}/',
            data=json.dumps({}),
            content_type='application/json',
        )
        self.assertEqual(empty.status_code, 400)
        issue.refresh_from_db()
        self.assertEqual(issue.status, 'pending')
