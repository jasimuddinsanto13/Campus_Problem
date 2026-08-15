"""Firebase Cloud Messaging (FCM) helpers — best-effort Web Push notifications.

The Firebase Admin SDK is initialized from ``settings.py`` using
``backend/serviceAccountKey.json`` (or ``FIREBASE_CRED_PATH``). When the
credential file is missing (or Firebase is not installed) every helper
silently no-ops, so the rest of the app keeps working without push.

The web client registers its FCM token via POST /api/profile/fcm-token/
(or the legacy POST /api/push/subscribe/ alias). Dispatch paths:

    * push_class_cancellation() — \"Class Cancelled\" push to matched students
    * push_urgent_notice()      — push for admin-published URGENT notices

Both funnel through send_push_notification(), a multicast helper that sends
to many tokens in a single FCM call and reports per-token results, so the
callers can prune dead tokens afterwards.
"""

import logging
import os
import threading

from django.db import close_old_connections
from django.db.models import Q

logger = logging.getLogger(__name__)

from booking.models import DeviceToken, Notice, User

_app = None
_checked = False


def clean_token(raw):
    """Normalize + validate a raw FCM token; None when missing or oversized.

    DeviceToken.token is a 255-char CharField, so both token-registration
    endpoints (profile + subscribe) apply the same rule.
    """
    token = str(raw or '').strip()
    if not token or len(token) > 255:
        return None
    return token


def register_device_token(user, token, platform='web'):
    """Upsert an FCM device token for a user (one row per device token).

    A token is unique per device, so a user may hold several rows (one per
    browser / phone). If a token was previously registered by another account
    on this device, ownership moves to the current sign-in — shared-device /
    re-login semantics. The user's profile ``fcm_token`` field is kept in
    sync as the \"primary token\" convenience mirror. Shared by the profile
    endpoint (POST /api/profile/fcm-token/) and the legacy subscribe endpoint
    (POST /api/push/subscribe/).
    """
    DeviceToken.objects.update_or_create(
        token=token,
        defaults={'user': user, 'platform': platform or 'web'},
    )
    if user.fcm_token != token:
        user.fcm_token = token
        user.save(update_fields=['fcm_token'])


def _get_app():
    """Return the Firebase app (eager-initialized in settings.py when the
    credential file exists, otherwise lazily initialized here); None when
    Firebase is unconfigured."""
    global _app, _checked
    if _checked:
        return _app
    _checked = True
    try:
        import firebase_admin
    except ImportError:
        return None
    # settings.py already initialized the SDK from serviceAccountKey.json —
    # reuse that app instead of creating a second one.
    if firebase_admin._apps:
        _app = list(firebase_admin._apps.values())[0]
        return _app
    path = os.environ.get('FCM_SERVICE_ACCOUNT_PATH', '').strip()
    if not path or not os.path.isfile(path):
        return None
    try:
        from firebase_admin import credentials

        _app = firebase_admin.initialize_app(credentials.Certificate(path))
    except Exception:
        _app = None
    return _app


def send_push_notification(fcm_tokens, title, body, data_payload=None):
    """Send a Web Push to many devices in one FCM multicast call.

    Filters out empty / whitespace / None tokens and skips entirely when
    Firebase is unconfigured. Returns the
    ``firebase_admin.messaging.BatchResponse`` (or None when skipped). Dead
    or invalid tokens do NOT raise — they surface as per-token exceptions
    inside ``response.responses`` for the caller to prune.
    """
    valid_tokens = [t for t in fcm_tokens if t and t.strip()]
    if not valid_tokens or _get_app() is None:
        return None
    from firebase_admin import messaging

    message = messaging.MulticastMessage(
        notification=messaging.Notification(title=title, body=body),
        data=data_payload or {},
        tokens=valid_tokens,
    )
    return messaging.send_multicast(message)


def _dead_token_errors():
    """Exception classes that mark a token permanently unusable.

    Transient FCM failures (internal / unavailable) must NOT delete a valid
    token — only registration-level failures mean the token is dead for good.
    """
    try:
        from firebase_admin import messaging
    except ImportError:
        return ()
    return tuple(
        klass for klass in (
            getattr(messaging, 'UnregisteredError', None),
            getattr(messaging, 'InvalidArgumentError', None),
            getattr(messaging, 'SenderIdMismatchError', None),
        ) if klass is not None
    )


