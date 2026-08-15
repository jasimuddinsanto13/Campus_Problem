"""E2E: role-based booking permissions on Django + FastAPI."""
import datetime as dt

import requests

BASE = 'http://127.0.0.1:8000'  # Vite proxy -> Django 8002
API = 'http://127.0.0.1:8001'   # FastAPI
H = {'Origin': BASE, 'Referer': BASE + '/accounts/login/'}


def login(email, pw, role):
    s = requests.Session()
    s.get(BASE + '/accounts/login/')
    s.post(BASE + '/accounts/login/', data={
        'csrfmiddlewaretoken': s.cookies.get('csrftoken'),
        'email': email, 'password': pw, 'role': role,
    }, headers=H, allow_redirects=False)
    return s


STU = login('arif@niter.local', 'demo1234', 'student')
TEACH = login('ayesha@niter.local', 'demo1234', 'teacher')

# ---------------------------------------------------------------- Django side
av = TEACH.get(BASE + '/api/room-booking/availability/?day=WED&start=09:00&end=10:00', headers=H).json()
room = next(r for r in av['rooms'] if r['free'])
code_to_py = {'SUN': 6, 'MON': 0, 'TUE': 1, 'WED': 2, 'THU': 3, 'SAT': 5}
delta = (code_to_py['WED'] - dt.date.today().weekday()) % 7 or 7
wed = (dt.date.today() + dt.timedelta(days=delta)).isoformat()

payload = {
    'room_id': room['id'], 'department': 'CSE', 'batch': '10', 'section': 'A',
    'subject': 'Role E2E', 'reason': 'extra', 'day': 'WED', 'date': wed,
    'start_time': '09:00', 'end_time': '10:00',
}

r = STU.post(BASE + '/api/room-booking/requests/', headers={**H, 'X-CSRFToken': STU.cookies.get('csrftoken')}, json=payload)
print('Django: student POST request ->', r.status_code, '|', r.json().get('error'))

r = TEACH.post(BASE + '/api/room-booking/requests/', headers={**H, 'X-CSRFToken': TEACH.cookies.get('csrftoken')}, json=payload)
print('Django: teacher POST request ->', r.status_code)
if r.status_code == 201:
    rid = r.json()['request']['id']
    TEACH.patch(BASE + f'/api/room-booking/requests/{rid}/', headers={**H, 'X-CSRFToken': TEACH.cookies.get('csrftoken')}, json={'action': 'cancel'})
    print('  (cleanup: teacher cancelled own request)')

# --------------------------------------------------------------- FastAPI side
anon = requests.Session()
r = anon.post(API + '/api/bookings', json={**payload, 'date': wed, 'booking_type': 'extra_class', 'batch_section': '10A'})
print('FastAPI: anonymous POST ->', r.status_code, '|', r.json().get('detail'))

r = STU.post(API + '/api/bookings', json={**payload, 'date': wed, 'booking_type': 'extra_class', 'batch_section': '10A'})
print('FastAPI: student POST ->', r.status_code, '|', r.json().get('detail'))

free = TEACH.get(API + f'/api/rooms/free?date={wed}&start=09:00&end=10:00').json()
free_room = next(x for x in free if x['free'])
r = TEACH.post(API + '/api/bookings', json={
    'room_id': free_room['id'], 'date': wed, 'start_time': '09:00', 'end_time': '10:00',
    'booking_type': 'extra_class', 'department': 'CSE', 'batch_section': '10A',
})
print('FastAPI: teacher POST ->', r.status_code, '|', r.json().get('message'))
print('  booked_by_id is the teacher:', r.json()['booking']['booked_by_id'] == TEACH.get(BASE + '/api/profile/', headers=H).json()['profile']['id'])
print('done')
