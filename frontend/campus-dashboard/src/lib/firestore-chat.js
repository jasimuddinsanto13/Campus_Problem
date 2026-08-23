/**
 * Firestore real-time chat client for the AI assistant widget.
 *
 * Messages are stored in ``chat_sessions/{uid}/messages/``.
 * The frontend subscribes with onSnapshot() for real-time updates,
 * giving a streaming-like experience without WebSockets.
 *
 * Used by the Campus Assistant chat widget as an alternative transport
 * when Firestore is available.
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  collection,
  query,
  orderBy,
  limit as fbLimit,
  onSnapshot,
  doc,
  setDoc,
  increment,
  deleteDoc,
  getDocs,
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

function _messagesCol(userUid) {
  const db = getDb();
  if (!db) return null;
  return collection(db, 'chat_sessions', userUid, 'messages');
}

function _sessionRef(userUid) {
  const db = getDb();
  if (!db) return null;
  return doc(db, 'chat_sessions', userUid);
}

/**
 * Subscribe to real-time chat messages for a user.
 *
 * @param {string} userUid
 * @param {function} callback — called with [{ role, content, created_at }]
 * @param {number} [maxMessages=50]
 * @returns {function} unsubscribe
 */
export function subscribeToChat(userUid, callback, maxMessages = 50) {
  const col = _messagesCol(userUid);
  if (!col) return () => {};

  const q = query(col, orderBy('created_at', 'asc'), fbLimit(maxMessages));

  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((d) => ({
      id: d.id,
      ...d.data(),
      created_at: d.data().created_at?.toDate?.()?.toISOString() || null,
    }));
    callback(messages);
  });
}

/**
 * Send a user message to Firestore.
 */
export async function sendUserMessage(userUid, content) {
  const col = _messagesCol(userUid);
  if (!col) return null;

  try {
    const msgRef = doc(col);
    await setDoc(msgRef, {
      role: 'user',
      content,
      created_at: new Date(),
    });

    // Update session metadata.
    const sessionRef = _sessionRef(userUid);
    if (sessionRef) {
      await setDoc(sessionRef, {
        updated_at: new Date(),
        message_count: increment(1),
      }, { merge: true });
    }

    return msgRef.id;
  } catch (err) {
    console.warn('Firestore sendUserMessage failed:', err);
    return null;
  }
}

/**
 * Send an assistant reply to Firestore.
 */
export async function sendAssistantMessage(userUid, content) {
  const col = _messagesCol(userUid);
  if (!col) return null;

  try {
    const msgRef = doc(col);
    await setDoc(msgRef, {
      role: 'assistant',
      content,
      created_at: new Date(),
    });

    const sessionRef = _sessionRef(userUid);
    if (sessionRef) {
      await setDoc(sessionRef, {
        updated_at: new Date(),
        message_count: increment(1),
      }, { merge: true });
    }

    return msgRef.id;
  } catch (err) {
    console.warn('Firestore sendAssistantMessage failed:', err);
    return null;
  }
}

/**
 * Clear all chat messages for a user.
 */
export async function clearChatSession(userUid) {
  const col = _messagesCol(userUid);
  if (!col) return;

  try {
    const snapshot = await getDocs(col);
    const deletes = snapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(deletes);

    const sessionRef = _sessionRef(userUid);
    if (sessionRef) {
      await deleteDoc(sessionRef).catch(() => {});
    }
  } catch (err) {
    console.warn('Firestore clearChatSession failed:', err);
  }
}
