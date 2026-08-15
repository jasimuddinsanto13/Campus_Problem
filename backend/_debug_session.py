import os

import requests

BASE = 'http://127.0.0.1:8000'
H = {'Origin': BASE, 'Referer': BASE + '/accounts/login/'}
s = requests.Session()
s.get(BASE + '/accounts/login/')
s.post(BASE + '/accounts/login/', data={
    'csrfmiddlewaretoken': s.cookies.get('csrftoken'),
    'email': 'ayesha@niter.local', 'password': 'demo1234', 'role': 'teacher',
}, headers=H, allow_redirects=False)
key = s.cookies.get('sessionid')
print('sessionid:', key)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'campus_project.settings')
import django
django.setup()
print('setup OK')

from django.contrib.auth import get_user_model
from django.contrib.sessions.backends.db import SessionStore

store = SessionStore(session_key=key)
print('exists:', store.exists())
uid = store.get('_auth_user_id')
print('user_id:', uid)
print('expired:', store.is_expired())
user = get_user_model().objects.filter(pk=uid, is_active=True).first()
print('user:', user, '| role:', getattr(user, 'role', None))
