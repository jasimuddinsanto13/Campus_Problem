import requests

BASE = 'http://localhost:8000'
H = {'Origin': BASE, 'Referer': f'{BASE}/accounts/login/'}

CREATED = []


def ensure_user(email, role):
    from django.contrib.auth import get_user_model

    U = get_user_model()
    if U.objects.filter(email=email).exists():
        return
    U.objects.create_user(
        email, email=email, password='rightpass123', role=role,
        registration_status='approved', is_active=True,
        is_staff=(role == 'admin'), first_name=role.title(),
    )
    CREATED.append(email)


ensure_user('portal-admin@niter.local', 'admin')
ensure_user('portal-teach@niter.local', 'teacher')
ensure_user('portal-stu@niter.local', 'student')


def login(email, role):
    s = requests.Session()
    s.get(f'{BASE}/accounts/login/')
    r = s.post(f'{BASE}/accounts/login/', data={
        'csrfmiddlewaretoken': s.cookies.get('csrftoken'),
        'email': email, 'password': 'rightpass123', 'role': role,
    }, headers=H, allow_redirects=False)
    return s, r


s_admin, r_admin = login('portal-admin@niter.local', 'admin')
s_teach, r_teach = login('portal-teach@niter.local', 'teacher')
s_stu, r_stu = login('portal-stu@niter.local', 'student')
print('admin login ->', r_admin.status_code, r_admin.headers.get('Location'))
print('faculty login ->', r_teach.status_code, r_teach.headers.get('Location'))
print('student login ->', r_stu.status_code, r_stu.headers.get('Location'))

users = s_teach.get(f'{BASE}/api/users/', headers=H)
print('faculty GET /api/users/ ->', users.status_code, '(expect 403)')

s_admin.get(f'{BASE}/api/routines/?department=CSE&batch=10&section=A', headers=H)
tok = s_admin.cookies.get('csrftoken')
s_admin.put(f'{BASE}/api/routines/', json={
    'department': 'CSE', 'batch': '10', 'section': 'A',
    'slots': [{'day': 'SUN', 'start_time': '09:00', 'end_time': '10:00',
               'subject': 'Portal CSE-101', 'faculty': 'Dr. X', 'room': 'C-1'}],
}, headers={**H, 'X-CSRFToken': tok})
v = s_teach.get(f'{BASE}/api/routines/?department=CSE&batch=10&section=A', headers=H)
print('faculty GET /api/routines/ ->', v.status_code, 'slots:', len(v.json().get('slots', [])))

w = s_teach.put(f'{BASE}/api/routines/', json={
    'department': 'CSE', 'batch': '10', 'section': 'A', 'slots': [],
}, headers={**H, 'X-CSRFToken': s_teach.cookies.get('csrftoken')})
print('faculty PUT /api/routines/ ->', w.status_code, '(expect 403)')

v2 = s_stu.get(f'{BASE}/api/routines/?department=CSE&batch=10&section=A', headers=H)
print('student GET /api/routines/ ->', v2.status_code)

p = s_teach.get(f'{BASE}/api/profile/', headers=H).json()['profile']
print('faculty profile role:', p['role'], '| dept:', repr(p['department']))

from booking.models import RoutineSlot
RoutineSlot.objects.filter(subject='Portal CSE-101').delete()
from django.contrib.auth import get_user_model
U = get_user_model()
U.objects.filter(email__in=CREATED).delete()
print('cleaned test data')
