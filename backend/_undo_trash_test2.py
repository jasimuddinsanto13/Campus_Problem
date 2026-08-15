"""Verify: trash frees slot, restore conflict guard, owner-undo restriction."""
import datetime as dt

import requests

BASE = 'http://localhost:8000'
H = {'Origin': BASE, 'Referer': BASE + '/accounts/login/'}


def login(email, pw, role):
    s = requests.Session()
    s.get(BASE + '/accounts/login/')
    s.post(BASE + '/accounts/login/', data={
        'csrfmiddlewaretoken': s.cookies.get('csrftoken'),
        'email': email, 'password': pw, 'role': role,
    }, headers=H, allow_redirects=False)
    return s, s.cookies.get('csrftoken')


ADMIN, atok = login('admin@niter.local', 'admin1234', 'admin')
TEACH, ttok = login('ayesha@niter.local', 'demo1234', 'teacher')


def create(s, tok, room_id, day, start, end, date, subject):
    return s.post(BASE + '/api/room-booking/requests/', headers={**H, 'X-CSRFToken': tok}, json={
        'room_id': room_id, 'department': 'CSE', 'batch': '10', 'section': 'A',
        'subject': subject, 'reason': 'extra', 'day': day, 'date': date,
        'start_time': start, 'end_time': end,
    })


def act(s, tok, rid, action):
    return s.patch(BASE + f'/api/room-booking/requests/{rid}/', headers={**H, 'X-CSRFToken': tok}, json={'action': action})


def free_rooms(s, day, start, end):
    return s.get(BASE + f'/api/room-booking/availability/?day={day}&start={start}&end={end}', headers=H).json()['rooms']


def cleanup():
    rows = ADMIN.get(BASE + '/api/room-booking/requests/?include=trashed', headers=H).json()['requests']
    for q in rows:
        if q['subject'].startswith('SlotTest'):
            act(ADMIN, atok, q['id'], 'trash')
            act(ADMIN, atok, q['id'], 'delete')


day, start, end = 'WED', '14:00', '15:00'
delta = ({'SUN': 6, 'MON': 0, 'TUE': 1, 'WED': 2, 'THU': 3, 'SAT': 5}[day] - dt.date.today().weekday()) % 7 or 7
date = (dt.date.today() + dt.timedelta(days=delta)).isoformat()

room = next(r for r in free_rooms(TEACH, day, start, end) if r['free'])

# 1) create + approve -> room locked; trash -> room freed again
a = create(TEACH, ttok, room['id'], day, start, end, date, 'SlotTest A')
aid = a.json()['request']['id']
act(ADMIN, atok, aid, 'approve')
print('approved -> room free?', not next(r for r in free_rooms(TEACH, day, start, end) if r['id'] == room['id'])['free'])
act(ADMIN, atok, aid, 'trash')
print('trashed -> room free?', next(r for r in free_rooms(TEACH, day, start, end) if r['id'] == room['id'])['free'])

# 2) someone else books the freed slot; restore A must 409
b = create(TEACH, ttok, room['id'], day, start, end, date, 'SlotTest B')
bid = b.json()['request']['id']
act(ADMIN, atok, bid, 'approve')
r = act(ADMIN, atok, aid, 'restore')
print('restore A while B holds slot (expect 409):', r.status_code, r.json().get('error'))

# 3) owner undo of a rejected request -> 403
c = create(TEACH, ttok, room['id'], day, start, end, date, 'SlotTest C')
cid = c.json()['request']['id']
# free the slot first (B holds it) so C can be created
act(ADMIN, atok, bid, 'cancel')
act(ADMIN, atok, bid, 'trash')
r = act(ADMIN, atok, cid, 'reject')
print('admin reject C:', r.status_code)
r = act(TEACH, ttok, cid, 'undo')
print('owner undo of rejected (expect 403):', r.status_code, r.json().get('error'))
# admin CAN undo the rejection -> pending
r = act(ADMIN, atok, cid, 'undo')
print('admin undo of rejected:', r.status_code, r.json()['request']['status'])

# 4) owner undo of cancelled still works
r = act(TEACH, ttok, cid, 'cancel')
r = act(TEACH, ttok, cid, 'undo')
print('owner undo of cancelled (expect 200 pending):', r.status_code, r.json()['request']['status'])

cleanup()
print('cleanup done')
