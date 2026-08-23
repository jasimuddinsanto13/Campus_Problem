"""Configuration for the FastAPI layer.

Reads the same .env file that Django uses so both layers point at the same
PostgreSQL database (Cloud SQL).
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env', override=True)
load_dotenv(BASE_DIR.parent / '.env', override=True)

DB_NAME = os.environ.get('DB_NAME', 'campus_problem')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
DB_PORT = os.environ.get('DB_PORT', '5432')
_DB_SOCKET = os.environ.get('DB_SOCKET_PATH', '')

# --- Build the SQLAlchemy connection URL ---
if _DB_SOCKET:
    # Cloud Run: connect via Cloud SQL Auth Proxy Unix socket.
    DATABASE_URL = URL.create(
        'postgresql+psycopg2',
        username=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        query={'host': _DB_SOCKET},
    )
else:
    DATABASE_URL = URL.create(
        'postgresql+psycopg2',
        username=DB_USER,
        password=DB_PASSWORD,
        host=DB_HOST,
        port=int(DB_PORT),
        database=DB_NAME,
    )

SSL_ARGS: dict = {}
