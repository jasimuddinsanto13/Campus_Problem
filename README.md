<div align="center">

# 🎓 Campus Problem

### Next-Generation University Campus & Academic Management System

A role-based (Admin / Faculty / Student) university platform that unifies **campus issue tracking**, **smart classroom discovery & room booking**, **routine & notice management**, and **class-cancellation alerts** in one clean, glassmorphic web experience — with a **Flutter mobile client** for cross-platform access.

![Django 5.2](https://img.shields.io/badge/Django-5.2%20LTS-092E20?logo=django&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.14-009688?logo=fastapi&logoColor=white) ![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white) ![SQLite3](https://img.shields.io/badge/SQLite3-3-003B57?logo=sqlite&logoColor=white) ![Flutter](https://img.shields.io/badge/Flutter-3.x-02569B?logo=flutter&logoColor=white) ![FCM](https://img.shields.io/badge/Firebase%20Cloud%20Messaging-enabled-FFCA28?logo=firebase&logoColor=white)

</div>

---

## ✨ Features at a Glance

- 🧭 **Role-based portals** — dedicated Admin, Faculty, and Student dashboards with server-side access control and a registration approval workflow.
- 🔐 **Role-matched login** — backend validates that the selected "I am a" role matches the stored account role; mismatch returns `{"message": "Please select the correct role"}` (400).
- 🛠️ **Campus issue tracker** — report broken projectors, AC faults, and other campus problems with categories, priorities, and status tracking (**Open / In Progress / Resolved**).
- 🏫 **Smart classroom discovery & booking** — real-time free-room search across campus buildings with **"free until"** windows; faculty book Extra Class / Makeup / Exam slots instantly.
- 📅 **Weekly routine management** — Sunday–Thursday master grid with cascading **batch → department → section** pickers; saved routines lock rooms as baseline occupancy.
- ⚡ **Exam conflict override** — admin bookings that clash with a routine class auto-displace it and alert the affected faculty with a one-click reschedule flow.
- 📢 **Targeted notice board** — role / department / batch / section-scoped notices with priority badges and file attachments.
- 🚨 **Class cancellation & mass alerts** — one-click cancellation that auto-publishes an **URGENT** notice and fires push notifications to the exact matching students.
- 📲 **Firebase Cloud Messaging** — real-time OS-level push alerts for cancellations and urgent notices (fails safe when unconfigured).
- 🔔 **Firestore real-time notifications** — in-app notification feed with unread badges, powered by Cloud Firestore.
- 🤖 **AI chat assistant** — Gemini-powered chatbot with voice input (transcription) and text-to-speech output, proxied through Django.
- ✅ **Admin moderation** — approve/reject registrations, manage users, and review/trash booking requests.
- 📱 **Flutter mobile client** — native Android/iOS app with role-based login, registration, and full API integration.

---

## Table of Contents

- [✨ Features at a Glance](#-features-at-a-glance)
- [1. Project Overview & Architecture](#1-project-overview--architecture)
- [2. Key Features by User Role](#2-key-features-by-user-role)
- [3. Tech Stack](#3-tech-stack)
- [4. Installation & Setup Guide](#4-installation--setup-guide)
- [5. Project Structure — Complete File Map](#5-project-structure--complete-file-map)
- [6. Coding Methods & Patterns](#6-coding-methods--patterns)
- [7. Environment Variables](#7-environment-variables)
- [8. Demo Accounts](#8-demo-accounts)
- [9. REST API Reference](#9-rest-api-reference)
- [10. Push Notifications (FCM)](#10-push-notifications-fcm)
- [11. Firestore Real-Time Features](#11-firestore-real-time-features)
- [12. Flutter Mobile Client](#12-flutter-mobile-client)
- [13. Deployment](#13-deployment)
- [14. Production Notes](#14-production-notes)

---

## 1. Project Overview & Architecture

**Campus Problem** is a 3-tier role-based campus management platform built for university administration, faculty members, and students. It merges two long-standing subsystems into one cohesive product:

- **Campus Problem** — the infrastructure/classroom **issue tracker** (originally a standalone Flask app, now ported into Django + FastAPI).
- **NITER-Pulse** — the **smart classroom discovery & room booking** engine with routine management, exam-conflict overrides, and class-cancellation alerting.

Every user signs in to a portal tailored to their role: admins moderate registrations and publish notices, faculty discover free rooms and cancel classes with one-click mass alerts, and students get a filtered feed of routines, notices, and live cancellation banners.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                     │
│  React 19 SPA (frontend/)     Flutter App (flutter_app/)                     │
│  Vite + Tailwind CSS 4        Dart + Material Design 3                       │
│  Firebase Web Push (SW)       HTTP REST API calls                            │
├──────────────────────────────────────────────────────────────────────────────┤
│                              HTTP Layer                                       │
│  Django 5.2 (Auth, sessions, role portals, admin APIs, chat proxy)           │
│  FastAPI 0.14 (REST: issues, rooms, bookings, availability, AI chat)         │
│  Vite dev proxy routes /api/* to Django (:8002) or FastAPI (:8001)           │
├──────────────────────────────────────────────────────────────────────────────┤
│                              Data Layer                                       │
│  SQLite3 — shared by Django ORM + SQLAlchemy (FastAPI)                       │
│  Cloud Firestore — real-time notifications, chat sessions, cache, sessions   │
│  Firebase Cloud Messaging — OS-level push notifications                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 🎨 Visual Design Language

The platform uses a **modern off-white aesthetic** with **lime-green `#C4F135` accents**, soft **rounded glassmorphic cards** (frosted translucency, subtle borders, layered shadows), and **clean modern typography**. The design system is implemented with **Tailwind CSS 4** and a consistent token set shared across the React SPA, Django-rendered portals, and Flutter mobile client.

### 🏗️ Architectural Highlights

| Principle | How it's applied |
|---|---|
| **Role-based access** | Custom `User` model (`booking.User`) with `role` (`student` / `teacher` / `admin`) and `registration_status` (`pending` / `approved` / `rejected`). Unapproved accounts cannot log in. |
| **Role-matched login** | Both React SPA and Flutter client send the selected role; backend rejects mismatches with `{"message": "Please select the correct role"}` (400). |
| **Registration audit trail** | Every public self-registration writes a `RegistrationRequest` row; approval outcomes are mirrored back onto it. |
| **Dual API surface** | Django serves auth + portal pages and admin APIs; FastAPI exposes the REST layer against the same SQLite DB via SQLAlchemy. |
| **Shared session auth** | FastAPI resolves the Django `sessionid` cookie to the active user, so REST bookings are enforced server-side. |
| **Overlap-driven occupancy** | `_occupancy()` is shared by the faculty availability search, faculty requests, and the admin exam-override pipeline. |
| **Best-effort push** | FCM pushes run on a daemon thread and silently no-op when Firebase is unconfigured. |
| **Firestore real-time** | Notifications, chat sessions, cache, and sessions can optionally use Cloud Firestore for real-time capabilities. |

---

## 2. Key Features by User Role

### A. Admin Portal

- **Dashboard Analytics** — Live counters for pending user reviews, active students, faculty, and overall accounts, plus a two-tab user directory (Students / Faculty) with per-account status.
- **User Approval System** — Verify student/faculty registrations with **Approve / Reject** actions. Approving activates the account instantly; rejecting blocks login. Registration data is strictly filtered by **Department** (`CSE`, `EEE`, `TE`, `IPE`, `FDAE`), **Batch** (`0–16`), and **Section** (`A`, `B`, `C`, `D`).
- **Routine Setup & Management** — A Sunday–Thursday weekly grid (batch → department → section cascading pickers) that records subject / teacher / room per slot. Saving a routine establishes **baseline occupancy**.
- **Targeted Notice Board Management** — Categorized notice creation with **Target Role** (All / Faculty Only / Students Only), optional **department + batch + section narrowing**, **priority badges** (`Normal`, `Important`, `Urgent`), **file/PDF attachments**, and pin-to-top support.
- **Master Room Booking & Exam Conflict Override** — Admins create bookings that are **approved instantly**. When an *Exam/Quiz* booking collides with a scheduled routine class, the class is automatically **overridden** and a `DisplacedClass` row is written.
- **Booking Moderation** — Review, approve, reject, restore, and trash faculty extra-class requests.
- **Issue Desk Management** — View all campus issues, update status, and leave admin responses.

### B. Faculty Portal

- **Dynamic Classroom Availability Finder** — Search free slots across campus buildings in real time. The search respects one-off bookings, weekly routines, *and* approved extra-class requests.
- **Room Booking Requests** — Self-service request flow for **Extra Class**, **Rescheduled (Makeup) Class**, and **Exam/Quiz**, complete with **duration selection (1h, 1.5h, 2h, 3h)**.
- **Displaced-Class Replacement Workflow** — When an admin's exam override displaces a routine class, the affected faculty sees a dashboard banner linked straight into the booking flow.
- **Class Cancellation & Mass Student Alerts** — Department / Batch / Section-wise cancellation tool with structured reasons. Cancelling **auto-publishes an URGENT notice** and fires **FCM push notifications**.
- **Issue Desk & Outbox** — Infrastructure/classroom defect reporting with categories, priority levels, and status tracking.
- **My Schedule** — Personal weekly timetable matched by name against the routine's plain-text faculty column.

### C. Student Portal

- **Department-Filtered Routine & Notices** — An automated feed that shows general campus notices *and* announcements scoped to the student's own department / batch / section.
- **Read-Only Room Availability View** — Real-time visibility into which campus classrooms are open right now and until when.
- **Cancellation Alerts & Push Notifications** — High-priority dashboard alert banners, routine-grid markings, and **mobile OS notifications**.
- **Meal Query** — Hostel meal cancellation requests for specific dates.
- **Bus Tracker** — Campus bus navigation (interactive map).
- **Issue Reporting** — Students can log campus problems and track their status.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| **Backend (web)** | Django **5.2 LTS** (Python 3.10+) — auth, sessions, role portals, admin APIs, chat proxy |
| **Backend (REST)** | FastAPI 0.14 + Uvicorn — `/api/*` REST layer (issues, rooms, bookings, availability, AI chat) |
| **Database** | **SQLite3** via PyMySQL (Django) + SQLAlchemy 2.0 (FastAPI), shared schema |
| **Real-time data** | **Cloud Firestore** — notifications, chat sessions, Django cache backend, Django session backend |
| **Frontend (web)** | **React 19** SPA with **Vite 6** + **Tailwind CSS 4** (`frontend/campus-dashboard/`) |
| **Frontend (mobile)** | **Flutter 3.x** with Dart — Material Design 3 UI (`flutter_app/`) |
| **Design system** | Glassmorphism cards, off-white canvas, lime-green `#C4F135` accents, rounded corners, soft shadows |
| **Push notifications** | **Firebase Cloud Messaging (FCM)** — `firebase-admin` (server) + Firebase JS SDK & Service Worker |
| **AI assistant** | **Google Gemini** via `google-genai` SDK — chat, voice transcription (STT), text-to-speech (TTS) |
| **Authentication** | Django Auth with custom `AbstractUser` model: `campus_id`, `department`, `batch`, `section`, `role`, `registration_status` |
| **Utilities** | `python-dotenv`, `Pillow` (profile pictures), `python-docx` (DOCX export), `jspdf` (routine PDF export), `PyJWT` |

---

## 4. Installation & Setup Guide

### Prerequisites

- **Python 3.10+** (3.12+ recommended)
- **pip** and **virtualenv** (`python -m venv`)
- **Node.js 18+** (for the React dashboard)
- **Flutter 3.x** + **Dart SDK** (for the mobile client)
- **Git**

### Step-by-step

```bash
# 1. Clone repository
git clone https://github.com/your-username/campus-problem.git
cd campus-problem

# 2. Set up virtual environment
python -m venv venv
source venv/bin/activate          # On Windows: venv\Scripts\activate

# 3. Install backend dependencies
cd backend
pip install -r requirements.txt

# 4. Configure environment
cp .env.example .env              # Edit as needed

# 5. Database setup (schema is owned by Django migrations)
python manage.py migrate

# 6. Optional: seed demo accounts & demo data
python manage.py seed_demo

# 7. Create a superuser (admin account)
python manage.py createsuperuser

# 8. Run the development servers
#    Terminal 1 — Django on :8002
python manage.py runserver 8002

#    Terminal 2 — FastAPI on :8001
python -m uvicorn api.main:app --reload --port 8001

#    Terminal 3 — React dev server (Vite, on :8000 proxying to Django/FastAPI)
cd frontend/campus-dashboard
npm install
npm run dev

# 9. Flutter mobile client (optional)
cd flutter_app
flutter pub get
flutter run
```

### Access the portals

| Portal | URL |
|---|---|
| React SPA (Vite dev) | `http://127.0.0.1:8000` |
| Django (direct) | `http://127.0.0.1:8002` |
| Admin portal | `http://127.0.0.1:8000/admin/dashboard` |
| Faculty portal | `http://127.0.0.1:8000/faculty/dashboard` |
| Student portal | `http://127.0.0.1:8000/student/dashboard` |
| Issue desk | `http://127.0.0.1:8000/issues/` |
| Room booking | `http://127.0.0.1:8000/booking/` |
| FastAPI docs (Swagger) | `http://127.0.0.1:8001/docs` |
| Flutter app | Runs on Android emulator / iOS simulator / physical device |

---

## 5. Project Structure — Complete File Map

```
campus-problem/
├── .env                          # Root environment variables (Gemini API key, etc.)
├── .firebaserc                   # Firebase project config
├── .gitignore                    # Git ignore rules
├── firebase.json                 # Firebase hosting + Firestore + Storage config
├── firestore.indexes.json        # Firestore composite indexes
├── firestore.rules               # Firestore security rules
├── storage.rules                 # Firebase Storage security rules
├── render.yaml                   # Render.com deployment blueprint
├── README.md                     # This file
├── NITER_Pulse_Specification.docx # Project SRS document
│
├── backend/                      # ─── ALL SERVER-SIDE CODE ───
│   ├── manage.py                 # Django management CLI
│   ├── requirements.txt          # Python dependencies
│   ├── .env                      # Backend environment variables (DB, secrets)
│   ├── .env.example              # Template for .env
│   ├── db.sqlite3                # SQLite3 database (development)
│   ├── serviceAccountKey.json    # Firebase service-account credentials (gitignored)
│   ├── pythonanywhere_wsgi.py    # WSGI entry point for PythonAnywhere deployment
│   ├── README.md                 # Backend-specific notes
│   │
│   ├── campus_project/           # Django project configuration
│   │   ├── __init__.py
│   │   ├── settings.py           # All Django settings (DB, auth, CORS, installed apps)
│   │   ├── urls.py               # Root URL configuration — maps all API + portal routes
│   │   ├── views.py              # SPA catch-all views + chat proxy to FastAPI
│   │   ├── wsgi.py               # WSGI application entry point
│   │   ├── asgi.py               # ASGI application entry point
│   │   ├── cors.py               # Custom CORS middleware for cross-origin session cookies
│   │   ├── firestore_client.py   # Firestore client singleton (lazy init, no-ops gracefully)
│   │   ├── firestore_cache.py    # Django cache backend backed by Cloud Firestore
│   │   ├── firestore_session.py  # Django session backend backed by Cloud Firestore
│   │   ├── firestore_chat.py     # Firestore-backed real-time chat message store
│   │   └── firestore_notifications.py # Firestore-backed real-time notification store
│   │
│   ├── accounts/                 # Authentication & user management
│   │   ├── __init__.py
│   │   ├── apps.py               # Django app config
│   │   ├── urls.py               # Auth routes (login, logout, register)
│   │   ├── views.py              # Auth views + JSON API (api_login, api_register, api_logout)
│   │   │                         #   + profile API, routines API, users API, meal query API
│   │   │                         #   + CR management, force password reset, profile picture
│   │   └── tests.py              # Auth tests
│   │
│   ├── booking/                  # Core domain — users, rooms, routines, bookings
│   │   ├── __init__.py
│   │   ├── apps.py               # Django app config
│   │   ├── models.py             # All domain models (User, Room, Routine, Booking, Notice, etc.)
│   │   ├── admin.py              # Django admin registration
│   │   ├── views.py              # Legacy portal views
│   │   ├── urls.py               # Booking portal URLs
│   │   ├── api_views.py          # REST: room availability, extra-class requests, occupancy
│   │   ├── admin_booking_views.py # Admin instant booking + exam-conflict override pipeline
│   │   ├── cancellation_views.py  # Class cancellation + mass student notification + FCM push
│   │   ├── notice_views.py       # Notice board CRUD + role-based feeds + FCM urgent push
│   │   ├── firestore_notification_views.py # Firestore notification REST endpoints
│   │   ├── fcm.py                # FCM push helpers (multicast, token pruning, best-effort)
│   │   ├── tests.py              # Booking tests
│   │   ├── migrations/           # 24 Django migrations (0001–0024) owning the schema
│   │   └── management/
│   │       └── commands/
│   │           └── seed_demo.py  # Management command to seed demo accounts & data
│   │
│   ├── issues/                   # Campus Problem issue tracker
│   │   ├── __init__.py
│   │   ├── apps.py               # Django app config
│   │   ├── models.py             # CampusIssue + Issue models
│   │   ├── views.py              # Legacy issue views
│   │   ├── api_views.py          # REST: create, list, delete, admin manage issues
│   │   ├── urls.py               # Issue desk URLs
│   │   ├── admin.py              # Django admin
│   │   ├── tests.py              # Issue tests
│   │   └── migrations/           # Django migrations for issues
│   │
│   ├── api/                      # FastAPI REST layer
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app (issues, rooms, bookings, AI chat endpoints)
│   │   ├── config.py             # Database config (reads .env, SQLite path)
│   │   ├── database.py           # SQLAlchemy engine + session management
│   │   ├── models.py             # SQLAlchemy ORM models (Issue, Room, Routine, RoomBooking)
│   │   └── schemas.py            # Pydantic request/response schemas
│   │
│   ├── admin/                    # Admin portal (server-rendered templates)
│   │   ├── __init__.py
│   │   ├── apps.py               # Django app config
│   │   ├── forms.py              # Admin portal forms
│   │   ├── views.py              # Admin portal views
│   │   ├── urls.py               # Admin portal URLs
│   │   └── templates/            # Django templates for admin portal
│   │
│   ├── faculty/                  # Faculty portal (server-rendered templates)
│   │   ├── __init__.py
│   │   ├── apps.py               # Django app config
│   │   ├── views.py              # Faculty portal views
│   │   ├── urls.py               # Faculty portal URLs
│   │   └── templates/            # Django templates for faculty portal
│   │
│   ├── student/                  # Student portal (server-rendered templates)
│   │   ├── __init__.py
│   │   ├── apps.py               # Django app config
│   │   ├── views.py              # Student portal views
│   │   ├── urls.py               # Student portal URLs
│   │   └── templates/            # Django templates for student portal
│   │
│   ├── templates/                # Shared portal base templates
│   │   ├── portal_base.html      # Base layout for all role portals
│   │   ├── accounts/             # Auth templates (login.html, register.html)
│   │   ├── booking/              # Booking templates
│   │   └── issues/               # Issue desk templates
│   │
│   ├── static/                   # Legacy portal CSS/JS
│   │   ├── style.css             # Global styles
│   │   ├── auth.css              # Auth page styles
│   │   ├── auth.js               # Auth page scripts
│   │   ├── booking.js            # Booking page scripts
│   │   └── app.js                # Global app scripts
│   │
│   ├── media/                    # User-uploaded files (profile pictures, attachments)
│   ├── certs/                    # SSL certificates (local dev)
│   └── __pycache__/              # Python bytecode cache
│
├── frontend/                     # ─── REACT WEB CLIENT ───
│   └── campus-dashboard/         # React 19 SPA (Vite + Tailwind CSS 4)
│       ├── package.json          # NPM dependencies
│       ├── vite.config.js        # Vite config with proxy rules to Django/FastAPI
│       ├── index.html            # HTML entry point
│       ├── .env                  # Frontend environment variables
│       ├── .env.example          # Template for .env
│       ├── .env.local            # Local overrides
│       ├── .gitignore            # Frontend-specific ignores
│       ├── dist/                 # Production build output
│       │   ├── index.html        # Built SPA entry point
│       │   └── assets/           # Built JS/CSS bundles
│       └── src/
│           ├── main.jsx          # React entry point
│           ├── App.jsx           # Root component: routes, auth gates, LoginPage, RegisterPage
│           ├── index.css         # Global CSS + Tailwind imports
│           ├── firebase-messaging-sw.js # FCM service worker for push notifications
│           │
│           ├── pages/            # Page components (20 files)
│           │   ├── Dashboard.jsx             # Admin dashboard analytics
│           │   ├── Users.jsx                 # User directory (admin)
│           │   ├── UserProfile.jsx           # Admin user detail + inline edit + force reset
│           │   ├── Routines.jsx              # Admin routine manager
│           │   ├── RoutineEdit.jsx           # Routine wizard (admin)
│           │   ├── RoutineDownload.jsx       # PDF/DOCX routine export
│           │   ├── RoomBooking.jsx           # Admin room booking + exam override
│           │   ├── Notices.jsx               # Admin notice board management
│           │   ├── Settings.jsx              # User settings (profile edit, password)
│           │   ├── AdminIssueDesk.jsx        # Admin issue management
│           │   ├── FacultyDashboard.jsx      # Faculty dashboard (displaced classes, schedule)
│           │   ├── FacultyRoutines.jsx       # Faculty routine view
│           │   ├── FacultyRoomBooking.jsx    # Faculty room booking requests
│           │   ├── FacultyCancellations.jsx  # Faculty class cancellation tool
│           │   ├── FacultyIssueDesk.jsx      # Faculty issue submission + outbox
│           │   ├── StudentDashboard.jsx      # Student dashboard (cancellation banners)
│           │   ├── StudentCancellations.jsx  # Student cancellation alerts
│           │   ├── MealQuery.jsx             # Hostel meal cancellation requests
│           │   ├── BusNavigate.jsx           # Campus bus tracker (Google Maps)
│           │   └── Placeholder.jsx           # Placeholder for unfinished pages
│           │
│           ├── components/       # Reusable UI components (11 files)
│           │   ├── Sidebar.jsx              # Role-aware navigation sidebar
│           │   ├── Topbar.jsx               # Top bar with breadcrumbs + notification bell
│           │   ├── Avatar.jsx               # User avatar (image or initials fallback)
│           │   ├── Icons.jsx                # SVG icon components
│           │   ├── CancelClassModal.jsx      # Modal for cancelling a class
│           │   ├── CancelClassForm.jsx       # Form fields for cancellation
│           │   ├── CancellationBanner.jsx    # Dashboard banner for displaced classes
│           │   ├── ConfirmDialog.jsx         # Reusable confirmation dialog
│           │   ├── NoticeBoard.jsx           # Notice feed widget (faculty/student)
│           │   ├── WeeklyScheduleGrid.jsx    # Weekly timetable grid component
│           │   └── ChatWidget.jsx            # AI chat widget (Gemini) with voice I/O
│           │
│           ├── lib/              # API helpers & service modules (14 files)
│           │   ├── api.js                   # Base API fetch wrapper (CSRF, credentials)
│           │   ├── firebase.js              # Firebase app initialization
│           │   ├── firebase-auth.js         # Firebase Auth helpers (signIn, signUp, signOut)
│           │   ├── firebase-db.js           # Firestore database helpers
│           │   ├── firebase-storage.js      # Firebase Storage helpers
│           │   ├── firestore-db-api.js      # Client-side Firestore SDK calls (routines, notices, etc.)
│           │   ├── firestore-chat.js        # Firestore real-time chat subscriptions
│           │   ├── firestore-notifications.js # Firestore notification polling
│           │   ├── routines.js              # Routine API calls (admin)
│           │   ├── notices.js               # Notice API calls (admin CRUD)
│           │   ├── cancellations.js         # Cancellation API calls (faculty/student)
│           │   ├── roomBooking.js           # Room booking API calls (availability, requests)
│           │   ├── issues.js                # Issue API calls (create, list, admin manage)
│           │   └── csrf.js                  # CSRF token extraction from cookies
│           │
│           └── context/
│               └── UserContext.jsx          # React context for auth state + user profile
│
├── flutter_app/                  # ─── FLUTTER MOBILE CLIENT ───
│   ├── pubspec.yaml              # Dart dependencies (Flutter SDK, http package)
│   └── lib/
│       ├── main.dart             # Flutter app entry point (MaterialApp, theme, routing)
│       ├── screens/
│       │   ├── login_screen.dart     # Login screen (email, password, "I am a" role dropdown)
│       │   └── register_screen.dart  # Registration screen (role selection, dynamic fields)
│       └── services/
│           └── api_service.dart      # HTTP client for Django REST API (login, register)
│
└── database/                     # ─── SCHEMA REFERENCE ───
    ├── .env                      # Database connection env vars
    ├── README.md                 # Schema documentation + ERD + DDL snapshots
    ├── users/
    │   └── schema.sql            # DDL: booking_user, adminpasskey, registrationrequest
    ├── issues/
    │   └── schema.sql            # DDL: issues_issue
    └── rooms/
        └── schema.sql            # DDL: booking_room, booking_routine, booking_roombooking
```

---

## 6. Coding Methods & Patterns

### Backend (Django + FastAPI)

#### 6.1 Custom User Model (`booking.models.User`)
- Extends `AbstractUser` with campus-specific fields: `role`, `campus_id`, `registration_status`, `department`, `batch`, `section`, `full_name`, `profile_picture`, `fcm_token`, `is_cr`.
- `AUTH_USER_MODEL = 'booking.User'` in settings.
- Display name uses `get_display_name()` which prefers `full_name`, falls back to `first_name + last_name`, then `username` — all in Title Case.

#### 6.2 Role-Based Access Control
- **Server-side enforcement**: Every API endpoint checks `request.user.role` before processing. Students are rejected with `403` for booking operations.
- **Role-matched login**: Both `api_login` (Django JSON API) and the React SPA verify that the submitted `role` matches the stored `user.role`. Mismatches return `{"message": "Please select the correct role"}` with HTTP 400.
- **RoleGate component** (React): `<RoleGate role="admin">` wraps portal routes and redirects non-matching users to their own dashboard.

#### 6.3 Registration Approval Workflow
- Students & faculty register as `pending` + `is_active=False`.
- Admins auto-approve on the spot when a valid admin passkey is supplied.
- Admin portal's Users page provides Approve / Reject / Deactivate / Delete actions.
- A `RegistrationRequest` audit row is created atomically with the account.

#### 6.4 Dual API Surface Pattern
- **Django** (`/api/auth/*`, `/api/profile/*`, `/api/users/*`, `/api/notices/*`, `/api/issues/*`, etc.) handles auth, profiles, and domain-specific admin logic.
- **FastAPI** (`/api/health`, `/api/issues`, `/api/rooms`, `/api/bookings`, `/api/chat/*`) handles REST CRUD and AI chat.
- Both read/write the same SQLite database. FastAPI resolves Django sessions via the `sessionid` cookie.

#### 6.5 Vite Dev Proxy Routing
- `vite.config.js` defines ~20 proxy rules that route `/api/*` requests to either Django (`:8002`) or FastAPI (`:8001`) based on the path prefix.
- Specific prefixes (e.g. `/api/profile`, `/api/users`, `/api/auth`) target Django; the generic `/api` fallback targets FastAPI.

#### 6.6 CORS Middleware (`campus_project.cors.FrontendCorsMiddleware`)
- Custom middleware that allows the configured React origin to call Django with session cookies cross-origin.
- Sets `Access-Control-Allow-Credentials: true` and `SameSite=None` cookies for production.

#### 6.7 Overlap-Driven Occupancy (`booking.api_views._occupancy()`)
- Single function used by faculty availability search, faculty requests, and admin exam-override.
- Checks in priority order: master routine slots (`RoutineSlot`), legacy weekly routines (`Routine`), one-off bookings (`RoomBooking`), and approved/pending extra-class requests (`ExtraClassRequest`).
- Returns a human-readable occupant label or `None` when free.

#### 6.8 Exam Conflict Override Pipeline (`booking.admin_booking_views`)
- When an admin's exam booking clashes with a `RoutineSlot`, the class is automatically overridden.
- A `DisplacedClass` row is created for the affected faculty (matched by name via `_match_faculty()`).
- The faculty dashboard shows a replacement banner with a one-click reschedule flow.
- Rejecting the replacement puts the class back on the faculty's plate.

#### 6.9 Class Cancellation & Mass Notification (`booking.cancellation_views`)
- Faculty cancel a class → `ClassCancellation` row created → URGENT `Notice` auto-published to matching students → FCM push sent to registered devices → Firestore notification written.
- Deleting a cancellation removes the linked notice (CASCADE), so the class vanishes from student views.

#### 6.10 FCM Push System (`booking.fcm.py`)
- Best-effort and non-blocking: pushes run on daemon threads.
- `send_push_notification()` uses Firebase Admin SDK's `MulticastMessage` for batch delivery.
- Dead tokens (UnregisteredError, InvalidArgumentError) are pruned automatically after each send.
- Entire system no-ops gracefully when Firebase is unconfigured.

#### 6.11 Firestore Integration (`campus_project.firestore_*`)
- **`firestore_client.py`**: Lazy-initialized singleton; returns `None` when unconfigured.
- **`firestore_notifications.py`**: Writes notification documents, manages `read_by` arrays, increments/decrements unread badges.
- **`firestore_chat.py`**: Stores chat messages per-user in sub-collections with session metadata.
- **`firestore_cache.py`**: Django cache backend using Firestore documents with TTL-based expiry.
- **`firestore_session.py`**: Django session backend using Firestore documents with lazy expiry cleanup.

#### 6.12 AI Chat Assistant (`api.main.py`)
- Uses Google Gemini via the official `google-genai` SDK with the Interactions API.
- System instruction scopes the assistant to campus-related topics.
- **Voice input**: Base64 WAV → Gemini transcription → text sent through normal chat flow.
- **Voice output**: Text → Gemini TTS model → PCM16 audio → WAV wrapper → base64 response.
- Django proxies `/api/chat/*` to FastAPI so the browser never talks to Gemini directly.

#### 6.13 Issue Desk Pattern (`issues.api_views`)
- Two-tier system: `CampusIssue` (user-facing with categories, attachments, admin responses) and `Issue` (FastAPI legacy tracker).
- Faculty submit via multipart form with optional photo/PDF attachment.
- Admin manages all issues with status updates and response notes.

#### 6.14 Notice Board Visibility Rule
- A notice reaches a user when: `target_role` matches their role AND each optional `department`/`batch`/`section` scope field is empty or equals the user's registered value.
- This same rule is applied in Django ORM queries, Firestore notification resolution, and FCM push targeting.

### Frontend (React)

#### 6.15 Component Architecture
- **Pages** (`pages/`): Full-page components with data fetching, state management, and business logic.
- **Components** (`components/`): Reusable UI pieces (modals, grids, banners, widgets).
- **Context** (`context/`): React Context for auth state (`UserContext.jsx`).
- **Lib** (`lib/`): API helpers organized by domain (routines, notices, cancellations, etc.).

#### 6.16 Authentication Flow (`App.jsx`)
- `UserContext` listens to Firebase Auth state changes and fetches the user profile from Firestore.
- `LoginPage` signs in with Firebase Auth, checks role + approval status from Firestore, then lets `UserContext` handle navigation.
- `RoleGate` component wraps protected routes and redirects unauthorized users.
- `RoleHomeRedirect` sends signed-in users to their role's dashboard.

#### 6.17 Glassmorphic Design System
- Tailwind CSS 4 with custom color tokens: `lime` (#C4F135), `charcoal` (#1A1A2E), `canvas` (#F5F5F0).
- Cards use `backdrop-blur`, `bg-white/80`, `shadow-xl`, `rounded-2xl/3xl`.
- Consistent spacing, typography, and transition patterns across all pages.

### Flutter (Mobile)

#### 6.18 HTTP API Service (`api_service.dart`)
- Centralized `ApiService` class with static methods for `login()` and `register()`.
- Custom `ApiException` class carries `statusCode` and `message` for structured error handling.
- Backend returns `{"message": "Please select the correct role"}` for role mismatches; Flutter displays this in a red `SnackBar`.

#### 6.19 Role-Based Login Screen (`login_screen.dart`)
- "I am a" `DropdownButtonFormField` with Student / Faculty / Admin options.
- Sends `role` in the POST payload; backend validates and rejects mismatches.
- `Forgot password?` link (planned) navigates to password reset flow.

#### 6.20 Dynamic Registration Form (`register_screen.dart`)
- Role selection via button cards (Student / Faculty / Admin).
- Student fields: full name, email, student ID, department, batch, section, password.
- Faculty fields: full name, email, faculty ID, password.
- Admin fields: full name, email, admin security key, password.
- Form fields appear/hide dynamically based on selected role.

---

## 7. Environment Variables

### Backend (`backend/.env`)

| Variable | Default | Description |
|---|---|---|
| `DB_NAME` | `campus_problem` | SQLite database filename |
| `DJANGO_SECRET_KEY` | *(dev fallback)* | **Set a strong value in production** |
| `DJANGO_DEBUG` | `True` | Toggle debug mode |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated allowed hosts |
| `DJANGO_TIME_ZONE` | `Asia/Dhaka` | Server timezone |
| `API_BASE_URL` | `http://127.0.0.1:8001` | FastAPI base URL |
| `ADMIN_PASSKEY` | `CAMPUS-ADMIN-2026` | Legacy passkey for admin registration |
| `FRONTEND_URL` | *(empty)* | React app URL for CORS |
| `FIREBASE_CRED_PATH` | `serviceAccountKey.json` | Firebase service-account JSON |
| `FCM_SERVICE_ACCOUNT_PATH` | *(empty)* | Legacy Firebase credential path |
| `GOOGLE_APPLICATION_CREDENTIALS` | *(empty)* | Firestore credentials path |
| `GEMINI_API_KEY` | *(empty)* | Google Gemini API key for chat assistant |

### Frontend (`frontend/campus-dashboard/.env`)

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | *(empty)* | Backend API base URL (for production builds) |
| `VITE_FIREBASE_API_KEY` | *(empty)* | Firebase Auth/FCM config |
| `VITE_FIREBASE_AUTH_DOMAIN` | *(empty)* | Firebase Auth domain |
| `VITE_FIREBASE_PROJECT_ID` | *(empty)* | Firebase project ID |

### Flutter (`flutter_app/lib/services/api_service.dart`)

| Constant | Default | Description |
|---|---|---|
| `baseUrl` | `http://127.0.0.1:8000` | Django backend URL (edit for deployment) |

---

## 8. Demo Accounts

After running `python manage.py seed_demo`, these accounts exist:

| Account | Password | Role / Status |
|---|---|---|
| `admin` | `admin1234` | Admin (approved) |
| `teacher` | `demo1234` | Faculty (approved) |
| `student` | `demo1234` | Student (approved) |
| `pending_student` | `demo1234` | Student (pending — for the admin approval panel) |
| `pending_teacher` | `demo1234` | Faculty (pending) |

Admin registration passkeys `add001`–`add010` are seeded into the `booking_adminpasskey` table.

---

## 9. REST API Reference

### Django (`http://127.0.0.1:8002`)

#### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/login/` | JSON login (email, password, role) — returns profile on success, role mismatch → 400 `{"message": "Please select the correct role"}` |
| `POST` | `/api/auth/register/` | JSON registration (full_name, email, password, role, campus_id, etc.) |
| `POST` | `/api/auth/logout/` | Clear session |

#### Profile & Users
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/profile/` | Signed-in user's profile |
| `PUT/PATCH` | `/api/profile/` | Update profile (multipart: full_name, email, picture) |
| `DELETE` | `/api/profile/picture/` | Remove profile picture |
| `POST` | `/api/profile/fcm-token/` | Register FCM device token |
| `GET` | `/api/users/` | User directory (admin only) |
| `GET` | `/api/users/<id>/` | User detail (admin) |
| `PATCH` | `/api/users/<id>/` | Edit user (admin) |
| `POST` | `/api/users/<id>/approve/` | Approve user |
| `POST` | `/api/users/<id>/deactivate/` | Deactivate user |
| `DELETE` | `/api/users/<id>/delete/` | Delete user |
| `POST` | `/api/users/<id>/role/` | Change user role |
| `POST` | `/api/users/<id>/force-reset/` | Generate password reset link |

#### Routines
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/routines/?department=&batch=&section=` | Get routine slots |
| `PUT` | `/api/routines/` | Save routine (admin) |
| `GET` | `/api/routines/my-schedule/` | Faculty's personal schedule |
| `GET` | `/api/routines/department/?dept=&batch=&section=` | Department routine |

#### Notices
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/api/notices/` | List (admin) / Create (admin) |
| `GET` | `/api/notices/faculty/` | Faculty notice feed |
| `GET` | `/api/notices/student/` | Student notice feed |
| `PATCH/DELETE` | `/api/notices/<id>/` | Edit / Delete (admin) |

#### Room Booking
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/room-booking/availability/?day=&start=&end=` | Free rooms |
| `GET/POST` | `/api/room-booking/requests/` | List / Create extra-class requests |
| `PATCH` | `/api/room-booking/requests/<id>/` | Cancel / approve / reject / trash / restore |
| `GET` | `/api/room-booking/rooms/` | All bookable rooms |
| `POST` | `/api/admin/room-booking/create/` | Admin instant booking + exam override |
| `GET` | `/api/room-booking/displaced/` | Displaced classes |

#### Cancellations
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/teacher/cancel-class/` | Cancel a class (faculty) |
| `GET` | `/api/teacher/cancellations/` | Faculty cancellation history |
| `DELETE` | `/api/teacher/cancellations/<id>/` | Restore a cancelled class |
| `GET` | `/api/student/cancellations/` | Student active cancellations |

#### Issues
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/issues/create/` | Submit issue (multipart) |
| `GET` | `/api/issues/my-issues/` | User's own issues |
| `DELETE` | `/api/issues/<id>/` | Delete own issue |
| `GET` | `/api/admin/issues/` | All issues (admin, with filters) |
| `PATCH` | `/api/admin/issues/<id>/` | Update status / response (admin) |

#### Meal Query
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/meal-query/` | List meal cancellations |
| `POST` | `/api/meal-query/create/` | Create meal cancellation |
| `DELETE` | `/api/meal-query/<id>/` | Delete meal cancellation |

#### Class Rep (CR) Management
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/cr/` | List CRs |
| `POST` | `/api/cr/assign/` | Assign CR status |
| `POST` | `/api/cr/revoke/` | Revoke CR status |
| `GET` | `/api/cr/students/` | Students for CR picker |

#### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/notifications/` | User's notifications |
| `GET` | `/api/notifications/unread-count/` | Unread badge count |
| `POST` | `/api/notifications/<id>/read/` | Mark as read |
| `POST` | `/api/notifications/read-all/` | Mark all as read |

#### Push & Chat
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/push/subscribe/` | Register FCM token |
| `POST` | `/api/push/unsubscribe/` | Remove FCM token |
| `POST` | `/api/chat` | AI chat (proxied to FastAPI) |
| `POST` | `/api/chat/transcribe` | Voice input transcription |
| `POST` | `/api/chat/speak` | Text-to-speech output |

### FastAPI (`http://127.0.0.1:8001`)

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check (service + DB) |
| `GET` | `/api/issues` | List all issues |
| `POST` | `/api/issues` | Create an issue (JSON or form data) |
| `PATCH` | `/api/issues/{id}` | Update issue status |
| `GET` | `/api/summary` | Issue counts by status |
| `GET` | `/api/rooms` | List all rooms |
| `GET` | `/api/rooms/free?date&start&end` | Rooms free in a time window |
| `GET` | `/api/bookings?date=` | List bookings (incl. weekly routines) |
| `POST` | `/api/bookings` | Create a booking (401 unauthenticated, 403 students, 409 on conflict) |
| `POST` | `/api/chat` | AI chat (Gemini Interactions API) |
| `POST` | `/api/chat/transcribe` | Voice transcription (Gemini) |
| `POST` | `/api/chat/speak` | Text-to-speech (Gemini TTS) |

---

## 10. Push Notifications (FCM)

Web Push is **opt-in infrastructure that fails safe** — without Firebase configured the app runs exactly as normal.

### Setup

1. Drop your Firebase service-account JSON at `backend/serviceAccountKey.json` (or point `FIREBASE_CRED_PATH`).
2. `settings.py` initializes the Firebase Admin SDK on boot when the credential file is present.
3. The web client registers its FCM token via `POST /api/profile/fcm-token/` or `POST /api/push/subscribe/`.

### What triggers a push

- **Class cancelled** — `push_class_cancellation()` sends pushes to every matched student's device.
- **Urgent notice published** — `push_urgent_notice()` pushes to the exact matching audience.

Both dispatch on a background thread, and dead tokens are pruned automatically.

---

## 11. Firestore Real-Time Features

### Notification Feed
- `create_notification()` writes to `notifications` collection with `target_users` array.
- `get_user_notifications()` queries `target_users` array-contains the user's UID.
- Unread counts stored in `user_notifications/{uid}` documents, incremented/decremented atomically.

### Chat Sessions
- Messages stored in `chat_sessions/{uid}/messages/{auto-id}` sub-collection.
- Session metadata tracks `message_count`, `created_at`, `updated_at`.
- Frontend can `onSnapshot()` the sub-collection for real-time streaming.

### Django Cache Backend
- `FirestoreCache` stores pickled values with TTL-based expiry.
- Lazy deletion on read + optional daily sweep.

### Django Session Backend
- `SessionStore` stores base64-encoded session data with expiry.
- Lazy cleanup of expired sessions on read.

---

## 12. Flutter Mobile Client

### Structure
```
flutter_app/
├── pubspec.yaml                 # Dependencies: flutter, http
└── lib/
    ├── main.dart                # App entry, theme, routing
    ├── screens/
    │   ├── login_screen.dart    # Login with "I am a" role dropdown
    │   └── register_screen.dart # Registration with role-based dynamic fields
    └── services/
        └── api_service.dart     # HTTP client for Django REST API
```

### Key Features
- **Role-matched login**: Sends `role` in POST body; backend returns `{"message": "Please select the correct role"}` (400) on mismatch.
- **Dynamic registration**: Role selection buttons show/hide fields (Student ID, Faculty ID, Admin Key, Department/Batch/Section).
- **Error handling**: `ApiException` class with `statusCode` + `message`; displayed via `SnackBar`.

### To Run
```bash
cd flutter_app
flutter pub get
flutter run
```

---

## 13. Deployment

### Render.com (Blueprint)
- `render.yaml` defines two services:
  - **Backend**: Python web service running `gunicorn` on port `$PORT`.
  - **Frontend**: Static site built from `frontend/campus-dashboard/dist`.
- Environment variables configured via Render dashboard.

### Firebase Hosting
- `firebase.json` configures hosting for `frontend/campus-dashboard/dist`.
- SPA rewrites: all routes fall back to `/index.html`.
- Static assets cached with `Cache-Control: public, max-age=31536000, immutable`.

### PythonAnywhere
- `backend/pythonanywhere_wsgi.py` — WSGI entry point configured for PythonAnywhere.
- Database: SQLite3 (local file on PythonAnywhere).
- Environment variables set via the Web tab.

### Production Checklist
1. Set `DJANGO_DEBUG=False` and a strong `DJANGO_SECRET_KEY`.
2. Configure `ALLOWED_HOSTS` for your domain.
3. Set up Firebase credentials for FCM + Firestore.
4. Set `GEMINI_API_KEY` for the AI chat assistant.
5. Run `python manage.py collectstatic` for static files.
6. Serve `MEDIA_ROOT` via nginx or your web server.

---

## 14. Production Notes

- **Security:** set a real `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, and an explicit `ALLOWED_HOSTS` list; serve over HTTPS.
- **Static & media:** collect static files (`python manage.py collectstatic`) and serve `MEDIA_ROOT` via your web server or object storage.
- **Database:** SQLite3 for development; migrate to MySQL/PostgreSQL for production by changing `DATABASES` in settings.
- **Processes:** run Django (WSGI) and FastAPI (Uvicorn) behind a reverse proxy; the frontend proxies `/api/*` to the appropriate service.
- **Firestore:** optional but recommended for real-time notifications, chat, cache, and sessions. Falls back gracefully when unconfigured.
- **FCM:** optional; the app works without push notifications. Set up Firebase credentials to enable them.
- **Gemini AI:** optional; the chat widget shows a "not configured" message when `GEMINI_API_KEY` is missing.

---

## Contributing

1. Fork the repository and create a feature branch.
2. Follow the existing conventions — role logic lives in the role section apps, domain logic in `backend/booking/`, REST endpoints in `backend/api/`, and Flutter screens in `flutter_app/lib/`.
3. Run the Django test suite before opening a pull request:

```bash
python manage.py test
```

---

## License

Private / institutional use. See the repository owner for licensing details.
