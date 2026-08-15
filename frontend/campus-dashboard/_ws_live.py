import requests

BASE = 'http://localhost:8000'
H = {'Origin': BASE, 'Referer': f'{BASE}/accounts/login/'}
s = requests.Session()
s.get(f'{BASE}/accounts/login/')
r = s.post(f'{BASE}/accounts/login/', data={
    'csrfmiddlewaretoken': s.cookies.get('csrftoken'),
    'email': 'admin@niter.local', 'password': 'admin1234', 'role': 'admin',
}, headers=H)
print('login:', r.status_code)
token = s.cookies.get('csrftoken')

# Save a workspace-style schedule for IPE batch 12 section B
payload = {'department': 'IPE', 'batch': '12', 'section': 'B', 'slots': [
    {'day': 'SUN', 'start_time': '08:00', 'end_time': '09:00', 'subject': 'IPE-1201 Thermo', 'faculty': 'Dr. A', 'room': 'I-01'},
    {'day': 'MON', 'start_time': '09:00', 'end_time': '10:00', 'subject': 'IPE-1202 Fluid', 'faculty': 'Prof. B', 'room': 'I-02'},
    {'day': 'WED', 'start_time': '10:00', 'end_time': '11:00', 'subject': 'IPE-1203 Lab', 'faculty': 'Dr. C', 'room': 'L-03'},
]}
p = s.put(f'{BASE}/api/routines/', json=payload, headers={**H, 'X-CSRFToken': token})
print('PUT save:', p.status_code, p.json().get('count'))

# Reload it (the workspace does this after save)
g = s.get(f'{BASE}/api/routines/', params={'department': 'IPE', 'batch': '12', 'section': 'B'}, headers=H)
slots = g.json()['slots']
print('GET after save:', len(slots), 'slots')
for sl in slots:
    print('  ', sl['day'], sl['start_time'], '-', sl['end_time'], '|', sl['subject'], '|', sl['room'])

# IPE section C should be rejected (IPE has A, B only)
b = s.put(f'{BASE}/api/routines/', json={'department': 'IPE', 'batch': '12', 'section': 'C', 'slots': []}, headers={**H, 'X-CSRFToken': token})
print('IPE sec C rejected:', b.status_code, b.json())
