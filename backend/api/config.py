"""Configuration for the FastAPI layer.

Reads the same .env file that Django uses so both layers point at the same
MySQL database.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env')

DB_NAME = os.environ.get('DB_NAME', 'campus_problem')
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
DB_PORT = os.environ.get('DB_PORT', '3306')

DATABASE_URL = URL.create(
    'mysql+pymysql',
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=int(DB_PORT),
    database=DB_NAME,
    query={'charset': 'utf8mb4'},
)
