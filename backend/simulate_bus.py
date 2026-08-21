#!/usr/bin/env python3
"""
simulate_bus.py — Push fake GPS data to Firebase Realtime Database.

Simulates a campus bus moving along a configurable route. The bus
trajectory is a smooth loop defined by waypoints; the script
interpolates between them and writes the current position to
`bus/location` in Firebase Realtime Database every second.

Usage:
    cd backend
    python simulate_bus.py                          # default route (Dhaka campus)
    python simulate_bus.py --speed 2                # 2x speed
    python simulate_bus.py --interval 0.5           # update every 0.5s
    python simulate_bus.py --lat 24.12 --lng 90.30  # custom center
    python simulate_bus.py --stop-after 60          # run for 60 seconds then stop
    Ctrl+C to stop gracefully.

Requirements:
    pip install firebase-admin  (already in requirements.txt)

The script uses backend/serviceAccountKey.json (or FIREBASE_CRED_PATH env)
and writes to the Realtime Database at:
    https://<project-id>-default-rtdb.firebaseio.com/

Make sure Realtime Database is enabled in your Firebase console and the
service account has write access (test mode rules are fine for dev).
"""

import argparse
import json
import math
import os
import signal
import sys
import time
from pathlib import Path

# ---------------------------------------------------------------------------
# Firebase setup
# ---------------------------------------------------------------------------

def get_firebase_app():
    """Initialize the Firebase Admin SDK with the service account."""
    try:
        import firebase_admin
        from firebase_admin import credentials, db
    except ImportError:
        print("ERROR: firebase-admin not installed. Run: pip install firebase-admin")
        sys.exit(1)

    if firebase_admin._apps:
        app = list(firebase_admin._apps.values())[0]
        return app, db

    cred_path = os.environ.get('FIREBASE_CRED_PATH', '')
    if not cred_path:
        cred_path = str(Path(__file__).resolve().parent / 'serviceAccountKey.json')

    if not os.path.exists(cred_path):
        print(f"ERROR: Service account key not found at {cred_path}")
        print("Set FIREBASE_CRED_PATH or place serviceAccountKey.json in backend/")
        sys.exit(1)

    cred = credentials.Certificate(cred_path)

    # Determine the database URL from the project ID in the credential file.
    project_id = cred_path and json.loads(Path(cred_path).read_text()).get('project_id', '')
    database_url = os.environ.get(
        'FIREBASE_DATABASE_URL',
        f'https://{project_id}-default-rtdb.firebaseio.com',
    )

    app = firebase_admin.initialize_app(cred, {
        'databaseURL': database_url,
    })
    return app, db


# ---------------------------------------------------------------------------
# Route simulation
# ---------------------------------------------------------------------------

# Default campus route — a closed loop of lat/lng waypoints around the
# NITER campus area (adjust these to match your actual campus).
DEFAULT_ROUTE = [
    (23.8103, 90.4125),   # Main gate
    (23.8115, 90.4140),   # North campus
    (23.8125, 90.4130),   # Academic block
    (23.8120, 90.4110),   # Library
    (23.8110, 90.4100),   # Cafeteria
    (23.8100, 90.4105),   # Sports field
    (23.8095, 90.4115),   # Dormitory
    (23.8103, 90.4125),   # Back to main gate (loop)
]


def interpolate(p1, p2, t):
    """Linear interpolation between two (lat, lng) points at fraction t."""
    return (
        p1[0] + (p2[0] - p1[0]) * t,
        p1[1] + (p2[1] - p1[1]) * t,
    )


def smooth_step(t):
    """Smooth ease-in-out interpolation (avoids jerky movement)."""
    return t * t * (3 - 2 * t)


def get_position(route, progress):
    """Given a progress value [0, 1), return the (lat, lng) on the route."""
    n = len(route) - 1  # last point == first point (closed loop)
    total = progress * n
    segment = int(total) % n
    frac = total - int(total)
    frac = smooth_step(frac)
    return interpolate(route[segment], route[segment + 1], frac)


def add_jitter(lat, lng, magnitude=0.00003):
    """Add tiny random jitter to simulate GPS noise (realism)."""
    import random
    return (
        lat + random.uniform(-magnitude, magnitude),
        lng + random.uniform(-magnitude, magnitude),
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    # Force UTF-8 output on Windows to avoid cp1252 encoding errors.
    import io
    if sys.stdout.encoding != 'utf-8':
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

    parser = argparse.ArgumentParser(description='Simulate campus bus GPS data on Firebase Realtime Database')
    parser.add_argument('--speed', type=float, default=1.0, help='Route speed multiplier (default: 1.0)')
    parser.add_argument('--interval', type=float, default=1.0, help='Update interval in seconds (default: 1.0)')
    parser.add_argument('--lat', type=float, default=None, help='Override center latitude')
    parser.add_argument('--lng', type=float, default=None, help='Override center longitude')
    parser.add_argument('--stop-after', type=float, default=None, help='Stop after N seconds (default: run forever)')
    parser.add_argument('--no-jitter', action='store_true', help='Disable GPS jitter')
    parser.add_argument('--dry-run', action='store_true', help='Print positions without writing to Firebase')
    args = parser.parse_args()

    # Build route
    route = list(DEFAULT_ROUTE)
    if args.lat is not None and args.lng is not None:
        # Offset entire route to the given center
        center_lat, center_lng = args.lat, args.lng
        ref_lat, ref_lng = DEFAULT_ROUTE[0]
        offset_lat = center_lat - ref_lat
        offset_lng = center_lng - ref_lng
        route = [(lat + offset_lat, lng + offset_lng) for lat, lng in route]

    # Firebase
    db_ref = None
    if not args.dry_run:
        print("🔥 Initializing Firebase...")
        app, db_module = get_firebase_app()
        db_ref = db_module.reference('bus/location', app=app)
        print("✅ Connected to Firebase Realtime Database")
    else:
        print("🧪 Dry run mode — no Firebase writes")

    # Graceful shutdown
    running = True

    def on_signal(sig, frame):
        nonlocal running
        print("\n⏹  Stopping...")
        running = False

    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    # Simulate
    progress = 0.0
    start_time = time.time()
    update_count = 0

    print(f"🚌 Bus simulation started (speed={args.speed}x, interval={args.interval}s)")
    print(f"   Route: {len(route)} waypoints, ~{args.stop_after or '∞'}s duration")
    print(f"   Press Ctrl+C to stop\n")

    while running:
        elapsed = time.time() - start_time

        if args.stop_after and elapsed >= args.stop_after:
            print(f"\n⏱  Stopped after {args.stop_after}s")
            break

        # Advance progress along route
        progress = (progress + (args.speed * args.interval) / 30.0) % 1.0

        # Get interpolated position
        lat, lng = get_position(route, progress)
        if not args.no_jitter:
            lat, lng = add_jitter(lat, lng)

        # Write to Firebase
        payload = {
            'lat': round(lat, 6),
            'lng': round(lng, 6),
            'timestamp': int(time.time() * 1000),
        }

        if args.dry_run:
            print(f"  [{elapsed:6.1f}s] 🚌 lat={lat:.6f}  lng={lng:.6f}")
        else:
            db_ref.set(payload)
            print(f"  [{elapsed:6.1f}s] 🚌 lat={lat:.6f}  lng={lng:.6f}  ✅")

        update_count += 1
        time.sleep(args.interval)

    # Final status
    print(f"\n📊 Summary: {update_count} updates sent over {time.time() - start_time:.1f}s")
    if db_ref and not args.dry_run:
        print("   Last position written to bus/location in Firebase")

    print("👋 Done.")


if __name__ == '__main__':
    main()
