"""Firestore client singleton — lazily initialized, no-ops gracefully when unconfigured.

Usage::

    from campus_project.firestore_client import get_firestore
    db = get_firestore()
    if db is not None:
        db.collection('notifications').add({...})

When the ``GOOGLE_APPLICATION_CREDENTIALS`` env var is missing or
``google-cloud-firestore`` is not installed every helper returns ``None``
so the rest of the app keeps working without Firestore.
"""

import logging
import os

logger = logging.getLogger(__name__)

_db = None
_checked = False


def get_firestore():
    """Return the Firestore client (singleton) or ``None`` when unconfigured."""
    global _db, _checked
    if _checked:
        return _db
    _checked = True

    try:
        from google.cloud import firestore  # noqa: F401
    except ImportError:
        logger.info('google-cloud-firestore not installed — Firestore disabled.')
        return None

    # google-cloud-firestore uses Application Default Credentials.
    # On Cloud Run the service account is implicit; locally set
    # GOOGLE_APPLICATION_CREDENTIALS in .env.
    cred_path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS', '')
    if cred_path and not os.path.isfile(cred_path):
        logger.warning(
            'GOOGLE_APPLICATION_CREDENTIALS points to %s which does not exist — '
            'Firestore disabled.',
            cred_path,
        )
        return None

    try:
        _db = firestore.Client()
        logger.info('Firestore client initialized (project: %s).', _db.project)
    except Exception:
        logger.exception('Failed to initialize Firestore client.')
        _db = None

    return _db
