"""
Django settings for campus_project.

Combines two apps on a shared database:
  - issues  : Campus Problem issue tracker
  - booking : NITER-Pulse Smart Classroom Discovery & Room Booking system

Environment-based configuration:
  - LOCAL DEV: SQLite3, DEBUG=True, insecure secret key
  - PRODUCTION (PythonAnywhere): env vars required for SECRET_KEY and DEBUG
"""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Path setup
# ---------------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent

# Load .env file for local development (ignored on PythonAnywhere where
# env vars are set via the Web tab).
# override=False so that env vars set on PythonAnywhere's Web tab
# take priority over the local .env file.
load_dotenv(BASE_DIR / '.env', override=False)


# ---------------------------------------------------------------------------
# Firebase Cloud Messaging (optional: Web Push notifications)
# ---------------------------------------------------------------------------
try:
    import firebase_admin
except ImportError:
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


# ---------------------------------------------------------------------------
# Security: SECRET_KEY and DEBUG from environment variables
# ---------------------------------------------------------------------------
# In production (PythonAnywhere) these MUST be set as environment variables.
# In local dev the defaults below keep things working out of the box.
SECRET_KEY = os.environ.get(
    'DJANGO_SECRET_KEY',
    # Fallback: insecure key for LOCAL DEVELOPMENT ONLY.
    # In production, this fallback is never reached because the env var is
    # required (see the check below).
    'django-insecure-(#zsspo27-4=la^jg!sifk824mkrzyl!%t@+px&-x*@majzb64',
)

DEBUG = os.environ.get('DJANGO_DEBUG', 'True').lower() in ('1', 'true', 'yes')


# ---------------------------------------------------------------------------
# ALLOWED_HOSTS
# ---------------------------------------------------------------------------
# Set ALLOWED_HOSTS in your .env or PythonAnywhere environment variables.
# Examples:
#   ALLOWED_HOSTS=yourusername.pythonanywhere.com,localhost,127.0.0.1
ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
    if host.strip()
]

# Cloud Run auto-sets K_SERVICE — allow it if present.
cloud_run_host = os.environ.get('K_SERVICE', '')
if cloud_run_host:
    ALLOWED_HOSTS.append(cloud_run_host)


# ---------------------------------------------------------------------------
# CORS / CSRF — production origins
# ---------------------------------------------------------------------------
FRONTEND_URL = os.environ.get('FRONTEND_URL', '').rstrip('/')

CORS_ALLOWED_ORIGINS = {
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:8000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8000',
}
if FRONTEND_URL:
    CORS_ALLOWED_ORIGINS.add(FRONTEND_URL)

CSRF_TRUSTED_ORIGINS = [
    origin for origin in CORS_ALLOWED_ORIGINS if origin.startswith('http')
]

# Cookies: secure in production, relaxed in local dev.
SESSION_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = 'None' if not DEBUG else 'Lax'
CSRF_COOKIE_SECURE = not DEBUG


# ---------------------------------------------------------------------------
# Application definition
# ---------------------------------------------------------------------------
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
# Database — SQLite3
# ---------------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# The custom user model lives in the booking app.
AUTH_USER_MODEL = 'booking.User'


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
LOGIN_URL = 'login'
LOGIN_REDIRECT_URL = 'dashboard'
LOGOUT_REDIRECT_URL = 'login'

# Secret key that grants instant, auto-approved Admin registration.
ADMIN_PASSKEY = os.environ.get('ADMIN_PASSKEY', 'CAMPUS-ADMIN-2026')


# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.environ.get('DJANGO_TIME_ZONE', 'Asia/Dhaka')
USE_I18N = True
USE_TZ = True


# ---------------------------------------------------------------------------
# Static files (CSS, JavaScript, Images)
# ---------------------------------------------------------------------------
STATIC_URL = 'static/'
STATICFILES_DIRS = [
    BASE_DIR / 'static',
]
# collectstatic gathers all static files here for production serving.
STATIC_ROOT = BASE_DIR / 'staticfiles'

# User-uploaded media (profile pictures)
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'


# ---------------------------------------------------------------------------
# Misc
# ---------------------------------------------------------------------------
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
API_BASE_URL = os.environ.get('API_BASE_URL', '').rstrip('/')


# ---------------------------------------------------------------------------
# Production safety check
# ---------------------------------------------------------------------------
if not DEBUG and SECRET_KEY.startswith('django-insecure-'):
    raise ValueError(
        'DJANGO_SECRET_KEY must be set to a secure random value in production. '
        'Set it as an environment variable on PythonAnywhere.'
    )
