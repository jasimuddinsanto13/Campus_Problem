"""Django session backend backed by Cloud Firestore.

Enable in ``settings.py``::

    SESSION_ENGINE = 'campus_project.firestore_session'

Each session is a document:

    sessions/{session_key}
      session_data: str  (base64-encoded Django session payload)
      user_uid: str | null
      expire_date: Timestamp
      updated_at: Timestamp

TTL-based cleanup: expired sessions are lazily deleted on read and
sweeped periodically.
"""

import base64
import logging
import pickle
from datetime import datetime, timedelta, timezone

from django.contrib.sessions.backends.base import SessionBase
from django.utils import timezone as django_tz

logger = logging.getLogger(__name__)


def _get_client():
    from campus_project.firestore_client import get_firestore
    return get_firestore()


class SessionStore(SessionBase):
    """Firestore-backed session store."""

    COLLECTION = 'sessions'

    def __init__(self, session_key=None):
        super().__init__(session_key)

    def _col(self):
        db = _get_client()
        if db is None:
            return None
        return db.collection(self.COLLECTION)

    def _doc_ref(self, key=None):
        col = self._col()
        if col is None:
            return None
        return col.document(key or self.session_key)

    def exists(self, session_key=None):
        col = self._col()
        if col is None:
            return False
        try:
            snap = self._doc_ref(session_key).get()
            if not snap.exists:
                return False
            data = snap.to_dict()
            expires = data.get('expire_date')
            if expires and hasattr(expires, 'timestamp'):
                if expires.timestamp() < datetime.now(tz=timezone.utc).timestamp():
                    self._doc_ref(session_key).delete()
                    return False
            return True
        except Exception:
            return False

    def create(self):
        while True:
            self.session_key = self._get_new_session_key()
            if not self.exists(self.session_key):
                break
        self.modified = True
        return True

    def _load_session_data(self):
        """Unpickle the stored session data."""
        col = self._col()
        if col is None:
            return {}
        try:
            snap = self._doc_ref().get()
            if not snap.exists:
                return {}
            data = snap.to_dict()
            # Check expiry.
            expires = data.get('expire_date')
            if expires and hasattr(expires, 'timestamp'):
                if expires.timestamp() < datetime.now(tz=timezone.utc).timestamp():
                    self._doc_ref().delete()
                    return {}
            encoded = data.get('session_data', '')
            if not encoded:
                return {}
            return pickle.loads(base64.b64decode(encoded))
        except Exception:
            logger.debug('Firestore session load failed.', exc_info=True)
            return {}

    def load(self):
        return self._load_session_data()

    def save(self, must_create=False):
        col = self._col()
        if col is None:
            return
        try:
            data_dict = self._get_session(no_load=must_create)
            encoded = base64.b64encode(pickle.dumps(data_dict, protocol=pickle.HIGHEST_PROTOCOL)).decode('ascii')
            now = datetime.now(tz=timezone.utc)
            ttl_seconds = self._get_expiry()
            if ttl_seconds is None:
                expire_date = now + timedelta(seconds=1209600)  # 2 weeks default
            else:
                expire_date = now + timedelta(seconds=ttl_seconds)

            doc = {
                'session_data': encoded,
                'expire_date': expire_date,
                'updated_at': now,
            }
            # Store user UID for querying sessions by user.
            if hasattr(self, '_session_cache') and '_auth_user_id' in self._session_cache:
                doc['user_uid'] = str(self._session_cache['_auth_user_id'])

            self._doc_ref().set(doc)
        except Exception:
            logger.debug('Firestore session save failed.', exc_info=True)

    def delete(self, session_key=None):
        col = self._col()
        if col is None:
            return
        try:
            self._doc_ref(session_key).delete()
        except Exception:
            pass

    def clear(self):
        """Delete all sessions — use with caution."""
        col = self._col()
        if col is None:
            return
        try:
            db = _get_client()
            docs = col.stream()
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
        except Exception:
            logger.debug('Firestore session clear failed.', exc_info=True)
