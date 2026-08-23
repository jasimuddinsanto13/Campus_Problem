"""Configuration for the FastAPI layer.

Reads the same .env file that Django uses so both layers point at the same
SQLite database.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env', override=True)
load_dotenv(BASE_DIR.parent / '.env', override=True)

# SQLite database path — same file Django uses.
DATABASE_PATH = os.environ.get('DB_PATH', str(BASE_DIR / 'db.sqlite3'))
DATABASE_URL = f'sqlite:///{DATABASE_PATH}'

SSL_ARGS: dict = {}
