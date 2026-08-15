<div align="center">

# 🎓 Campus Problem

### Next-Generation University Campus & Academic Management System

A role-based (Admin / Faculty / Student) university platform that unifies **campus issue tracking**, **smart classroom discovery & room booking**, **routine & notice management**, and **class-cancellation alerts** in one clean, glassmorphic web experience.

![Django 5.2](https://img.shields.io/badge/Django-5.2%20LTS-092E20?logo=django&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.14-009688?logo=fastapi&logoColor=white) ![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white) ![MySQL 8](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white) ![FCM](https://img.shields.io/badge/Firebase%20Cloud%20Messaging-enabled-FFCA28?logo=firebase&logoColor=white)

</div>

---

## ✨ Features at a Glance

- 🧭 **Role-based portals** — dedicated Admin, Faculty, and Student dashboards with server-side access control and a registration approval workflow.
- 🛠️ **Campus issue tracker** — report broken projectors, AC faults, and other campus problems with categories, priorities, and status tracking (**Open / In Progress / Resolved**).
- 🏫 **Smart classroom discovery & booking** — real-time free-room search across campus buildings with **"free until"** windows; faculty book Extra Class / Makeup / Exam slots instantly.
- 📅 **Weekly routine management** — Sunday–Thursday master grid with cascading **batch → department → section** pickers; saved routines lock rooms as baseline occupancy.
- ⚡ **Exam conflict override** — admin bookings that clash with a routine class auto-displace it and alert the affected faculty with a one-click reschedule flow.
- 📢 **Targeted notice board** — role / department / batch / section-scoped notices with priority badges and file attachments.
- 🚨 **Class cancellation & mass alerts** — one-click cancellation that auto-publishes an **URGENT** notice and fires push notifications to the exact matching students.
- 📲 **Firebase Cloud Messaging** — real-time OS-level push alerts for cancellations and urgent notices (fails safe when unconfigured).
- ✅ **Admin moderation** — approve/reject registrations, manage users, and review/trash booking requests.

---

## Table of Contents

- [✨ Features at a Glance](#-features-at-a-glance)
- [1. Project Overview & Architecture](#1-project-overview--architecture)
- [2. Key Features by User Role](#2-key-features-by-user-role)
- [3. Tech Stack](#3-tech-stack)
- [4. Installation & Setup Guide](#4-installation--setup-guide)
- [5. Project Structure](#5-project-structure)
- [6. Environment Variables](#6-environment-variables)
- [7. Demo Accounts](#7-demo-accounts)
- [8. REST API Reference](#8-rest-api-reference)
- [9. Push Notifications (FCM)](#9-push-notifications-fcm)
- [10. Production Notes](#10-production-notes)

---

## 1. Project Overview & Architecture

**Campus Problem** is a 3-tier role-based campus management platform built for university administration, faculty members, and students. It merges two long-standing subsystems into one cohesive product:

- **Campus Problem** — the infrastructure/classroom **issue tracker** (originally a standalone Flask app, now ported into Django + FastAPI).
- **NITER-Pulse** — the **smart classroom discovery & room booking** engine with routine management, exam-conflict overrides, and class-cancellation alerting.

Every user signs in to a portal tailored to their role: admins moderate registrations and publish notices, faculty discover free rooms and cancel classes with one-click mass alerts, and students get a filtered feed of routines, notices, and live cancellation banners.

```
┌──────────────────────────────────────────────────────────────────────┐
│                          Client Layer                                │
│  React 19 SPA (frontend/)   +   Server-rendered Django       │
│  Vite + Tailwind CSS 4 · Glassmorphism UI   portal templates         │
│  Firebase Web Push (Service Worker)                                  │
├──────────────────────────────────────────────────────────────────────┤
│                           HTTP Layer                                 │
│  Django 5.2 (Auth, sessions, role portals, admin APIs)   ·   FastAPI │
│  (REST: issues, rooms, bookings, availability)                       │
├──────────────────────────────────────────────────────────────────────┤
│                          Data Layer                                  │
│  MySQL 8  —  shared by Django ORM + SQLAlchemy (FastAPI)             │
│  booking_user · registration_request · routines · room_bookings ·    │
│  extra_class_requests · displaced_classes · class_cancellations ·    │
│  notices · device_tokens · issues                                    │
└──────────────────────────────────────────────────────────────────────┘
```

### 🎨 Visual Design Language

The platform uses a **modern off-white aesthetic** with **lime-green `#C4F135` accents**, soft **rounded glassmorphic cards** (frosted translucency, subtle borders, layered shadows), and **clean modern typography**. The design system is implemented with **Tailwind CSS 4** and a consistent token set shared across the React SPA and the Django-rendered portals.

### 🏗️ Architectural Highlights

| Principle | How it's applied |
|---|---|
| **Role-based access** | Custom `User` model (`booking.User`) with `role` (`student` / `teacher` / `admin`) and `registration_status` (`pending` / `approved` / `rejected`). Unapproved accounts cannot log in. |
| **Registration audit trail** | Every public self-registration writes a `RegistrationRequest` row; approval outcomes are mirrored back onto it. |
| **Dual API surface** | Django serves auth + portal pages and admin APIs; FastAPI exposes the REST layer (`/api/rooms/free`, `/api/bookings`, `/api/issues`…) against the same MySQL DB via SQLAlchemy. |
| **Shared session auth** | FastAPI resolves the Django `sessionid` cookie to the active user, so REST bookings are enforced server-side — students are rejected with `403` regardless of client state. |
| **Overlap-driven occupancy** | `_occupancy()` is shared by the faculty availability search, faculty requests, and the admin exam-override pipeline — approved requests count as occupancy, so double-booking is structurally impossible. |
| **Best-effort push** | FCM pushes run on a daemon thread and silently no-op when Firebase is unconfigured — the app never breaks without push. |

---

## 2. Key Features by User Role

### A. Admin Portal

- **Dashboard Analytics** — Live counters for pending user reviews, active students, faculty, and overall accounts, plus a two-tab user directory (Students / Faculty) with per-account status.
- **User Approval System** — Verify student/faculty registrations with **Approve / Reject** actions. Approving activates the account instantly; rejecting blocks login. Registration data is strictly filtered by **Department** (`CSE`, `EEE`, `TE`, `IPE`, `FDAE`), **Batch** (`0–16`), and **Section** (`A`, `B`, `C`, `D`).
- **Routine Setup & Management** — A Sunday–Thursday weekly grid (batch → department → section cascading pickers) that records subject / teacher / room per slot. Saving a routine establishes **baseline occupancy** — rooms with a scheduled class no longer appear free in availability searches.
- **Targeted Notice Board Management** — Categorized notice creation with **Target Role** (All / Faculty Only / Students Only), optional **department + batch + section narrowing**, **priority badges** (`Normal`, `Important`, `Urgent`), **file/PDF attachments**, and pin-to-top support.
- **Master Room Booking & Exam Conflict Override** — Admins create bookings that are **approved instantly**. When an *Exam/Quiz* booking collides with a scheduled routine class, the class is automatically **overridden** (`is_override`), a `DisplacedClass` row is written for the affected faculty, and a **real-time alert banner** appears on the faculty dashboard with a one-click reschedule flow.
- **Booking Moderation** — Review, approve, reject, restore, and trash faculty extra-class requests; remove invalid bookings to free rooms again.

### B. Faculty Portal

- **Dynamic Classroom Availability Finder** — Search free slots across campus buildings (Academic Building 1 & 2) in real time within the working-day window (e.g. 08:00 AM – 04:00 PM). The search respects one-off bookings, weekly routines, *and* approved extra-class requests, and reports **"free until"** for each open room.
- **Room Booking Requests** — Self-service request flow for **Extra Class**, **Rescheduled (Makeup) Class**, and **Exam/Quiz**, complete with **duration selection (1h, 1.5h, 2h, 3h)** and department/batch/section targeting. Requests are reviewed by admins and, once **approved**, count as occupancy to prevent double-booking. *(Note: per the SRS, faculty requests require admin approval; admin-created bookings are approved immediately.)*
- **Displaced-Class Replacement Workflow** — When an admin's exam override displaces a routine class, the affected faculty sees a dashboard banner linked straight into the booking flow **pre-filled with the displaced window**, and submits a replacement with one click.
- **Class Cancellation & Mass Student Alerts** — Department / Batch / Section-wise cancellation tool with structured reasons (faculty unavailable, emergency, official meeting, rescheduled, other). Cancelling **auto-publishes an URGENT notice** to the exact matching students, fires **FCM push notifications** to their registered devices, and marks the routine grid. Restoring a class removes the notice too.
- **Issue Desk & Outbox** — Infrastructure/classroom defect reporting (broken projectors, AC faults, etc.) with categories, priority levels, and status tracking (**Pending / In Progress / Resolved**).

### C. Student Portal

- **Department-Filtered Routine & Notices** — An automated feed that shows general campus notices *and* announcements scoped to the student's own department / batch / section.
- **Read-Only Room Availability View** — Real-time visibility into which campus classrooms are open right now and until when.
- **Cancellation Alerts & Push Notifications** — High-priority dashboard alert banners, routine-grid markings, and **mobile OS notifications** the moment a scheduled class is cancelled by a faculty member.
- **Issue Reporting** — Students can log campus problems and track their status through resolution.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| **Backend (web)** | Django **5.2 LTS** (Python 3.10+) — auth, sessions, role portals, admin APIs |
| **Backend (REST)** | FastAPI 0.14 + Uvicorn — `/api/*` REST layer (issues, rooms, bookings, availability) |
| **Database** | **MySQL 8** via PyMySQL (Django) + SQLAlchemy 2.0 (FastAPI), shared schema owned by Django migrations |
| **Frontend** | **React 19** SPA with **Vite 6** + **Tailwind CSS 4** (`frontend/campus-dashboard/`), plus server-rendered Django templates for the portal shells |
| **Design system** | Glassmorphism cards, off-white canvas, lime-green `#C4F135` accents, rounded corners, soft shadows |
| **Push notifications** | **Firebase Cloud Messaging (FCM)** — `firebase-admin` (server) + Firebase JS SDK & Service Worker (`firebase-messaging-sw.js`) |
| **Authentication** | Django Auth with a custom user model extending `AbstractUser`: `student_id`/`campus_id`, `department`, `batch`, `section`, `role`, `registration_status`, profile picture |
| **Utilities** | `python-dotenv`, `Pillow` (profile pictures), `python-docx`, `jspdf` (routine PDF export) |

---

## 4. Installation & Setup Guide

### Prerequisites

- **Python 3.10+** (3.12+ recommended)
- **pip** and **virtualenv** (`python -m venv`)
- **MySQL 8** running locally (credentials configured via `.env`)
- **Node.js 18+** (only if developing the React dashboard)

### Step-by-step

```bash
# 1. Clone repository
git clone https://github.com/your-username/campus-problem.git
cd campus-problem

# 2. Set up virtual environment
python -m venv venv
source venv/bin/activate          # On Windows: venv\Scripts\activate

# 3. Install dependencies
cd backend
pip install -r requirements.txt

# 4. Configure environment
copy .env.example .env            # On Windows — or: cp .env.example .env
#    Edit DB_PASSWORD / DB_USER to match your local MySQL installation.

# 5. Create the database
mysql -u root -e "CREATE DATABASE IF NOT EXISTS campus_problem CHARACTER SET utf8mb4"

# 6. Database setup (schema is owned by Django migrations)
python manage.py makemigrations
python manage.py migrate

# 7. Optional: seed demo accounts & demo data
python manage.py seed_demo

# 8. Create a superuser (admin account)
python manage.py createsuperuser

# 9. Run the development servers — Django on :8000, FastAPI on :8001
python manage.py runserver
# in a second terminal:
python -m uvicorn api.main:app --reload --port 8001

# 10. Optional: React dashboard dev server (Vite, on :8000 proxying to Django)
cd frontend/campus-dashboard
npm install
npm run dev
```

> **Note:** The project ships with `makemigrations`/`migrate` in the quick start, but since migrations are committed, `migrate` alone is sufficient for a fresh clone.

### Access the portals

| Portal | URL |
|---|---|
| Login | `http://127.0.0.1:8000/accounts/login/` |
| Admin portal | `http://127.0.0.1:8000/portal/admin/` |
| Faculty portal | `http://127.0.0.1:8000/portal/faculty/` |
| Student portal | `http://127.0.0.1:8000/portal/student/` |
| Issue desk | `http://127.0.0.1:8000/issues/` |
| Room booking | `http://127.0.0.1:8000/booking/` |
| FastAPI docs (Swagger) | `http://127.0.0.1:8001/docs` |

---

## 5. Project Structure

```
campus-problem/
├── frontend/               # All frontend applications
│   └── campus-dashboard/   # React 19 + Vite + Tailwind SPA
│       └── src/
│           ├── pages/      # Dashboard, Routines, RoomBooking, Notices,
│           │               #   Cancellations, Faculty pages, Users, Settings…
│           ├── components/ # CancelClassModal, NoticeBoard, CancellationBanner…
│           ├── lib/        # API helpers (routines, notices, cancellations…)
│           └── firebase-messaging-sw.js   # FCM service worker
├── backend/                # All runnable application code
│   ├── campus_project/     # Django settings, root URLs, WSGI/ASGI
│   ├── accounts/           # Registration, login, role redirects
│   ├── admin/              # Admin portal (dashboard, user approval, routines, settings)
│   ├── faculty/            # Faculty portal (dashboard + templates)
│   ├── student/            # Student portal (dashboard + templates)
│   ├── booking/            # Core domain: users, rooms, routines, bookings,
│   │   │                   #   extra-class requests, displaced classes,
│   │   │                   #   cancellations, notices, FCM, admin APIs
│   │   ├── migrations/     # 20 migrations owning the MySQL schema
│   │   └── management/commands/seed_demo.py
│   ├── issues/             # Campus Problem issue tracker (Django models)
│   ├── api/                # FastAPI REST layer (main.py, database.py, schemas.py)
│   ├── templates/          # Shared portal base templates
│   ├── static/             # Legacy portal CSS/JS
│   └── requirements.txt
├── database/               # SQL schema reference (users/ issues/ rooms/)
└── README.md
```

---

## 6. Environment Variables

All backend configuration lives in `backend/.env` (see `.env.example`):

| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `campus_problem` | MySQL database name |
| `DB_USER` | `root` | MySQL user |
| `DB_PASSWORD` | *(empty)* | MySQL password |
| `DB_HOST` | `127.0.0.1` | MySQL host |
| `DB_PORT` | `3306` | MySQL port |
| `DJANGO_SECRET_KEY` | *(dev fallback)* | **Set a strong value in production** |
| `DJANGO_DEBUG` | `True` | Toggle debug mode (`True`/`False`) |
| `ALLOWED_HOSTS` | `127.0.0.1,localhost` | Comma-separated allowed hosts |
| `DJANGO_TIME_ZONE` | `Asia/Dhaka` | Server timezone |
| `API_BASE_URL` | `http://127.0.0.1:8001` | Base URL of the FastAPI layer |
| `ADMIN_PASSKEY` | `CAMPUS-ADMIN-2026` | Legacy passkey for instant admin registration |
| `FIREBASE_CRED_PATH` | *(empty)* | Path to Firebase service-account JSON (defaults to `backend/serviceAccountKey.json`) |
| `FCM_SERVICE_ACCOUNT_PATH` | *(empty)* | Legacy Firebase credential path (lazy init fallback) |

---

## 7. Demo Accounts

After running `python manage.py seed_demo`, these accounts exist:

| Account | Password | Role / Status |
|---|---|---|
| `admin` | `admin1234` | Admin (approved) |
| `teacher` | `demo1234` | Faculty (approved) |
| `student` | `demo1234` | Student (approved) |
| `pending_student` | `demo1234` | Student (pending — for the admin approval panel) |
| `pending_teacher` | `demo1234` | Faculty (pending) |

Admin registration passkeys `add001`–`add010` are seeded into the `booking_adminpasskey` table (manageable from Django admin).

---

## 8. REST API Reference

### FastAPI (`http://127.0.0.1:8001`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (service + DB) |
| `GET` | `/api/issues` | List all reported issues |
| `POST` | `/api/issues` | Create an issue (JSON or form data) |
| `PATCH` | `/api/issues/{id}` | Update issue status |
| `GET` | `/api/summary` | Issue counts by status |
| `GET` | `/api/rooms` | List all rooms |
| `GET` | `/api/rooms/free?date&start&end` | Rooms free in a time window |
| `GET` | `/api/bookings?date=` | List bookings (incl. weekly routines) |
| `POST` | `/api/bookings` | Create a booking — **401** unauthenticated, **403** students, **409** on conflict |

### Django (`http://127.0.0.1:8000`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/room-booking/rooms/` | Every bookable room |
| `POST` | `/api/admin/room-booking/create/` | **Admin-only** instant booking + exam override |
| `GET` | `/api/room-booking/displaced/` | Displaced classes (own / all) |
| `POST` | `/api/profile/fcm-token/` | Register the signed-in user's FCM token (`{"fcm_token": ...}`) |
| `POST` | `/api/push/subscribe/` | Register an FCM device token (legacy alias) |

---

## 9. Push Notifications (FCM)

Web Push is **opt-in infrastructure that fails safe** — without Firebase configured the app runs exactly as normal, just without OS-level notifications.

### Setup

1. Drop your Firebase service-account JSON at `backend/serviceAccountKey.json` (or point `FIREBASE_CRED_PATH` at it in `backend/.env`). The file is gitignored — never commit it.
2. `settings.py` initializes the Firebase Admin SDK on boot when the credential file is present.
3. The web client (`frontend/campus-dashboard`) registers its FCM token via `POST /api/profile/fcm-token/` (payload `{"fcm_token": ...}`); the legacy `POST /api/push/subscribe/` works too. Tokens land in the multi-device `DeviceToken` table and mirror onto the user's `fcm_token` profile field.

### What triggers a push

- **Class cancelled** — `push_class_cancellation()` sends **"🚨 Class Cancelled"** pushes to every matched student's registered device (web / Android / iOS).
- **Urgent notice published** — `push_urgent_notice()` pushes admin-published URGENT notices to the exact matching audience (role + department / batch / section).

Both dispatch through the multicast `send_push_notification()` helper — a single FCM call for many tokens — on a background thread, and dead/unregistered tokens are pruned automatically after each send.

---

## 10. Production Notes

- **Security:** set a real `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, and an explicit `ALLOWED_HOSTS` list; serve over HTTPS.
- **Static & media:** collect static files (`python manage.py collectstatic`) and serve `MEDIA_ROOT` (profile pictures, notice attachments) via your web server or object storage.
- **Database:** keep MySQL 8 with `utf8mb4`; run `python manage.py migrate` as part of your deployment pipeline.
- **Processes:** run Django (WSGI) and FastAPI (Uvicorn) behind a reverse proxy; the frontend proxies `/api/*` to the appropriate service.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the existing conventions — role logic lives in the role section apps, domain logic in `backend/booking/`, and REST endpoints in `backend/api/`.
3. Run the Django test suite before opening a pull request:

```bash
python manage.py test
```

---

## License

Private / institutional use. See the repository owner for licensing details.
