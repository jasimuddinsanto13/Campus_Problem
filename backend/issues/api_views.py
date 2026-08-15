"""REST endpoints for the Campus Issue Desk (Faculty + Admin portals).

Backs the React dashboard pages at /faculty/issue-desk and /admin/issue-desk:

    POST   /api/issues/create/                     submit a new issue (multipart)
    GET    /api/issues/my-issues/                  the signed-in user's own issues
    DELETE /api/issues/<id>/                       owner: delete their sent issue
    GET    /api/admin/issues/                      admin: all submitted issues
                                                   (?status= & ?category= filters)
    PATCH  /api/admin/issues/<id>/                 admin: update status / response

Any authenticated user may submit and manage their own issues; the admin
endpoints are restricted to the Admin role.
"""

import json
import os

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from PIL import Image

from booking.models import User

from .models import CampusIssue

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10MB — enough for a photo or document

# Attachment types accepted on the form: JPG/PNG photos or PDF/DOC/DOCX docs.
ALLOWED_ATTACHMENT_TYPES = {
    'image/jpeg': ('.jpg', '.jpeg'),
    'image/png': ('.png',),
    'application/pdf': ('.pdf',),
    'application/msword': ('.doc',),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ('.docx',),
}
_ALL_EXTENSIONS = {ext for exts in ALLOWED_ATTACHMENT_TYPES.values() for ext in exts}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_form(request):
    """Read multipart form data (mirrors booking.notice_views._parse_form)."""
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        if request.method == 'POST':
            return request.POST, request.FILES
        return request.parse_file_upload(request.META, request)
    from django.http import QueryDict

    return QueryDict(request.body, encoding=request.encoding or 'utf-8'), {}


def _parse_json_body(request):
    """JSON body as a dict, or {} when the body is not JSON."""
    try:
        return json.loads(request.body or b'{}')
    except ValueError:
        return {}


def _issue_payload(issue, request):
    """Serialized issue row for the React pages."""
    return {
        'id': issue.id,
        'ticket_id': f'CMP-{issue.id:05d}',
        'category': issue.category,
        'category_label': issue.get_category_display(),
        'title': issue.title,
        'location': issue.location,
        'description': issue.description,
        'attachment_url': (
            request.build_absolute_uri(issue.attachment.url)
            if issue.attachment
            else None
        ),
        'attachment_name': (
            os.path.basename(issue.attachment.name) if issue.attachment else None
        ),
        'status': issue.status,
        'status_label': issue.get_status_display(),
        'admin_response': issue.admin_response,
        'reporter': issue.user.get_display_name(),
        'created_at': issue.created_at.isoformat(),
    }


def _validate_attachment(file_obj):
    """True when the file is a JPG/PNG photo or PDF/DOC/DOCX under the cap."""
    if file_obj.size > MAX_ATTACHMENT_BYTES:
        return 'Attachment must be 10MB or smaller.'
    content_type = (file_obj.content_type or '').lower()
    extension = os.path.splitext(file_obj.name or '')[1].lower()

    if content_type not in ALLOWED_ATTACHMENT_TYPES and extension not in _ALL_EXTENSIONS:
        return 'Attach a JPG/PNG photo or a PDF/DOC/DOCX document.'
    # Only JPG/PNG images are accepted — a GIF renamed with a .png extension
    # (but still declaring image/gif) must not slip through the byte check.
    if content_type in ('image/jpeg', 'image/png'):
        # Verify the bytes are a real image, not just a forged content-type
        # (same check the profile-picture and notice endpoints apply).
        try:
            file_obj.seek(0)
            Image.open(file_obj).verify()
            file_obj.seek(0)
        except Exception:
            return 'Upload a valid image file.'
    return None


# ---------------------------------------------------------------------------
# Faculty / user: create + own outbox
# ---------------------------------------------------------------------------

