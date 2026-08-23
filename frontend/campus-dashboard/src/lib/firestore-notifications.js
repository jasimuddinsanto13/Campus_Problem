/**
 * Firestore real-time notification listener for the React dashboard.
 *
 * Provides:
 *  - subscribeToNotifications(uid, callback) — real-time listener
 *  - fetchNotifications() — one-shot fetch
 *  - markAsRead(notificationId)
 *  - markAllAsRead()
 *  - getUnreadCount()
 *
 * Uses the Firebase JS SDK already installed in the project.
 * Config comes from the same env vars as the existing FCM setup.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  where,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  increment,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';

/** Shared Firebase web config. */
function getConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;
  return {
    apiKey,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
    projectId,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  };
}

/** Lazily-initialized Firebase app & Firestore singleton. */
let _app = null;
let _db = null;

function getDb() {
  if (_db) return _db;
  const config = getConfig();
  if (!config) return null;

  _app = getApps().length
    ? getApps()[0]
    : initializeApp(config);

  _db = getFirestore(_app);
  return _db;
}

/**
 * Subscribe to real-time notifications for a user.
 *
 * @param {string} userUid — the user's UID
 * @param {function} callback — called with an array of notification objects
 * @returns {function} unsubscribe
 */
export function subscribeToNotifications(userUid, callback) {
  const db = getDb();
  if (!db) return () => {};

  const q = query(
    collection(db, 'notifications'),
    where('target_users', 'array-contains', userUid),
    orderBy('created_at', 'desc'),
    fbLimit(50),
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || null,
      is_read: (d.data().read_by || []).includes(userUid),
    }));
    callback(notifications);
  });
}

/**
 * Subscribe to real-time unread count for a user.
 *
 * @param {string} userUid
 * @param {function} callback — called with { unread_count: number }
 * @returns {function} unsubscribe
 */
export function subscribeToUnreadCount(userUid, callback) {
  const db = getDb();
  if (!db) return () => {};

  const ref = doc(db, 'user_notifications', userUid);
  return onSnapshot(ref, (snap) => {
    if (snap.exists()) {
      callback({ unread_count: snap.data().unread_count || 0 });
    } else {
      callback({ unread_count: 0 });
    }
  });
}

/**
 * Mark a single notification as read.
 */
export async function markAsRead(notificationId, userUid) {
  const db = getDb();
  if (!db) return;

  try {
    const ref = doc(db, 'notifications', notificationId);
    await updateDoc(ref, {
      read_by: arrayUnion(userUid),
    });
    // Decrement unread count.
    const unreadRef = doc(db, 'user_notifications', userUid);
    await updateDoc(unreadRef, { unread_count: increment(-1) }).catch(() => {});
  } catch (err) {
    console.warn('Firestore markAsRead failed:', err);
  }
}

/**
 * Mark all notifications as read for a user.
 */
export async function markAllAsRead(userUid) {
  const db = getDb();
  if (!db) return;

  try {
    const q = query(
      collection(db, 'notifications'),
      where('target_users', 'array-contains', userUid),
    );
    const snapshot = await getDocs(q);
    const batch_ops = [];
    for (const snap of snapshot.docs) {
      const data = snap.data();
      if (!(data.read_by || []).includes(userUid)) {
        batch_ops.push(
          updateDoc(snap.ref, { read_by: arrayUnion(userUid) }),
        );
      }
    }
    await Promise.all(batch_ops);
    // Reset unread count.
    const unreadRef = doc(db, 'user_notifications', userUid);
    await updateDoc(unreadRef, { unread_count: 0 }).catch(() => {});
  } catch (err) {
    console.warn('Firestore markAllAsRead failed:', err);
  }
}
