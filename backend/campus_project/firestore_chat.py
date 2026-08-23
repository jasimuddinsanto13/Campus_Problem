"""Firestore-backed real-time chat store for the AI assistant.

Messages are stored per-user in a sub-collection:

    chat_sessions/{uid}/messages/{auto-id}
      role: "user" | "assistant"
      content: str
      created_at: Timestamp

The top-level document tracks session metadata:

    chat_sessions/{uid}
      created_at: Timestamp
      updated_at: Timestamp
      message_count: int

The frontend can ``onSnapshot()`` the ``messages`` sub-collection to
get real-time streaming-like updates without WebSockets.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


def _get_client():
    from campus_project.firestore_client import get_firestore
    return get_firestore()


def _session_col(user_uid):
    db = _get_client()
    if db is None:
        return None
    return db.collection('chat_sessions').document(str(user_uid))


def save_message(user_uid, role, content):
    """Append a message to the user's chat session.

    ``role`` is ``'user'`` or ``'assistant'``.
    """
    db = _get_client()
    if db is None:
        return None

    now = datetime.now(tz=timezone.utc)
    session_ref = _session_col(user_uid)
    if session_ref is None:
        return None

    try:
        msg_ref = session_ref.collection('messages').document()
        msg_ref.set({
            'role': role,
            'content': content,
            'created_at': now,
        })

        # Update session metadata.
        session_ref.set({
            'created_at': now,
            'updated_at': now,
            'message_count': _firestore.Increment(1),
        }, merge=True)

        return msg_ref.id
    except Exception:
        logger.debug('Firestore save_message failed.', exc_info=True)
        return None


def get_recent_messages(user_uid, limit=20):
    """Return the most recent messages for context window."""
    db = _get_client()
    if db is None:
        return []

    try:
        session_ref = _session_col(user_uid)
        if session_ref is None:
            return []

        query = (
            session_ref.collection('messages')
            .order_by('created_at', direction='DESCENDING')
            .limit(limit)
        )
        messages = []
        for snap in query.stream():
            data = snap.to_dict()
            messages.append({
                'role': data.get('role', 'user'),
                'content': data.get('content', ''),
            })
        messages.reverse()  # oldest first for context
        return messages
    except Exception:
        logger.debug('Firestore get_recent_messages failed.', exc_info=True)
        return []


def clear_session(user_uid):
    """Delete all messages in a user's chat session."""
    db = _get_client()
    if db is None:
        return

    try:
        session_ref = _session_col(user_uid)
        if session_ref is None:
            return

        docs = session_ref.collection('messages').stream()
        batch = db.batch()
        count = 0
        for doc in docs:
            batch.delete(doc.reference)
            count += 1
            if count % 500 == 0:
                batch.commit()
                batch = db.batch()
        if count % 500 != 0:
            batch.commit()

        session_ref.delete()
    except Exception:
        logger.debug('Firestore clear_session failed.', exc_info=True)


def subscribe_to_messages(user_uid, callback):
    """Register a real-time listener for new messages.

    ``callback`` receives a list of message dicts each time the
    collection changes.  Returns an unsubscribe handle.

    Only works client-side (JS SDK).  For the Python backend this is
    a no-op — the backend writes, the frontend subscribes.
    """
    # Firestore real-time listeners are a client-side JS feature.
    # This is a placeholder documenting the intended API contract.
    return lambda: None
