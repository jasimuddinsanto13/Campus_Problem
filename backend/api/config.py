"""Configuration for the FastAPI layer.

Reads the same .env file that Django uses so both layers point at the same
MySQL database.  Builds an SSL-enabled connection URL suitable for Aiven
Cloud MySQL, which requires TLS for all client connections.

Aiven uses a self-signed CA certificate chain, so we disable certificate
verification (ssl_verify_cert=False) while still enforcing TLS transport.
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.engine import URL

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / '.env', override=True)
# The repo-root .env also holds shared keys (e.g. GEMINI_API_KEY for the chat
# assistant).
load_dotenv(BASE_DIR.parent / '.env', override=True)

DB_NAME = os.environ.get('DB_NAME', 'campus_problem')
DB_USER = os.environ.get('DB_USER', 'root')
DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
DB_HOST = os.environ.get('DB_HOST', '127.0.0.1')
DB_PORT = os.environ.get('DB_PORT', '3306')

# --- Build the SQLAlchemy connection URL ---
DATABASE_URL = URL.create(
    'mysql+pymysql',
    username=DB_USER,
    password=DB_PASSWORD,
    host=DB_HOST,
    port=int(DB_PORT),
    database=DB_NAME,
    query={'charset': 'utf8mb4'},
)

# --- SSL for Aiven (TLS required, self-signed CA) ---
# PyMySQL accepts an 'ssl' dict inside connect_args.  Passing the CA cert
# path tells PyMySQL to verify the server against Aiven's self-signed CA,
# which is safer than disabling verification entirely.
_SSL_CA = os.environ.get('DB_SSL_CA', '')
if _SSL_CA:
    _ssl_ca_path = Path(_SSL_CA)
    if not _ssl_ca_path.is_absolute():
        _ssl_ca_path = BASE_DIR / _ssl_ca_path
    SSL_ARGS: dict = {
        'ssl': {
            'ca': str(_ssl_ca_path),
        },
    }
else:
    SSL_ARGS = {}
