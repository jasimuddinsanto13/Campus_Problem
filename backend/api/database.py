"""SQLAlchemy engine and session management for the FastAPI layer.

Configures a connection-pooled engine for Cloud SQL PostgreSQL.
pool_pre_ping detects stale connections automatically so the app
reconnects transparently after network blinks or server-side timeouts.
"""

import logging

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import DATABASE_URL, SSL_ARGS

logger = logging.getLogger(__name__)

engine = create_engine(
    DATABASE_URL,
    connect_args=SSL_ARGS,
    # --- Connection pooling ---
    pool_pre_ping=True,
    pool_recycle=1800,
    echo=False,
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
