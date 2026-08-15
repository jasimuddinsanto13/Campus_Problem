"""
Catch-all views that serve the React dashboard build straight from Django.

The modern frontend is a React SPA (frontend/campus-dashboard, a Vite
project). In development it is normally served by the Vite dev server on
port 8000, but the built app in frontend/campus-dashboard/dist is also
served here directly so that the role portals (/admin/dashboard,
/faculty/dashboard, /student/dashboard and their sub-routes) never 404
when Django is hit directly — for example after a plain ``manage.py
runserver`` without Vite running.

These views only hand out static files. Client-side routing and the role
gates live in the SPA itself (signed-out visitors are redirected to the
login page by the frontend).
"""

from pathlib import Path

from django.conf import settings
from django.http import FileResponse, Http404

# frontend/campus-dashboard/dist sits next to the backend/ folder (settings.BASE_DIR).
SPA_DIST = Path(settings.BASE_DIR).parent / 'frontend' / 'campus-dashboard' / 'dist'
SPA_INDEX = SPA_DIST / 'index.html'


def react_spa(request, subpath=''):
    """Serve the built SPA entry point for any dashboard client-side route."""
    if not SPA_INDEX.is_file():
        raise Http404(
            'The dashboard build is missing — run `npm run build` inside frontend/campus-dashboard/.'
        )
    # FileResponse closes the file once the response has been sent.
    return FileResponse(SPA_INDEX.open('rb'), content_type='text/html')


def spa_asset(request, asset_path):
    """Serve one built asset (JS/CSS/fonts) from the dashboard dist folder."""
    assets_root = (SPA_DIST / 'assets').resolve()
    asset = (assets_root / asset_path).resolve()
    # resolve() normalizes any '..' segments, so only real files under the
    # assets directory can ever be served.
    if not asset.is_relative_to(assets_root) or not asset.is_file():
        raise Http404()
    return FileResponse(asset.open('rb'))


# Portal aliases named after each role's dashboard, used by the URLconf.
admin_portal = react_spa
faculty_portal = react_spa
student_portal = react_spa
