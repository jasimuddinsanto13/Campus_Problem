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

import json
from pathlib import Path
from urllib import error as urllib_error, request as urllib_request

from django.conf import settings
from django.http import FileResponse, Http404, JsonResponse
from django.views.decorators.csrf import csrf_exempt

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


@csrf_exempt
def chat_proxy(request, subpath=''):
    """POST /api/chat[/...] -> the FastAPI Gemini assistant, same-origin.

    The React dashboard calls /api/chat, /api/chat/transcribe and
    /api/chat/speak on this origin; Django forwards the body to the FastAPI
    service so the browser never talks to FastAPI or Gemini directly — no
    CORS preflight, no client-side API key. Error responses from FastAPI are
    forwarded as {detail} so the widget can show the real reason (missing
    key, Gemini failure, …).
    """
    if request.method != 'POST':
        return JsonResponse({'detail': 'Method not allowed — use POST.'}, status=405)
    try:
        body = json.loads(request.body or b'{}')
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'detail': 'Request body must be valid JSON.'}, status=400)
    if not isinstance(body, dict):
        return JsonResponse({'detail': 'Request body must be a JSON object.'}, status=400)

    upstream = f"{settings.API_BASE_URL.rstrip('/')}/api/chat"
    if subpath:
        upstream += '/' + subpath
    req = urllib_request.Request(
        upstream,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        with urllib_request.urlopen(req, timeout=180) as resp:
            return JsonResponse(json.loads(resp.read().decode('utf-8')))
    except urllib_error.HTTPError as e:
        # Forward FastAPI's structured error (missing key, Gemini failure, …).
        try:
            detail = json.loads(e.read().decode('utf-8')).get('detail')
        except Exception:
            detail = None
        return JsonResponse({'detail': detail or f'Chat service error (HTTP {e.code}).'}, status=e.code)
    except Exception as exc:  # FastAPI down / connection refused / timeout
        return JsonResponse(
            {'detail': f'Chat service unreachable — is FastAPI running on port 8001? ({exc})'},
            status=502,
        )
