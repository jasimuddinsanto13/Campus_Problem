"""REST endpoints for Firestore-backed real-time notifications.

These complement the existing FCM push system with real-time in-app
notifications that the frontend can poll or subscribe to.

Endpoints:

    GET  /api/notifications/                — user's notifications
    GET  /api/notifications/unread-count/    — unread badge count
    POST /api/notifications/<id>/read/       — mark as read
    POST /api/notifications/read-all/        — mark all as read
"""

import json

from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from campus_project.firestore_notifications import (
    get_unread_count,
    get_user_notifications,
    mark_as_read,
)
from campus_project.firestore_client import get_firestore


def _payload(request):
    if (request.content_type or '').startswith('application/json'):
        try:
            return json.loads(request.body or b'{}')
        except ValueError:
            return {}
    return request.POST.dict()


@require_http_methods(['GET'])
@login_required
def notification_list(request):
    """GET /api/notifications/ — return the user's recent notifications."""
    limit = min(int(request.GET.get('limit', 50)), 100)
    user_uid = str(request.user.uid)
    notifications = get_user_notifications(user_uid, limit=limit)

    # Convert Timestamp objects to ISO strings for JSON serialization.
    for n in notifications:
        if 'created_at' in n and hasattr(n['created_at'], 'isoformat'):
            n['created_at'] = n['created_at'].isoformat()

    return JsonResponse({
        'notifications': notifications,
        'unread_count': get_unread_count(user_uid),
    })


@require_http_methods(['GET'])
@login_required
def notification_unread_count(request):
    """GET /api/notifications/unread-count/ — return just the badge count."""
    return JsonResponse({
        'unread_count': get_unread_count(str(request.user.uid)),
    })


@require_http_methods(['POST'])
@login_required
def notification_mark_read(request, notification_id):
    """POST /api/notifications/<id>/read/ — mark one notification as read."""
    mark_as_read(notification_id, str(request.user.uid))
    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
@login_required
def notification_mark_all_read(request):
    """POST /api/notifications/read-all/ — mark all as read."""
    from google.cloud.firestore_v1 import ArrayUnion
    db = get_firestore()
    if db is None:
        return JsonResponse({'ok': True})

    user_uid = str(request.user.uid)
    try:
        # Update all notifications where the user is in read_by.
        query = (
            db.collection('notifications')
            .where('target_users', 'array_contains', user_uid)
        )
        batch = db.batch()
        count = 0
        for snap in query.stream():
            data = snap.to_dict()
            if user_uid not in data.get('read_by', []):
                batch.update(snap.reference, {
                    'read_by': ArrayUnion([user_uid]),
                })
                count += 1
                if count % 500 == 0:
                    batch.commit()
                    batch = db.batch()
        if count % 500 != 0:
            batch.commit()

        # Reset unread badge.
        db.collection('user_notifications').document(user_uid).set({
            'unread_count': 0,
        }, merge=True)

        return JsonResponse({'ok': True, 'marked': count})
    except Exception:
        return JsonResponse({'ok': True, 'marked': 0})
