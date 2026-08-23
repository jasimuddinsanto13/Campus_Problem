"""REST endpoints for the role-based Notice Board.

Backs the React dashboard pages:

    GET    /api/notices/            admin: all notices (management table);
                                   optional filters: ?target=student|faculty,
                                   ?category=general|department, ?dept=CSE
    POST   /api/notices/            admin: create (multipart: title, content,
                                   priority, target_role, department, pinned,
                                   attachment)
    GET    /api/notices/faculty/    teacher: notices for all users / faculty /
                                   the teacher's own department
    GET    /api/notices/student/    student: notices for all users / students /
                                   the student's own department
    PATCH  /api/notices/<id>/       admin: edit fields or toggle pinned
                                   (multipart, or JSON like {"pinned": true})
    DELETE /api/notices/<id>/       admin: delete (attachment file removed too)

Visibility rule: a notice reaches a user when its target_role matches
('all', or their role) AND each of its optional department / batch /
section scope fields is empty or equals the user's registered value.
"""

import json
import os

from django.contrib.auth.decorators import login_required
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods
from PIL import Image

from booking.fcm import push_urgent_notice
from booking.models import Notice, User
from campus_project.firestore_notifications import create_notification

# Departments an admin may target (matches the routine manager / wizard).
DEPARTMENTS = ['CSE', 'EEE', 'TE', 'IPE', 'FDAE']
# Batches 0..16 and the sections each department offers — used to validate
# the optional batch/section narrowing on a notice.
BATCHES = [str(n) for n in range(17)]
SECTIONS_BY_DEPT = {
    'CSE': ['A', 'B'],
    'EEE': ['A'],
    'TE': ['A', 'B', 'C', 'D'],
    'IPE': ['A', 'B'],
    'FDAE': ['A'],
}

PRIORITY_LABELS = {
    Notice.Priority.NORMAL: 'Normal',
    Notice.Priority.IMPORTANT: 'Important',
    Notice.Priority.URGENT: 'Urgent',
}
TARGET_LABELS = {
    Notice.TargetRole.ALL: 'All Users',
    Notice.TargetRole.FACULTY: 'Faculty Only',
    Notice.TargetRole.STUDENT: 'Students Only',
}

MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024  # 10MB — enough for a PDF or photo


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_form(request):
    """Read multipart form data (mirrors accounts.views._parse_form).

    POST bodies are already parsed by Django by the time the view runs (the
    CSRF middleware reads ``request.POST``), so re-parsing them throws
    'cannot set the upload handlers after the upload has been processed'.
    PUT/PATCH bodies are never touched, so they need explicit parsing.
    """
    if request.content_type and request.content_type.startswith('multipart/form-data'):
        if request.method == 'POST':
            return request.POST, request.FILES
        return request.parse_file_upload(request.META, request)
    from django.http import QueryDict

    return QueryDict(request.body, encoding=request.encoding or 'utf-8'), {}


def _payload(request):
    """Form fields + files from a multipart request, as a plain dict."""
    post, files = _parse_form(request)
    fields = {key: post.get(key, '') for key in (
        'title', 'content', 'priority', 'target_role', 'department',
        'batch', 'section',
    )}
    # pinned is None when the field was omitted entirely (an edit must keep
    # the current value); the create path treats None as not-pinned.
    raw_pinned = post.get('pinned')
    pinned = None if raw_pinned is None else raw_pinned in ('1', 'true', 'on')
    remove_attachment = post.get('remove_attachment', '') in ('1', 'true', 'on')
    return fields, files, pinned, remove_attachment


def _parse_json_body(request):
    """JSON body as a dict, or {} when the body is not JSON."""
    try:
        return json.loads(request.body or b'{}')
    except ValueError:
        return {}


def _author_name(user):
    if user is None:
        return 'Admin'
    return user.get_display_name()


def _notice_payload(notice, request):
    """Serialized notice row for the React pages."""
    return {
        'id': notice.id,
        'title': notice.title,
        'content': notice.content,
        'priority': notice.priority,
        'priority_label': PRIORITY_LABELS.get(notice.priority, notice.priority),
        'target_role': notice.target_role,
        'target_label': TARGET_LABELS.get(notice.target_role, notice.target_role),
        'department': notice.department,
        'batch': notice.batch,
        'section': notice.section,
        'pinned': notice.pinned,
        'attachment_url': (
            request.build_absolute_uri(notice.attachment.url)
            if notice.attachment
            else None
        ),
        'attachment_name': (
            os.path.basename(notice.attachment.name) if notice.attachment else None
        ),
        'author': _author_name(notice.created_by),
        'created_at': notice.created_at.isoformat(),
    }


