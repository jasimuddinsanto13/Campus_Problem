"""
PythonAnywhere WSGI Configuration
==================================
Paste this into your PythonAnywhere WSGI file:
  Web tab → WSGI configuration file → Edit wsgi.py

Replace YOUR_PROJECT_NAME with your actual project folder name
(the folder containing settings.py, which is "campus_project" in this repo).
Replace YOUR_USERNAME with your PythonAnywhere username.
"""

import os
import sys

# ---------------------------------------------------------------------------
# 1. Add your project directory to sys.path
# ---------------------------------------------------------------------------
# This is the folder that contains manage.py and campus_project/.
# If you uploaded the "backend" folder, the path is:
#   /home/YOUR_USERNAME/backend
project_home = '/home/YOUR_USERNAME/backend'
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# ---------------------------------------------------------------------------
# 2. Set the Django settings module
# ---------------------------------------------------------------------------
# If your project folder is named "campus_project":
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'campus_project.settings')

# If you renamed it, change 'campus_project' to your project name:
# os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'YOUR_PROJECT_NAME.settings')

# ---------------------------------------------------------------------------
# 3. Set environment variables for production
# ---------------------------------------------------------------------------
# These override the .env file and ensure production safety.
# Set DJANGO_SECRET_KEY to a real secret on PythonAnywhere:
#   Web tab → Environment variables
os.environ.setdefault('DJANGO_DEBUG', 'False')
# os.environ.setdefault('DJANGO_SECRET_KEY', 'paste-a-real-secret-here')
# os.environ.setdefault('ALLOWED_HOSTS', 'YOUR_USERNAME.pythonanywhere.com')

# ---------------------------------------------------------------------------
# 4. Load the Django WSGI application
# ---------------------------------------------------------------------------
from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()
