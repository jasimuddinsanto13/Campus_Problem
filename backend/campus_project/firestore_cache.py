"""Django cache backend backed by Cloud Firestore.

Use in ``settings.py``::

    CACHES = {
        'default': {
            'BACKEND': 'campus_project.firestore_cache.FirestoreCache',
            'OPTIONS': {'collection': 'django_cache'},
        }
    }

Every key is stored as a Firestore document with ``value`` (pickled) and
``expires_at`` (Firestore Timestamp).  ``get()`` returns ``None`` when
the document is missing **or** expired; expired documents are lazily
deleted on read and swept by a daily maintenance call.
"""

import logging
import pickle
import time
from datetime import datetime, timezone

from django.core.cache.backends.base import BaseCache, DEFAULT_TIMEOUT

logger = logging.getLogger(__name__)


def _get_client():
    from campus_project.firestore_client import get_firestore
    return get_firestore()


class FirestoreCache(BaseCache):
    """Firestore-backed Django cache."""

    def __init__(self, server, params):
        super().__init__(server, params)
        self._collection = self._options.get('collection', 'django_cache')
        self._ttl = int(self._options.get('TTL', 3600))  # default 1 h

    def _col(self):
        db = _get_client()
        if db is None:
            return None
        return db.collection(self._collection)

    # -- low-level -----------------------------------------------------------

    def _doc_ref(self, key):
        return self._col().document(self._safe_key(key))

    @staticmethod
    def _safe_key(key):
        """Firestore doc IDs cannot contain ``/``, ``#``, ``[`` or ``]``."""
        return str(key).replace('/', '__SLASH__').replace('#', '__HASH__')

    def _serialize(self, value):
        return pickle.dumps(value, protocol=pickle.HIGHEST_PROTOCOL)

    def _deserialize(self, blob):
        return pickle.loads(blob)

    # -- public API ----------------------------------------------------------

    def add(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        if timeout is DEFAULT_TIMEOUT:
            timeout = self._ttl
        if self.has_key(key, version=version):
            return False
        self.set(key, value, timeout=timeout, version=version)
        return True

    def get(self, key, default=None, version=None):
        col = self._col()
        if col is None:
            return default
        try:
            snap = self._doc_ref(key).get()
            if not snap.exists:
                return default
            data = snap.to_dict()
            expires = data.get('expires_at')
            if expires and hasattr(expires, 'timestamp'):
                # google.cloud.firestore v2 Timestamp
                if expires.timestamp() < time.time():
                    self._doc_ref(key).delete()
                    return default
            return self._deserialize(data['value'])
        except Exception:
            logger.debug('Firestore cache get failed for %s', key, exc_info=True)
            return default

    def set(self, key, value, timeout=DEFAULT_TIMEOUT, version=None):
        col = self._col()
        if col is None:
            return
        if timeout is DEFAULT_TIMEOUT:
            timeout = self._ttl
        try:
            expires_at = datetime.fromtimestamp(time.time() + timeout, tz=timezone.utc) if timeout else None
            doc = {
                'value': self._serialize(value),
                'expires_at': expires_at,
                'updated_at': datetime.now(tz=timezone.utc),
            }
            self._doc_ref(key).set(doc)
        except Exception:
            logger.debug('Firestore cache set failed for %s', key, exc_info=True)

    def delete(self, key, version=None):
        col = self._col()
        if col is None:
            return
        try:
            self._doc_ref(key).delete()
        except Exception:
            logger.debug('Firestore cache delete failed for %s', key, exc_info=True)

    def has_key(self, key, version=None):
        col = self._col()
        if col is None:
            return False
        try:
            snap = self._doc_ref(key).get()
            if not snap.exists:
                return False
            data = snap.to_dict()
            expires = data.get('expires_at')
            if expires and hasattr(expires, 'timestamp'):
                if expires.timestamp() < time.time():
                    self._doc_ref(key).delete()
                    return False
            return True
        except Exception:
            return False

    def clear(self):
        """Delete all documents in the cache collection (use with caution)."""
        col = self._col()
        if col is None:
            return
        try:
            docs = col.stream()
            batch = _get_client().batch()
            count = 0
            for doc in docs:
                batch.delete(doc.reference)
                count += 1
                if count % 500 == 0:
                    batch.commit()
                    batch = _get_client().batch()
            if count % 500 != 0:
                batch.commit()
        except Exception:
            logger.debug('Firestore cache clear failed.', exc_info=True)

    def close(self):
        pass