def _validate(fields):
    """Validate a create/edit field dict; returns (error, cleaned)."""
    title = str(fields.get('title', '')).strip()
    content = str(fields.get('content', '')).strip()
    priority = str(fields.get('priority', '')).strip()
    target_role = str(fields.get('target_role', '')).strip()
    department = str(fields.get('department', '')).strip().upper()
    batch = str(fields.get('batch', '')).strip()
    section = str(fields.get('section', '')).strip().upper()

    if not title:
        return 'Title is required.', None
    if not content:
        return 'Notice content is required.', None
    if priority not in Notice.Priority.values:
        return 'Pick a valid priority.', None
    if target_role not in Notice.TargetRole.values:
        return 'Pick a valid target audience.', None
    # Faculty-only notices are always general (the wizard skips the scope
    # step for them) — batch/section narrowing would match no one, since
    # faculty accounts carry no batch or section.
    if target_role == Notice.TargetRole.FACULTY and (batch or section):
        return 'Faculty-only notices cannot be narrowed by batch or section.', None
    if department and department not in DEPARTMENTS:
        return 'Pick a valid department.', None
    if batch:
        if not department:
            return 'Pick a department when narrowing by batch.', None
        if batch not in BATCHES:
            return 'Pick a valid batch (0-16).', None
    if section:
        if not department:
            return 'Pick a department when narrowing by section.', None
        if section not in SECTIONS_BY_DEPT.get(department, []):
            return f'Pick a valid section for {department}.', None

    cleaned = {
        'title': title[:200],
        'content': content,
        'priority': priority,
        'target_role': target_role,
        'department': department,
        'batch': batch,
        'section': section,
    }
    return None, cleaned


def _valid_attachment(file_obj):
    """True when the uploaded file is a PDF or a real image under the size cap."""
    if file_obj.size > MAX_ATTACHMENT_BYTES:
        return 'Attachment must be 10MB or smaller.'
    content_type = (file_obj.content_type or '').lower()
    if not (content_type == 'application/pdf' or content_type.startswith('image/')):
        return 'Attach a PDF or an image file.'
    if content_type.startswith('image/'):
        # Verify the bytes are a real image, not just a forged content-type
        # (same check the profile-picture endpoint applies).
        try:
            file_obj.seek(0)
            Image.open(file_obj).verify()
            file_obj.seek(0)
        except Exception:
            return 'Upload a valid image file.'
    return None


# ---------------------------------------------------------------------------
# Admin list + create
# ---------------------------------------------------------------------------

@require_http_methods(['GET', 'POST'])
@login_required
def notices_api(request):
    """GET (admin list) / POST (admin create) /api/notices/."""
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    if request.method == 'GET':
        notices = Notice.objects.select_related('created_by')
        # Admin filter view (?target=&category=&dept=) — mirrors the tabs on
        # the Notices page. "student" shows everything students receive
        # (all-users + students-only), "faculty" the faculty audience.
        target = request.GET.get('target', '').strip().lower()
        category = request.GET.get('category', '').strip().lower()
        dept = request.GET.get('dept', '').strip().upper()
        if target == 'student':
            notices = notices.filter(target_role__in=[
                Notice.TargetRole.ALL, Notice.TargetRole.STUDENT,
            ])
        elif target == 'faculty':
            notices = notices.filter(target_role__in=[
                Notice.TargetRole.ALL, Notice.TargetRole.FACULTY,
            ])
        elif target:
            return JsonResponse({'error': 'target must be student or faculty.'}, status=400)
        if category == 'general':
            notices = notices.filter(department='', batch='', section='')
        elif category == 'department':
            if dept not in DEPARTMENTS:
                return JsonResponse({'error': 'Pick a valid department.'}, status=400)
            notices = notices.filter(department=dept)
        elif category:
            return JsonResponse({'error': 'category must be general or department.'}, status=400)
        return JsonResponse({
            'notices': [_notice_payload(n, request) for n in notices],
        })

    # ---- POST — create from multipart form data ----
    fields, files, pinned, _remove_attachment = _payload(request)
    error, cleaned = _validate(fields)
    if error:
        return JsonResponse({'error': error}, status=400)
    attachment = files.get('attachment')
    if attachment:
        error = _valid_attachment(attachment)
        if error:
            return JsonResponse({'error': error}, status=400)

    notice = Notice.objects.create(
        created_by=request.user,
        pinned=bool(pinned),
        attachment=attachment or None,
        **cleaned,
    )
    # URGENT notices also fire OS-level pushes to their matching audience
    # (best-effort; returns how many device tokens were targeted).
    push_targeted = (
        push_urgent_notice(notice)
        if notice.priority == Notice.Priority.URGENT
        else 0
    )

    # Write to Firestore for real-time in-app notification feed.
    target_roles = []
    if notice.target_role == Notice.TargetRole.STUDENT:
        target_roles = ['student']
    elif notice.target_role == Notice.TargetRole.FACULTY:
        target_roles = ['teacher']
    else:
        target_roles = ['student', 'teacher']
    create_notification(
        title=notice.title,
        body=notice.content[:500],
        url='/notices',
        target_roles=target_roles,
        department=notice.department or None,
        batch=notice.batch or None,
        section=notice.section or None,
        priority=notice.priority,
        created_by_uid=str(request.user.uid),
    )

    return JsonResponse(
        {'ok': True, 'notice': _notice_payload(notice, request),
         'message': 'Notice published.', 'push_targeted': push_targeted},
        status=201,
    )


