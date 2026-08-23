"""
Django settings for campus_project.

Combines two apps on a shared PostgreSQL database (Cloud SQL)
  - issues  : Campus Problem issue tracker (ported from the original Flask app)
  - booking : NITER-Pulse Smart Classroom Discovery & Room Booking system

PostgreSQL (Cloud SQL).
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from .env (DB credentials, secret key, API URL).
load_dotenv(BASE_DIR / '.env', override=True)


# --- Firebase Cloud Messaging (optional: Web Push notifications) ---
# Initialize the Firebase Admin SDK from backend/serviceAccountKey.json (or
# FIREBASE_CRED_PATH) when present. Push is strictly optional — without the
# credential file the app runs identically, minus OS-level notifications.
# booking.fcm reuses this app when it exists and lazily initializes its own
# otherwise, so the two init paths never conflict.
try:
    import firebase_admin
except ImportError:  # firebase-admin not installed — push disabled
    firebase_admin = None

FIREBASE_CRED_PATH = (
    os.environ.get('FIREBASE_CRED_PATH', '') or str(BASE_DIR / 'serviceAccountKey.json')
)
if (
    firebase_admin is not None
    and os.path.exists(FIREBASE_CRED_PATH)
    and not firebase_admin._apps
):
    try:
        from firebase_admin import credentials

        firebase_admin.initialize_app(credentials.Certificate(FIREBASE_CRED_PATH))
    except (ValueError, OSError):
        logger.warning(
            'Firebase credentials at %s could not be loaded — push disabled.',
            FIREBASE_CRED_PATH,
        )


# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    'django-insecure-(#zsspo27-4=la^jg!sifk824mkrzyl!%t@+px&-x*@majzb64',
)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('1', 'true', 'yes')

ALLOWED_HOSTS = [host.strip() for host in os.environ.get('ALLOWED_HOSTS', '127.0.0.1,localhost').split(',')]
# Cloud Run auto-sets a hostname; allow it.
cloud_run_host = os.environ.get('K_SERVICE', '')  # e.g. "campus-backend"
if cloud_run_host:
    ALLOWED_HOSTS.append(cloud_run_host)

# React is deployed on Vercel; the backend runs on Cloud Run.
# FRONTEND_URL points to the Vercel deployment.
FRONTEND_URL = os.environ.get(
    'FRONTEND_URL',
    'https://niter-contest.web.app',
).rstrip('/')
CORS_ALLOWED_ORIGINS = {
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8000',
    # Legacy Render origins (kept during migration)
    'https://campus-problem-frontend.onrender.com',
    'https://campus-problem.onrender.com',
    # Firebase Hosting
    'https://niter-contest.web.app',
    # Legacy Vercel
    'https://campus-problem.vercel.app',
}
if FRONTEND_URL:
    CORS_ALLOWED_ORIGINS.add(FRONTEND_URL)

CSRF_TRUSTED_ORIGINS = [origin for origin in CORS_ALLOWED_ORIGINS if origin.startswith('http')]

# Allow Django auth cookies to survive a cross-site redirect from the
# Firebase Hosting frontend to the Cloud Run backend service.
SESSION_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
CSRF_COOKIE_SECURE = not DEBUG


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'issues',
    'booking',
    'accounts',
    # Role sections (top-level folders, wired in as Django apps):
    'admin.apps.AdminPortalConfig',
    'faculty.apps.FacultyPortalConfig',
    'student.apps.StudentPortalConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'campus_project.cors.FrontendCorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'campus_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'campus_project.wsgi.application'


# ---------------------------------------------------------------------------
# Database — PostgreSQL on Cloud SQL (Cloud Run) or local dev.
# psycopg2 is the production driver (see requirements.txt).
#
# On Cloud Run the DB_SOCKET_PATH env var is set to the Cloud SQL auth
# proxy Unix socket (e.g. /cloudsql/PROJECT:REGION:INSTANCE). When present
# the driver connects over the socket — faster and no open TCP port needed.
# ---------------------------------------------------------------------------

_DB_SOCKET = os.environ.get('DB_SOCKET_PATH', '')

# Build DB OPTIONS dict (supports both Cloud SQL socket and schema override).
_DB_OPTIONS: dict = {}
if _DB_SOCKET:
    _DB_OPTIONS['unix_socket'] = _DB_SOCKET
if os.environ.get('DB_SCHEMA'):
    _DB_OPTIONS['options'] = f"-c search_path={os.environ['DB_SCHEMA']}"

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('DB_NAME', 'campus_problem'),
        'USER': os.environ.get('DB_USER', 'postgres'),
        'PASSWORD': os.environ.get('DB_PASSWORD', ''),
        'HOST': os.environ.get('DB_HOST', '127.0.0.1'),
        'PORT': os.environ.get('DB_PORT', '5432'),
        **(({'OPTIONS': _DB_OPTIONS}) if _DB_OPTIONS else {}),
    }
}

# The custom user model lives in the booking app (NITER-Pulse schema).
AUTH_USER_MODEL = 'booking.User'

# --- Role-based auth (accounts app) ---
# Unapproved students/faculty are inactive, so the default login URL simply
# bounces them back to the login page until an admin approves them.
LOGIN_URL = 'login'
LOGIN_REDIRECT_URL = 'dashboard'
LOGOUT_REDIRECT_URL = 'login'

# Secret key that grants instant, auto-approved Admin registration.
ADMIN_PASSKEY = os.environ.get('ADMIN_PASSKEY', 'CAMPUS-ADMIN-2026')


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = os.environ.get('DJANGO_TIME_ZONE', 'Asia/Dhaka')

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'

STATICFILES_DIRS = [
    BASE_DIR / 'static',
]

# User-uploaded media (profile pictures) — served by Django in DEBUG.
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Default primary key field type
# https://docs.djangoproject.com/en/6.0/ref/settings/#default-auto-field

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Base URL of the backend API. On Cloud Run, K_SERVICE is set automatically.
# The frontend proxies /api/* to the same origin via Firebase Hosting rewrites,
# so an empty base URL (same-origin) works in production.
API_BASE_URL = os.environ.get('API_BASE_URL', '').rstrip('/')


# ---------------------------------------------------------------------------
# Firestore — real-time notifications, caching, chat, and optional sessions.
# Requires the google-cloud-firestore package (in requirements.txt) and
# Application Default Credentials (implicit on Cloud Run, or set
# GOOGLE_APPLICATION_CREDENTIALS locally).
# ---------------------------------------------------------------------------
FIRESTORE_COLLECTION_PREFIX = os.environ.get('FIRESTORE_COLLECTION_PREFIX', '')

# Optional: use Firestore as the Django cache backend.
# Set FIRESTORE_CACHE=1 in .env to enable; otherwise the default DB cache
# (or the existing CacheControl setup) remains active.
USE_FIRESTORE_CACHE = os.environ.get('FIRESTORE_CACHE', '').lower() in ('1', 'true', 'yes')
if USE_FIRESTORE_CACHE:
    CACHES = {
        'default': {
            'BACKEND': 'campus_project.firestore_cache.FirestoreCache',
            'OPTIONS': {
                'collection': f'{FIRESTORE_COLLECTION_PREFIX}django_cache'.lstrip('_'),
                'TTL': int(os.environ.get('FIRESTORE_CACHE_TTL', '3600')),
            },
        }
    }

# Optional: use Firestore as the Django session backend.
# Set SESSION_ENGINE=campus_project.firestore_session in .env to enable.
# Default is the database-backed engine (db).
Firestore_SESSION_ENGINE = 'campus_project.firestore_session'
# Only activate if explicitly requested.
if os.environ.get('SESSION_ENGINE') == Firestore_SESSION_ENGINE:
    SESSION_ENGINE = Firestore_SESSION_ENGINE
