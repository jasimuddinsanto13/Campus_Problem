"""Route tests for the React dashboard portals served by Django.

These verify that the post-login dashboard URLs (/admin/dashboard,
/faculty/dashboard, /student/dashboard and their sub-routes) answer with the
built SPA shell instead of a 404 — the fix for the "Page not found at
/admin/dashboard" routing error. The tests skip themselves when the
frontend/campus-dashboard/dist build is absent.
"""

import unittest
from pathlib import Path

from django.conf import settings
from django.test import SimpleTestCase

SPA_INDEX = Path(settings.BASE_DIR).parent / 'frontend' / 'campus-dashboard' / 'dist' / 'index.html'
SPA_ASSETS = SPA_INDEX.parent / 'assets'


@unittest.skipUnless(SPA_INDEX.is_file(), 'frontend/campus-dashboard/dist is not built')
class DashboardRouteTests(SimpleTestCase):
    """Direct visits to the role portals load the SPA shell, not a 404."""

    def assert_serves_spa(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response['Content-Type'], 'text/html')
        self.assertContains(response, '<div id="root">')
        return response

    def test_admin_dashboard(self):
        self.assert_serves_spa('/admin/dashboard')

    def test_admin_dashboard_has_name(self):
        # The URLconf must keep reverse('admin_dashboard') exact so login
        # redirects keep working after the route table grows.
        from django.urls import reverse

        self.assertEqual(reverse('admin_dashboard'), '/admin/dashboard')

    def test_admin_home_serves_spa(self):
        self.assert_serves_spa('/admin/')

    def test_admin_subroutes_serve_spa(self):
        for url in ('/admin/users', '/admin/routines', '/admin/room-booking',
                    '/admin/notices', '/admin/settings'):
            with self.subTest(url=url):
                self.assert_serves_spa(url)

    def test_faculty_dashboard(self):
        self.assert_serves_spa('/faculty/dashboard')

    def test_faculty_home_serves_spa(self):
        self.assert_serves_spa('/faculty/')

    def test_teacher_dashboard_alias(self):
        self.assert_serves_spa('/teacher/dashboard')

    def test_faculty_subroutes_serve_spa(self):
        for url in ('/faculty/routines', '/faculty/room-booking', '/faculty/issue-desk'):
            with self.subTest(url=url):
                self.assert_serves_spa(url)

    def test_student_dashboard(self):
        self.assert_serves_spa('/student/dashboard')

    def test_student_home_serves_spa(self):
        self.assert_serves_spa('/student/')

    def test_student_subroutes_serve_spa(self):
        for url in ('/student/routines', '/student/settings'):
            with self.subTest(url=url):
                self.assert_serves_spa(url)

    def test_assets_are_served(self):
        files = list(SPA_ASSETS.glob('*')) if SPA_ASSETS.is_dir() else []
        if not files:
            self.skipTest('frontend/campus-dashboard/dist/assets is empty')
        asset = files[0]
        response = self.client.get(f'/assets/{asset.name}')
        self.assertEqual(response.status_code, 200)

    def test_missing_asset_404s(self):
        response = self.client.get('/assets/does-not-exist.js')
        self.assertEqual(response.status_code, 404)

    def test_path_traversal_is_blocked(self):
        response = self.client.get('/assets/../index.html')
        self.assertEqual(response.status_code, 404)

    def test_portal_admin_redirects_to_admin_dashboard(self):
        # /portal/admin/ -> /admin/dashboard -> the SPA shell (no broken hops).
        response = self.client.get('/portal/admin/', follow=True)
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '<div id="root">')