@require_http_methods(['POST'])
@login_required
def create_issue(request):
    """POST /api/issues/create/ — submit a new campus issue (multipart)."""
    post, files = _parse_form(request)

    category = str(post.get('category', '')).strip()
    title = str(post.get('title', '')).strip()
    building = str(post.get('building', '')).strip()
    room = str(post.get('room', '')).strip()
    description = str(post.get('description', '')).strip()

    if category not in CampusIssue.Category.values:
        return JsonResponse({'error': 'Pick a valid issue category.'}, status=400)
    if not title:
        return JsonResponse({'error': 'Issue title is required.'}, status=400)
    if len(title) > 200:
        return JsonResponse({'error': 'Issue title is too long.'}, status=400)
    if not building:
        return JsonResponse({'error': 'Pick a location / building.'}, status=400)
    if len(building) > 100:
        return JsonResponse({'error': 'Building name is too long.'}, status=400)
    if len(room) > 100:
        return JsonResponse({'error': 'Room / area is too long.'}, status=400)
    if not description:
        return JsonResponse({'error': 'Describe the issue in detail.'}, status=400)

    attachment = files.get('attachment')
    if attachment:
        error = _validate_attachment(attachment)
        if error:
            return JsonResponse({'error': error}, status=400)

    location = f'{building} · {room}' if room else building
    issue = CampusIssue.objects.create(
        user=request.user,
        category=category,
        title=title[:200],
        location=location[:200],
        description=description,
        attachment=attachment or None,
    )
    return JsonResponse(
        {'ok': True, 'issue': _issue_payload(issue, request),
         'message': 'Issue submitted — awaiting admin review.'},
        status=201,
    )


@require_http_methods(['GET'])
@login_required
def my_issues(request):
    """GET /api/issues/my-issues/ — the signed-in user's sent issues."""
    issues = CampusIssue.objects.filter(user=request.user).order_by('-created_at')
    return JsonResponse({'issues': [_issue_payload(i, request) for i in issues]})


@require_http_methods(['DELETE'])
@login_required
def delete_issue(request, issue_id):
    """DELETE /api/issues/<id>/ — the owner deletes their sent issue."""
    issue = get_object_or_404(CampusIssue, pk=issue_id)
    if issue.user_id != request.user.id:
        return JsonResponse(
            {'error': 'You can only delete your own submitted issues.'}, status=403
        )
    detail = f'#{issue.pk} {issue.title}'
    if issue.attachment:
        issue.attachment.delete(save=False)  # remove the file from storage
    issue.delete()
    return JsonResponse({
        'ok': True,
        'deleted': issue_id,
        'message': f'Deleted: {detail}',
    })


# ---------------------------------------------------------------------------
# Admin: manage every submitted issue
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def admin_issues(request):
    """GET /api/admin/issues/ — every submitted issue, with filters.

    Optional query params: ?status=pending|in_progress|resolved and
    ?category=<one of CampusIssue.Category.values>.
    """
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    issues = CampusIssue.objects.select_related('user').order_by('-created_at')

    status = request.GET.get('status', '').strip().lower()
    if status:
        if status not in CampusIssue.Status.values:
            return JsonResponse({'error': 'Pick a valid status filter.'}, status=400)
        issues = issues.filter(status=status)

    category = request.GET.get('category', '').strip().lower()
    if category:
        if category not in CampusIssue.Category.values:
            return JsonResponse({'error': 'Pick a valid category filter.'}, status=400)
        issues = issues.filter(category=category)

    return JsonResponse({'issues': [_issue_payload(i, request) for i in issues]})


@require_http_methods(['PATCH'])
@login_required
def admin_issue_action(request, issue_id):
    """PATCH /api/admin/issues/<id>/ — update status / admin response.

    JSON body with either or both of: {"status": "in_progress|resolved|pending",
    "admin_response": "..."}. Partial updates keep the other field's value.
    """
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    issue = get_object_or_404(CampusIssue, pk=issue_id)
    body = _parse_json_body(request)

    if 'status' in body:
        status = str(body.get('status', '')).strip()
        if status not in CampusIssue.Status.values:
            return JsonResponse({'error': 'Pick a valid status.'}, status=400)
        issue.status = status

    if 'admin_response' in body:
        issue.admin_response = str(body.get('admin_response', '')).strip()

    if 'status' not in body and 'admin_response' not in body:
        return JsonResponse({'error': 'Send a status and/or an admin response.'}, status=400)

    issue.save()
    return JsonResponse({'ok': True, 'issue': _issue_payload(issue, request)})
