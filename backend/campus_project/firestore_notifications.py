"""Firestore-backed real-time notification store.

Each notification is a document in the ``notifications`` collection:

    notifications/{auto-id}
      title: str
      body: str
      url: str (deep-link path)
      target_users: list[str]  (user UIDs or "*broadcast*")
      target_roles: list[str]  (["student"], ["teacher"], or ["student","teacher"])
      department: str | null
      batch: str | null
      section: str | null
      priority: "normal" | "urgent"
      read_by: list[str]   (UIDs that have acknowledged this notification)
      created_at: Timestamp

The ``user_notifications/{uid}`` collection holds one document per user
containing their unread count for fast badge rendering:

    user_notifications/{uid}
      unread_count: int
      updated_at: Timestamp
"""

import logging
from datetime import datetime, timezone

from django.db.models import Q

logger = logging.getLogger(__name__)


def _get_client():
    from campus_project.firestore_client import get_firestore
    return get_firestore()


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------

def create_notification(
    *,
    title,
    body,
    url='',
    target_user_ids=None,
    target_roles=None,
    department=None,
    batch=None,
    section=None,
    priority='normal',
    created_by_uid=None,
):
    """Write a notification document and increment unread badges.

    ``target_user_ids`` takes precedence: when supplied only those UIDs
    receive the notification.  Otherwise ``target_roles`` +
    ``department/batch/section`` determines the audience via the User
    model — the same logic used by ``notice_views``.
    """
    db = _get_client()
    if db is None:
        return None

    now = datetime.now(tz=timezone.utc)
    doc = {
        'title': title,
        'body': body,
        'url': url,
        'target_roles': target_roles or [],
        'department': department,
        'batch': batch,
        'section': section,
        'priority': priority,
        'read_by': [],
        'created_by_uid': created_by_uid,
        'created_at': now,
    }

    # Resolve audience to concrete UIDs.
    if target_user_ids:
        uid_list = [str(u) for u in target_user_ids]
    else:
        uid_list = _resolve_audience(target_roles, department, batch, section)

    if uid_list:
        doc['target_users'] = uid_list
    else:
        doc['target_users'] = []

    # Write the notification document.
    try:
        notif_ref = db.collection('notifications').document()
        notif_ref.set(doc)
        notif_id = notif_ref.id
    except Exception:
        logger.exception('Failed to write Firestore notification.')
        return None

    # Increment unread count for each recipient.
    _bump_unread_counts(uid_list)

    return notif_id


def mark_as_read(notification_id, user_uid):
    """Add ``user_uid`` to ``read_by`` and decrement the unread badge."""
    db = _get_client()
    if db is None:
        return

    try:
        notif_ref = db.collection('notifications').document(notification_id)
        snap = notif_ref.get()
        if not snap.exists:
            return
        data = snap.to_dict()
        already_read = data.get('read_by', [])
        if user_uid in already_read:
            return
        from google.cloud.firestore_v1 import ArrayUnion
        notif_ref.update({
            'read_by': ArrayUnion([user_uid]),
        })
        _decrement_unread(user_uid)
    except Exception:
        logger.debug('Firestore mark_as_read failed.', exc_info=True)


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

def get_user_notifications(user_uid, limit=50):
    """Return the most recent notifications for *user_uid*."""
    db = _get_client()
    if db is None:
        return []

    try:
        # We query with ``target_users`` array-contains the UID.
        # Firestore ``array_contains`` only matches if the UID is in the
        # array, which covers both per-user and broadcast ("*") targeting.
        query = (
            db.collection('notifications')
            .where('target_users', 'array_contains', user_uid)
            .order_by('created_at', direction='DESCENDING')
            .limit(limit)
        )
        results = []
        for snap in query.stream():
            data = snap.to_dict()
            data['id'] = snap.id
            data['is_read'] = user_uid in data.get('read_by', [])
            results.append(data)
        return results
    except Exception:
        logger.debug('Firestore get_user_notifications failed.', exc_info=True)
        return []


def get_unread_count(user_uid):
    """Return the user's unread notification count."""
    db = _get_client()
    if db is None:
        return 0
    try:
        doc = db.collection('user_notifications').document(user_uid).get()
        if doc.exists:
            return doc.to_dict().get('unread_count', 0)
        return 0
    except Exception:
        return 0


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------

def _resolve_audience(target_roles, department, batch, section):
    """Mirror the Django ORM audience logic from ``notice_views``."""
    from booking.models import User

    role_map = {
        'student': User.Role.STUDENT,
        'teacher': User.Role.TEACHER,
        'faculty': User.Role.TEACHER,
    }
    if target_roles:
        roles = [role_map[r.lower()] for r in target_roles if r.lower() in role_map]
    else:
        roles = [User.Role.STUDENT, User.Role.TEACHER]

    qs = User.objects.filter(
        role__in=roles,
        registration_status=User.RegistrationStatus.APPROVED,
        is_active=True,
    )
    if department:
        qs = qs.filter(department=department)
    if batch:
        qs = qs.filter(batch=batch)
    if section:
        qs = qs.filter(section=section)

    return list(qs.values_list('uid', flat=True))


def _bump_unread_counts(uid_list):
    """Increment unread count for each UID."""
    db = _get_client()
    if db is None or not uid_list:
        return
    try:
        from google.cloud.firestore_v1 import Increment as _Inc

        batch = db.batch()
        for uid in uid_list:
            ref = db.collection('user_notifications').document(str(uid))
            batch.set(
                ref,
                {
                    'unread_count': _Inc(1),
                    'updated_at': datetime.now(tz=timezone.utc),
                },
                merge=True,
            )
        batch.commit()
    except Exception:
        logger.debug('Firestore _bump_unread_counts failed.', exc_info=True)


def _decrement_unread(user_uid):
    db = _get_client()
    if db is None:
        return
    try:
        from google.cloud.firestore_v1 import Increment as _Inc

        ref = db.collection('user_notifications').document(str(user_uid))
        ref.set(
            {
                'unread_count': _Inc(-1),
                'updated_at': datetime.now(tz=timezone.utc),
            },
            merge=True,
        )
    except Exception:
        pass
