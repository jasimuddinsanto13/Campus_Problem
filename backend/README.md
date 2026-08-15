# Campus Problem — backend

The runnable Django + FastAPI application for the campus platform. This folder
is the `backend/` section of the repository; the role sections (`admin/`,
`faculty/`, `student/`) live inside it and are wired in as Django apps (see
`campus_project/settings.py`).

| Layer      | Role                                                                  | URL                  |
| ---------- | --------------------------------------------------------------------- | -------------------- |
| Django     | Serves pages (login/register, role portals, issue desk, booking) + admin | http://127.0.0.1:8000 |
| FastAPI    | REST API (issues, rooms, availability, bookings) on the same MySQL DB | http://127.0.0.1:8001 |
| MySQL 8    | Single shared database (`campus_problem`)                             | 127.0.0.1:3306       |

## Quick start (Windows)

Prerequisites: MySQL 8 running locally, Python 3.12+ on the `py` launcher.

```powershell
cd backend
py -m pip install -r requirements.txt

# 1. Configure the database
copy .env.example .env        # edit DB_PASSWORD if your root user has one

# 2. Create the database and schema
mysql -u root -e "CREATE DATABASE IF NOT EXISTS campus_problem CHARACTER SET utf8mb4"
py manage.py migrate
py manage.py seed_demo        # demo users/rooms/routines/issues/bookings

# 3. Run both servers (two terminals)
py manage.py runserver        # Django  -> http://127.0.0.1:8000
py -m uvicorn api.main:app --reload --port 8001   # FastAPI -> http://127.0.0.1:8001
```

Then open:

- Login: http://127.0.0.1:8000/accounts/login/
- Site root (entry point): http://127.0.0.1:8000 — login page when signed
  out, role portal when signed in
- Admin portal: http://127.0.0.1:8000/portal/admin/
- Faculty portal: http://127.0.0.1:8000/portal/faculty/
- Student portal: http://127.0.0.1:8000/portal/student/
- Issue desk: http://127.0.0.1:8000/issues/
- Room booking: http://127.0.0.1:8000/booking
- Django admin: http://127.0.0.1:8000/admin (user `admin`, password `admin1234` after seeding)
- API docs: http://127.0.0.1:8001/docs

## Role-based authentication

Three-tier access control (Student / Faculty / Admin) with an approval workflow:

- **Login** — `/accounts/login/` with a role selector. The chosen role must match
  the account's role, and the account must be approved.
- **Registration** — `/accounts/register/` (full name, email, password, campus ID,
  role). Students & faculty are created as **pending** and cannot log in until an
  admin approves them.
- **Admin passkey** — selecting the Admin role reveals a passkey field. Any
  active key in the `booking_adminpasskey` table (seeded with `add001`–`add010`,
  manageable from Django admin) auto-approves the account instantly; the legacy
  `ADMIN_PASSKEY` in `.env` is also accepted, but only when explicitly set.
  An invalid key rejects registration.
- **Role portals** — after login, `/accounts/dashboard/` dispatches each role to
  its own section: `admin/` (approval panel), `faculty/`, `student/`.
- **Admin modules** — besides the approval queue on `/portal/admin/`, the admin
  portal has a two-tab user directory (`/portal/admin/users/`) and the master
  routine setup grid (`/portal/admin/routines/`). Saved routines become the
  baseline occupancy: rooms with a scheduled class stop appearing free in the
  availability search, and the API rejects bookings that clash with a routine.
- **Booking privilege** — on `/booking/`, students have view-only access while
  faculty and admins can lock rooms (the dashboard hides the booking action for
  students and attributes bookings to the logged-in teacher).

Seeded demo accounts: `admin`/`admin1234` (approved), `teacher`/`demo1234` and
`student`/`demo1234` (approved), plus `pending_student`/`demo1234` and
`pending_teacher`/`demo1234` so the admin panel has something to review.

## REST API (FastAPI)

| Method | Path                    | Description                                   |
| ------ | ----------------------- | --------------------------------------------- |
| GET    | `/api/health`           | Service + database health                     |
| GET    | `/api/issues`           | List issues                                   |
| POST   | `/api/issues`           | Create an issue (JSON or form)                |
| PATCH  | `/api/issues/{id}`      | Update issue status (Open/In progress/Resolved) |
| GET    | `/api/summary`          | Issue counts by status                        |
| GET    | `/api/rooms`            | All rooms                                     |
| GET    | `/api/rooms/free?date=YYYY-MM-DD&start=09:00&end=10:30` | Free rooms in a window |
| GET    | `/api/bookings?date=`   | Bookings (optionally for a date)              |
| POST   | `/api/bookings`         | Book a room (409 if the window is taken)      |

## Architecture notes

- **Schema ownership:** Django migrations own the MySQL schema (`booking/` and
  `issues/` migrations). The FastAPI layer (`api/`) maps the same tables with
  SQLAlchemy and never creates tables. Generated DDL snapshots live in the
  `database/` section at the repo root, split into three sections
  (`users/`, `issues/`, `rooms/`).
- **Auth:** `AUTH_USER_MODEL = booking.User` (custom `AbstractUser` with
  role/department/section/batch/phone/campus_id and a `registration_status`
  pending/approved/rejected field).
- **Role sections:** the `admin/`, `faculty/`, `student/` apps live inside
  `backend/` and are registered in `INSTALLED_APPS`; since `manage.py` runs from
  this folder they are importable without extra path setup.

## Generating the SRS document

```powershell
py protype.py    # writes NITER_Pulse_Specification.docx
```