def _prune_dead_tokens(tokens, response):
    """Delete permanently-dead tokens from the DeviceToken table.

    ``tokens`` must be the exact list passed to send_push_notification and
    ``response`` its BatchResponse — per-token results are index-aligned.
    Only Unregistered / InvalidArgument / SenderIdMismatch results count as
    dead; transient per-token errors leave the token in place.
    """
    if response is None:
        return
    dead_errors = _dead_token_errors()
    if not dead_errors:
        return
    dead = [
        tokens[i]
        for i, r in enumerate(response.responses)
        if r.exception and isinstance(r.exception, dead_errors)
    ]
    if dead:
        DeviceToken.objects.filter(token__in=dead).delete()
        logger.info('Pruned %d unregistered FCM token(s).', len(dead))


def push_class_cancellation(cancellation, student_ids):
    """Send \"🚨 Class Cancelled\" pushes to the matched students' devices.

    Best-effort and non-blocking: the FCM calls run on a daemon thread and
    any failure is swallowed. Returns the number of tokens targeted (0 when
    push is not configured or no student has registered a token).
    """
    if _get_app() is None:
        return 0

    tokens = list(
        DeviceToken.objects.filter(user_id__in=student_ids)
        .values_list('token', flat=True)
        .distinct()
    )
    if not tokens:
        return 0

    title = f'🚨 Class Cancelled: {cancellation.course_code}'
    body = (
        f'Your {cancellation.start_time.strftime("%I:%M %p").lstrip("0")} – '
        f'{cancellation.end_time.strftime("%I:%M %p").lstrip("0")} class today '
        f'has been cancelled by '
        f'{cancellation.faculty.get_display_name()}.'
    )

    def _send():
        close_old_connections()
        try:
            response = send_push_notification(
                tokens, title, body, data_payload={'url': '/student/cancellations'},
            )
            _prune_dead_tokens(tokens, response)
        except Exception:
            # A dead token (uninstalled app) must not break the rest.
            pass
        finally:
            close_old_connections()

    threading.Thread(target=_send, daemon=True).start()
    return len(tokens)


def push_urgent_notice(notice):
    """Send an urgent notice to the device tokens of its matching audience.

    Applies the same audience rule as the notice feeds: target_role (all /
    faculty / students) plus optional department / batch / section narrowing,
    restricted to approved, active accounts. Best-effort and non-blocking —
    returns the number of tokens targeted (0 when nothing matches or push is
    unconfigured).
    """
    if _get_app() is None:
        return 0

    if notice.target_role == Notice.TargetRole.FACULTY:
        role_match = Q(role=User.Role.TEACHER)
    elif notice.target_role == Notice.TargetRole.STUDENT:
        role_match = Q(role=User.Role.STUDENT)
    else:  # ALL — students and faculty (admins author, they don't receive feeds)
        role_match = Q(role__in=[User.Role.STUDENT, User.Role.TEACHER])

    # Empty scope fields mean \"applies to everyone\" (same rule as notice_views).
    department_match = Q(department=notice.department) if notice.department else Q()
    batch_match = Q(batch=notice.batch) if notice.batch else Q()
    section_match = Q(section=notice.section) if notice.section else Q()

    users = User.objects.filter(
        role_match & department_match & batch_match & section_match,
        registration_status=User.RegistrationStatus.APPROVED,
        is_active=True,
    )
    tokens = list(
        DeviceToken.objects.filter(user_id__in=users)
        .values_list('token', flat=True)
        .distinct()
    )
    if not tokens:
        return 0

    title = f'🚨 {notice.title}'
    body = notice.content[:200]

    def _send():
        close_old_connections()
        try:
            response = send_push_notification(
                tokens, title, body, data_payload={'url': '/notices'},
            )
            _prune_dead_tokens(tokens, response)
        except Exception:
            pass
        finally:
            close_old_connections()

    threading.Thread(target=_send, daemon=True).start()
    return len(tokens)