# ---------------------------------------------------------------------------
# Role-based feeds (faculty / student widgets)
# ---------------------------------------------------------------------------

@require_http_methods(['GET'])
@login_required
def notice_feed_api(request):
    """GET /api/notices/faculty/ or /api/notices/student/ — relevant notices.

    Filters by the signed-in role and department. Pinned notices float to the
    top; within the same pin state the newest comes first.
    """
    user = request.user
    if user.role == User.Role.TEACHER:
        role_match = Q(target_role__in=[Notice.TargetRole.ALL, Notice.TargetRole.FACULTY])
    elif user.role == User.Role.STUDENT:
        role_match = Q(target_role__in=[Notice.TargetRole.ALL, Notice.TargetRole.STUDENT])
    else:
        return JsonResponse({'error': 'Faculty and students only.'}, status=403)

    # Precise audience matching: a notice reaches the user when its optional
    # department / batch / section scope is empty (applies to everyone) or
    # matches the user's own registration exactly.
    department = (user.department or '').strip().upper()
    department_match = Q(department='')
    if department:
        department_match |= Q(department=department)

    batch = (user.batch or '').strip()
    batch_match = Q(batch='')
    if batch:
        batch_match |= Q(batch=batch)

    section = (user.section or '').strip().upper()
    section_match = Q(section='')
    if section:
        section_match |= Q(section=section)

    notices = (
        Notice.objects.filter(role_match & department_match & batch_match & section_match)
        .select_related('created_by')
        .order_by('-pinned', '-created_at')
    )
    return JsonResponse({'notices': [_notice_payload(n, request) for n in notices]})


# ---------------------------------------------------------------------------
# Admin edit / pin / delete
# ---------------------------------------------------------------------------

@require_http_methods(['PATCH', 'DELETE'])
@login_required
def notice_detail_api(request, notice_id):
    """PATCH /api/notices/<id>/ and DELETE /api/notices/<id>/ (admin only)."""
    if request.user.role != User.Role.ADMIN:
        return JsonResponse({'error': 'Admins only.'}, status=403)

    notice = get_object_or_404(Notice, pk=notice_id)

    if request.method == 'DELETE':
        if notice.attachment:
            notice.attachment.delete(save=False)  # remove the file from storage
        notice.delete()
        return JsonResponse({'ok': True, 'deleted': notice_id})

    # ---- PATCH — edit (multipart) or a JSON pin toggle ----
    is_json = (request.content_type or '').startswith('application/json')
    if is_json:
        body = _parse_json_body(request)
        if 'pinned' in body and set(body.keys()) == {'pinned'}:
            notice.pinned = bool(body['pinned'])
            notice.save()
            return JsonResponse({'ok': True, 'notice': _notice_payload(notice, request)})
        # Partial JSON edits: missing fields fall back to the current row, so
        # a one-field update like {"title": "..."} works like a real PATCH.
        fields = {
            'title': body.get('title', notice.title),
            'content': body.get('content', notice.content),
            'priority': body.get('priority', notice.priority),
            'target_role': body.get('target_role', notice.target_role),
            'department': body.get('department', notice.department),
            'batch': body.get('batch', notice.batch),
            'section': body.get('section', notice.section),
        }
        pinned = bool(body.get('pinned', notice.pinned))
        files = {}
        remove_attachment = False
    else:
        fields, files, pinned, remove_attachment = _payload(request)

    error, cleaned = _validate(fields)
    if error:
        return JsonResponse({'error': error}, status=400)

    attachment = files.get('attachment')
    if attachment:
        error = _valid_attachment(attachment)
        if error:
            return JsonResponse({'error': error}, status=400)
        if notice.attachment:
            notice.attachment.delete(save=False)
        notice.attachment = attachment
    elif remove_attachment and notice.attachment:
        notice.attachment.delete(save=False)
        notice.attachment = None

    # Capture the pre-edit priority so a transition to URGENT can push.
    was_urgent = notice.priority == Notice.Priority.URGENT
    for key, value in cleaned.items():
        setattr(notice, key, value)
    if pinned is not None:
        notice.pinned = pinned
    notice.save()

    # Editing a notice to URGENT fires the push to its (new) audience too.
    if not was_urgent and notice.priority == Notice.Priority.URGENT:
        push_urgent_notice(notice)
        # Also write Firestore notification for the edited urgent notice.
        target_roles = []
        if notice.target_role == Notice.TargetRole.STUDENT:
            target_roles = ['student']
        elif notice.target_role == Notice.TargetRole.FACULTY:
            target_roles = ['teacher']
        else:
            target_roles = ['student', 'teacher']
        create_notification(
            title=notice.title,
            body=notice.content[:500],
            url='/notices',
            target_roles=target_roles,
            department=notice.department or None,
            batch=notice.batch or None,
            section=notice.section or None,
            priority='urgent',
            created_by_uid=str(request.user.uid),
        )

    return JsonResponse({'ok': True, 'notice': _notice_payload(notice, request)})
