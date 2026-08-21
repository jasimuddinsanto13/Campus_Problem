#!/usr/bin/env python
"""Firebase Cloud Messaging (FCM) test script.

Run from the backend/ directory:
    python test_fcm.py                     # check setup only
    python test_fcm.py send                # send a test push to all registered devices
    python test_fcm.py send <fcm_token>    # send a test push to one specific token
    python test_fcm.py status              # show registered DeviceToken rows
"""

import os
import sys

# ---------------------------------------------------------------------------
# 1. Bootstrap Django so we can use the ORM + Firebase init from settings.py
# ---------------------------------------------------------------------------
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'campus_project.settings')

import django
django.setup()

from firebase_admin import messaging


def check_setup():
    """Verify Firebase credentials and SDK initialization."""
    import firebase_admin
    print("=" * 60)
    print("Firebase Cloud Messaging — Setup Check")
    print("=" * 60)

    # Check serviceAccountKey.json
    cred_path = os.environ.get('FIREBASE_CRED_PATH', '') or os.path.join(
        os.path.dirname(__file__), 'serviceAccountKey.json'
    )
    if os.path.isfile(cred_path):
        print(f"  [OK]  Service account key found: {cred_path}")
    else:
        print(f"  [FAIL] Service account key NOT found at {cred_path}")
        return False

    # Check firebase-admin installed
    try:
        import firebase_admin as fa
        print(f"  [OK]  firebase-admin SDK installed")
    except ImportError:
        print("  [FAIL] firebase-admin not installed — run: pip install firebase-admin")
        return False

    # Check app initialized
    if fa._apps:
        app = list(fa._apps.values())[0]
        print(f"  [OK]  Firebase app initialized (project: {app.project_id})")
    else:
        print("  [FAIL] Firebase app NOT initialized — check settings.py")
        return False

    print("=" * 60)
    return True


def show_status():
    """Show registered device tokens in the database."""
    from booking.models import DeviceToken, User

    print("=" * 60)
    print("Registered Device Tokens")
    print("=" * 60)

    tokens = DeviceToken.objects.select_related('user').order_by('-updated_at')
    if not tokens.exists():
        print("  No device tokens registered yet.")
        print("  (Students need to open the app in a browser with notifications")
        print("   enabled — the service worker registers the FCM token automatically.)")
    else:
        print(f"  {'User':<25} {'Platform':<10} {'Token (first 40 chars)':<42} {'Updated'}")
        print(f"  {'-'*25} {'-'*10} {'-'*42} {'-'*20}")
        for dt in tokens[:20]:
            print(f"  {str(dt.user):<25} {dt.platform:<10} {dt.token[:40]}... {dt.updated_at:%Y-%m-%d %H:%M}")

    count = DeviceToken.objects.count()
    print(f"\n  Total: {count} registered token(s)")
    print("=" * 60)
    return count


def send_test_push(token=None):
    """Send a test push notification."""
    from booking.models import DeviceToken

    if token:
        # Single token mode
        tokens = [token]
        print(f"\nSending test push to 1 token: {token[:40]}...")
    else:
        # All registered tokens
        tokens = list(DeviceToken.objects.values_list('token', flat=True))
        if not tokens:
            print("\n  No device tokens registered. Open the student dashboard in a")
            print("  browser with notifications enabled to register a token first.")
            return
        print(f"\nSending test push to {len(tokens)} registered device(s)...")

    message = messaging.MulticastMessage(
        notification=messaging.Notification(
            title='🧪 FCM Test',
            body='If you see this, Firebase Cloud Messaging is working!',
        ),
        data={'url': '/student/dashboard', 'test': 'true'},
        tokens=tokens,
    )

    try:
        response = messaging.send_multicast(message)
        print(f"\n  Results:")
        print(f"    Success: {response.success_count}")
        print(f"    Failure: {response.failure_count}")

        for i, r in enumerate(response.responses):
            if r.success:
                print(f"    [{i}] OK")
            else:
                err = r.exception
                print(f"    [{i}] FAIL — {type(err).__name__}: {err}")

                # Prune dead tokens
                from firebase_admin.messaging import (
                    UnregisteredError,
                    InvalidArgumentError,
                    SenderIdMismatchError,
                )
                if isinstance(err, (UnregisteredError, InvalidArgumentError, SenderIdMismatchError)):
                    dead_token = tokens[i]
                    DeviceToken.objects.filter(token=dead_token).delete()
                    print(f"         -> Pruned dead token from database")

    except Exception as e:
        print(f"\n  [ERROR] {type(e).__name__}: {e}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == '__main__':
    ok = check_setup()
    if not ok:
        print("\nFix the issues above and try again.")
        sys.exit(1)

    cmd = sys.argv[1] if len(sys.argv) > 1 else 'check'

    if cmd == 'send':
        specific_token = sys.argv[2] if len(sys.argv) > 2 else None
        send_test_push(specific_token)
    elif cmd == 'status':
        show_status()
    else:
        print("\nUsage:")
        print("  python test_fcm.py              # check setup")
        print("  python test_fcm.py status       # show registered tokens")
        print("  python test_fcm.py send         # push to all devices")
        print("  python test_fcm.py send <token> # push to one device")
