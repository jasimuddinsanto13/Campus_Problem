/**
 * Firebase Realtime Database helpers for the bus tracker.
 *
 * Configure via campus-dashboard/.env:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_DATABASE_URL   ← new — Realtime Database URL
 *
 * When the config is absent every helper no-ops, so the bus page still
 * renders with the simulated placeholder drift.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getDatabase,
  ref,
  onValue,
  off,
} from 'firebase/database';

/** Shared Firebase web config — reuses the same env vars as FCM. */
function getConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const databaseURL = import.meta.env.VITE_FIREBASE_DATABASE_URL;
  if (!apiKey || !projectId || !databaseURL) return null;
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    databaseURL,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

/** Lazily-initialized Firebase app & database singleton. */
let _app = null;
let _db = null;

function getDb() {
  if (_db) return _db;
  const config = getConfig();
  if (!config) return null;

  // Reuse an existing Firebase app if one was already created (e.g. by FCM).
  _app = getApps().length
    ? getApps()[0]
    : initializeApp(config);

  _db = getDatabase(_app);
  return _db;
}

/**
 * Subscribe to the bus location at `path` (default: "bus/location").
 *
 * Calls `onChange({ lat, lng })` whenever the value changes.
 * Returns an unsubscribe function to call on component unmount.
 *
 * If Firebase is not configured, returns a no-op unsubscribe so callers
 * don't need to guard.
 *
 * @param {function} onChange  — callback receiving { lat, lng }
 * @param {string}   [path]    — database path (default "bus/location")
 * @returns {function} unsubscribe
 */
export function subscribeBusLocation(onChange, path = 'bus/location') {
  const db = getDb();
  if (!db) return () => {}; // no-op unsubscribe

  const busRef = ref(db, path);

  const unsubscribe = onValue(busRef, (snapshot) => {
    const data = snapshot.val();
    if (data && typeof data.lat === 'number' && typeof data.lng === 'number') {
      onChange({ lat: data.lat, lng: data.lng });
    }
  });

  // onValue returns an unsubscribe function in Firebase v9+
  return typeof unsubscribe === 'function'
    ? unsubscribe
    : () => off(busRef);
}
