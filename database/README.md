# Database section

Everything that describes the MySQL database behind the campus platform. The
schema is organized into **three clean sections** — one subfolder per domain —
so each area of the platform keeps its own schema file.

## Structure

```
database/
├── users/    schema.sql   — accounts & authentication (users, passkeys, auth)
├── issues/   schema.sql   — campus problem tracker (issue reports)
├── rooms/    schema.sql   — room booking (rooms, routines, bookings)
└── README.md              — this guide
```

| Section | File | Tables |
| ------- | ---- | ------ |
| Users | `users/schema.sql` | `booking_user`, `booking_user_groups`, `booking_user_user_permissions`, `booking_adminpasskey`, `booking_registrationrequest`, `auth_group`, `auth_group_permissions`, `auth_permission`, `django_content_type`, `django_admin_log`, `django_session`, `django_migrations` |
| Issues | `issues/schema.sql` | `issues_issue` |
| Rooms | `rooms/schema.sql` | `booking_room`, `booking_routine`, `booking_roombooking` |

Each file is a full DDL snapshot for its section (structure only, no data),
generated with `mysqldump --no-data`.

## How the schema is owned

The schema is **owned by Django migrations** — the single source of truth:

- `backend/booking/migrations/` — `booking_user` (custom auth user), `booking_room`,
  `booking_routine`, `booking_roombooking`, `booking_adminpasskey`,
  `booking_registrationrequest`
- `backend/issues/migrations/` — `issues_issue`
- Django built-ins: `auth_*`, `django_*` (sessions, admin log, content types)

Apply/upgrade with: `cd backend && py manage.py migrate`
The FastAPI layer (`backend/api/`) maps the same tables with SQLAlchemy and
never creates or alters tables. The `schema.sql` files are generated snapshots
— to refresh them after any migration, re-dump each section:

```powershell
# Users (accounts & auth)
mysqldump -u root --no-data --skip-comments campus_problem booking_user booking_user_groups booking_user_user_permissions booking_adminpasskey booking_registrationrequest auth_group auth_group_permissions auth_permission django_content_type django_admin_log django_session django_migrations > database/users/schema.sql

# Issues (campus problem tracker)
mysqldump -u root --no-data --skip-comments campus_problem issues_issue > database/issues/schema.sql

# Rooms (room booking)
mysqldump -u root --no-data --skip-comments campus_problem booking_room booking_routine booking_roombooking > database/rooms/schema.sql
```

> To apply a whole section to a fresh database: `mysql -u root campus_problem < database/users/schema.sql`
>
> **Load order:** apply `users/` first, then `issues/` and `rooms/`. The
> `rooms/` tables reference `booking_user` (from `users/`), and the auth
> tables reference `django_content_type` (also in `users/`). Loading any
> single file works standalone thanks to `FOREIGN_KEY_CHECKS=0` in the file
> headers, but following this order keeps foreign keys fully valid.

## Section: Users — accounts & authentication

The custom auth user (`AUTH_USER_MODEL = booking.User`), extending Django's
`AbstractUser`. Key fields:

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | INT (PK) | |
| `username` | VARCHAR(150) | login identifier (set to the registration email) |
| `email` | VARCHAR(254) | |
| `first_name` / `last_name` | VARCHAR(150) | full name stored in `first_name` |
| `password` | VARCHAR(128) | hashed (PBKDF2 by default) |
| `role` | VARCHAR(20) | `student` \| `teacher` (Faculty) \| `admin` |
| `campus_id` | VARCHAR(30) UNIQUE | university/campus ID, required at registration |
| `registration_status` | VARCHAR(20) | `pending` \| `approved` \| `rejected` |
| `is_active` | BOOL | login gate — `False` while pending/rejected |
| `is_staff` / `is_superuser` | BOOL | staff/superuser flags (admins) |
| `department` / `section` / `batch` | VARCHAR | optional profile fields |
| `phone_number` | VARCHAR(15) | optional |
| `date_joined` | DATETIME | registration time (approval panel sorts by it) |

Approval rule: students & faculty are created `pending` + `is_active=0`; an
admin sets `approved` + `is_active=1` (or `rejected` + `is_active=0`). Admin
self-registration is auto-approved on the spot when a valid admin passkey is
supplied (see `booking_adminpasskey` below).

### `booking_adminpasskey` — admin registration passkeys

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | INT (PK) | |
| `code` | VARCHAR(60) UNIQUE | the passkey (seeded with `add001` … `add010`) |
| `is_active` | BOOL | `1` = accepted at admin registration, `0` = revoked |
| `created_at` | DATETIME | |

Any active key here unlocks auto-approved admin registration; the legacy
`ADMIN_PASSKEY` in `.env` also works, but only when explicitly set (never the
built-in default). Keys can be added/revoked from Django admin — deactivating
`is_active` immediately blocks that key.

### `booking_registrationrequest` — registration audit trail

One row per public self-registration, kept **separate** from the login account
(`booking_user`): the account gates access, this table records who applied,
when, and the approval outcome.

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | INT (PK) | |
| `full_name` | VARCHAR(100) | name given at registration |
| `email` | VARCHAR(254) | applicant's email |
| `campus_id` | VARCHAR(30) | campus ID given at registration |
| `role` | VARCHAR(20) | `student` \| `teacher` (Faculty) \| `admin` |
| `status` | VARCHAR(20) | `pending` \| `approved` \| `rejected` (mirrors the account) |
| `applied_at` | DATETIME | when the request was submitted |
| `user_id` | INT (FK → `booking_user`) | the account created by this registration |

A row is created atomically with the account on every registration
(`accounts/views.py`): students/faculty start `pending`, admins are `approved`
on the spot. Approving or rejecting from the admin portal (`admin/views.py`)
updates `status` to match the account's `registration_status`.

## Section: Issues — campus problem tracker

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | INT (PK) | |
| `title`, `location` | VARCHAR(80) | |
| `category` | VARCHAR(20) | Facilities / Technology / Campus life / Transport / Safety |
| `status` | VARCHAR(20) | Open / In progress / Resolved |
| `priority` | VARCHAR(20) | Low / Medium / High |
| `reporter` | VARCHAR(60) | reporter display name |
| `description` | TEXT | |
| `created_at` / `updated_at` | DATETIME | |

## Section: Rooms — room booking

### `booking_room` — bookable classrooms

`id`, `room_number` (unique), `building`, `capacity`.

### `booking_routine` — recurring weekly classes

`id`, `teacher` (FK → `booking_user`), `subject`, `department`, `section`,
`room` (FK → `booking_room`), `day` (MON–SUN), `start_time`, `end_time`.

### `booking_roombooking` — one-off room locks

`id`, `room` (FK), `booked_by` (FK → `booking_user`), `booking_type`
(extra_class / reschedule / exam), `department`, `batch_section`, `date`,
`start_time`, `end_time`, `created_at`.

## Relationships (ERD)

```
booking_user 1───* booking_routine : teacher (teaches weekly classes)
booking_user 1───* booking_roombooking : booked_by (locks rooms)
booking_room 1───* booking_routine : room
booking_room 1───* booking_roombooking : room
```
