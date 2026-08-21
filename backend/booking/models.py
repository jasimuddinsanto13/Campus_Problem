from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """NITER-Pulse user with a campus role and registration approval state."""

    class Role(models.TextChoices):
        STUDENT = 'student', 'Student'
        TEACHER = 'teacher', 'Faculty'
        ADMIN = 'admin', 'Admin'

    class RegistrationStatus(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.STUDENT)
    # Email doubles as the login identifier (register/login keep username in
    # sync) — enforced unique at the DB level by migration 0008.
    email = models.EmailField(blank=True, unique=True)
    campus_id = models.CharField(max_length=30, unique=True, null=True, blank=True)
    # Defaults to 'approved' so existing/manually created accounts stay usable;
    # the registration flow explicitly creates students/faculty as 'pending'.
    registration_status = models.CharField(
        max_length=20,
        choices=RegistrationStatus.choices,
        default=RegistrationStatus.APPROVED,
    )
    department = models.CharField(max_length=50, blank=True)
    section = models.CharField(max_length=10, blank=True)
    batch = models.CharField(max_length=20, blank=True)
    phone_number = models.CharField(max_length=15, blank=True)
    # Display name shown in the dashboard sidebar/header (kept in sync with
    # first_name/last_name so the REST API and the legacy teacher lookup agree).
    full_name = models.CharField(max_length=100, blank=True)
    # Profile picture uploaded from the Settings page (stored under MEDIA_ROOT).
    profile_picture = models.ImageField(
        upload_to='profile_pics/',
        blank=True,
        null=True,
    )
    # Primary FCM push token for this account's most recent device. The
    # authoritative multi-device store is DeviceToken (which push dispatch
    # actually reads); this convenience field mirrors the latest registered
    # token so the profile API can expose / update it directly.
    fcm_token = models.TextField(blank=True, null=True)
    # Class Representative flag — granted by admins to students who act as
    # the official liaison for their department / batch / section. CRs are
    # still regular students (same dashboard, same permissions) but the
    # flag surfaces a badge in the directory and can gate future features
    # (e.g. priority notice posting, batch-wide announcements).
    is_cr = models.BooleanField(default=False)

    class Meta:
        verbose_name = 'user'
        verbose_name_plural = 'users'

    def __str__(self):
        return f'{self.username} ({self.get_role_display()})'

    @property
    def is_pending(self):
        return self.registration_status == self.RegistrationStatus.PENDING

    def get_display_name(self):
        """Display name in clean Title Case ('Santo Jasim').

        Prefers the stored ``full_name``, then first + last, falling back to
        the username. Formatting is applied at display time only — the stored
        values are never rewritten.
        """
        name = (
            self.full_name.strip()
            or ' '.join(filter(None, [self.first_name, self.last_name])).strip()
        )
        return name.title() if name else self.username



class RegistrationRequest(models.Model):
    """An audit record of every public self-registration on the platform.

    Kept separate from the login account (``booking_user``): the account
    gates access, while this table tracks who applied, when, and the approval
    outcome (pending / approved / rejected).
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='registration_request',
        help_text='The account created by this registration (if any).',
    )
    full_name = models.CharField(max_length=100)
    email = models.EmailField()
    campus_id = models.CharField(max_length=30, blank=True)
    role = models.CharField(max_length=20, choices=User.Role.choices, default=User.Role.STUDENT)
    status = models.CharField(
        max_length=20,
        choices=User.RegistrationStatus.choices,
        default=User.RegistrationStatus.PENDING,
    )
    applied_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-applied_at']
        verbose_name = 'registration request'
        verbose_name_plural = 'registration requests'

    def __str__(self):
        return f'{self.full_name} <{self.email}> — {self.get_role_display()}'


class AdminPasskey(models.Model):
    """A secret key that grants instant, auto-approved Admin registration.

    Any active passkey stored here (plus the legacy ``settings.ADMIN_PASSKEY``
    value) is accepted when someone registers an Admin account.
    """

    code = models.CharField(max_length=60, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['code']
        verbose_name = 'admin passkey'
        verbose_name_plural = 'admin passkeys'

    def __str__(self):
        return self.code



class Room(models.Model):
    """A bookable classroom on campus."""

    room_number = models.CharField(max_length=20, unique=True)
    building = models.CharField(max_length=100, default='Academic Building')
    capacity = models.PositiveIntegerField(default=60)

    class Meta:
        ordering = ['building', 'room_number']

    def __str__(self):
        return f'{self.building} · {self.room_number}'


class RoutineSlot(models.Model):
    """A free-text weekly class row in the admin routine manager.

    Keyed by department + batch and kept separate from ``Routine`` (which
    drives the FastAPI room-occupancy pipeline and requires teacher/room
    foreign keys) so the admin wizard can store subject / faculty / room as
    plain text without touching the booking engine.
    """

    class Day(models.TextChoices):
        SUN = 'SUN', 'Sunday'
        MON = 'MON', 'Monday'
        TUE = 'TUE', 'Tuesday'
        WED = 'WED', 'Wednesday'
        THU = 'THU', 'Thursday'
        SAT = 'SAT', 'Saturday'

    department = models.CharField(max_length=10)  # CSE, EEE, TE, IPE, FDAE
    batch = models.CharField(max_length=10)  # '0'..'16'
    section = models.CharField(max_length=10, default='A')  # A, B, C…
    day = models.CharField(max_length=3, choices=Day.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()
    subject = models.CharField(max_length=100)
    faculty = models.CharField(max_length=100, blank=True)
    room = models.CharField(max_length=20, blank=True)

    class Meta:
        ordering = ['day', 'start_time']
        verbose_name_plural = 'Routine slots'

    def __str__(self):
        return f'{self.department} {self.batch}({self.section}) · {self.subject} · {self.get_day_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class Routine(models.Model):
    """A recurring weekly class that occupies a room."""

    class Day(models.TextChoices):
        MON = 'MON', 'Monday'
        TUE = 'TUE', 'Tuesday'
        WED = 'WED', 'Wednesday'
        THU = 'THU', 'Thursday'
        FRI = 'FRI', 'Friday'
        SAT = 'SAT', 'Saturday'
        SUN = 'SUN', 'Sunday'

    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='routines')
    subject = models.CharField(max_length=100)
    department = models.CharField(max_length=50)
    batch = models.CharField(max_length=20, blank=True)
    section = models.CharField(max_length=10)
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='routines')
    day = models.CharField(max_length=3, choices=Day.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['day', 'start_time']
        verbose_name_plural = 'Routines'

    def __str__(self):
        return f'{self.subject} · {self.room} · {self.get_day_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class RoomBooking(models.Model):
    """A one-off booking that locks a room for a time window."""

    class BookingType(models.TextChoices):
        EXTRA_CLASS = 'extra_class', 'Extra Class'
        RESCHEDULE = 'reschedule', 'Rescheduled Class'
        EXAM = 'exam', 'Examination'

    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='bookings')
    booked_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='bookings')
    booking_type = models.CharField(max_length=20, choices=BookingType.choices)
    department = models.CharField(max_length=50, blank=True)
    batch_section = models.CharField(max_length=50, blank=True)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['date', 'start_time']
        verbose_name_plural = 'Room bookings'

    def __str__(self):
        return f'{self.room} · {self.date} {self.start_time:%H:%M}-{self.end_time:%H:%M}'


class ExtraClassRequest(models.Model):
    """A faculty request for an extra / makeup / rescheduled class in a room.

    Faculty submit these from the React Room booking page; an admin reviews
    them from the admin portal and approves or rejects the request. Approved
    requests count as occupancy in the availability search, so a second
    faculty member can never double-book the same window.
    """

    class Reason(models.TextChoices):
        MAKEUP = 'makeup', 'Makeup Class'
        EXTRA = 'extra', 'Extra Class'
        EXAM = 'exam', 'Exam Reschedule'
        EVENT = 'event', 'Special Event'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Admin Approval'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'
        CANCELLED = 'cancelled', 'Cancelled'

    faculty = models.ForeignKey(User, on_delete=models.CASCADE, related_name='extra_class_requests')
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='extra_class_requests')
    # Target class the extra slot belongs to (e.g. CSE / batch 10 / section A).
    department = models.CharField(max_length=10)
    batch = models.CharField(max_length=10)
    section = models.CharField(max_length=10, default='A')
    subject = models.CharField(max_length=100)
    reason = models.CharField(max_length=20, choices=Reason.choices, default=Reason.EXTRA)
    # The weekday the slot falls on (matches the routine grid), plus the
    # concrete date so the booking shows up on a calendar.
    day = models.CharField(max_length=3, choices=RoutineSlot.Day.choices)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    # Optional note attached by the requester or the admin (admin bookings).
    notes = models.TextField(blank=True)
    # True when an admin booked this slot over a scheduled regular class
    # (exam override) — shown as an "Exam Override" tag in the admin table.
    is_override = models.BooleanField(default=False)
    # When set, the request sits in the admin portal's trash (hidden from the
    # live lists) and can be restored or permanently deleted.
    trashed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Extra class requests'

    def __str__(self):
        return f'{self.room} · {self.get_day_display()} {self.start_time:%H:%M}-{self.end_time:%H:%M} · {self.subject} ({self.get_status_display()})'


class DisplacedClass(models.Model):
    """A regular class pushed out by an admin's exam / event booking.

    Created automatically when an admin books over a scheduled RoutineSlot:
    the affected faculty sees a dashboard banner with a link straight into
    the room-booking flow pre-filtered to the displaced window. Once the
    faculty submits a replacement booking, the row flips to ``rescheduled``
    and the students of that batch/section are notified via a Notice.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Reschedule'
        RESCHEDULED = 'rescheduled', 'Rescheduled'

    faculty = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='displaced_classes',
        help_text='The teacher whose regular class was pushed out (matched by name).',
    )
    slot = models.ForeignKey(
        RoutineSlot,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='displacements',
        help_text='The master-routine slot that was overridden.',
    )
    subject = models.CharField(max_length=100)
    department = models.CharField(max_length=10)
    batch = models.CharField(max_length=10, blank=True)
    section = models.CharField(max_length=10, default='A')
    # The room the class originally ran in (now locked by the override).
    room = models.ForeignKey(Room, on_delete=models.CASCADE, related_name='displacements')
    day = models.CharField(max_length=3, choices=RoutineSlot.Day.choices)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    # The replacement booking the faculty submitted for the displaced window.
    request = models.ForeignKey(
        ExtraClassRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='displacements',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Displaced classes'

    def __str__(self):
        return (
            f'{self.subject} · {self.room} · {self.get_day_display()} '
            f'{self.start_time:%H:%M}-{self.end_time:%H:%M} ({self.get_status_display()})'
        )


class ClassCancellation(models.Model):
    """A class cancelled by a faculty member, with the students auto-notified.

    Faculty cancel a specific course for one department / batch / section on
    a concrete date and time window. Cancelling also publishes a high-priority
    (URGENT) Notice scoped to exactly the matching students, and the student
    dashboard renders a banner + routine-grid marking from these rows.
    """

    class Reason(models.TextChoices):
        FACULTY_UNAVAILABLE = 'faculty_unavailable', 'Faculty Unavailable'
        EMERGENCY = 'emergency', 'Emergency'
        OFFICIAL_MEETING = 'official_meeting', 'Official Department Meeting'
        RESCHEDULED = 'rescheduled', 'Rescheduled to another slot'
        OTHER = 'other', 'Other'

    faculty = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='class_cancellations',
        help_text='The teacher who cancelled the class.',
    )
    department = models.CharField(max_length=10)  # CSE, EEE, TE, IPE, FDAE
    batch = models.CharField(max_length=10)  # '0'..'16'
    section = models.CharField(max_length=10)  # A, B, C…
    # Course name / code, e.g. "CSE-2101 Data Structures".
    course_code = models.CharField(max_length=200)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    reason = models.CharField(
        max_length=30, choices=Reason.choices, default=Reason.FACULTY_UNAVAILABLE
    )
    # Optional free-text detail (shown when reason is 'Other').
    reason_note = models.TextField(blank=True)
    # The URGENT notice auto-published to the matched students — deleting the
    # cancellation ("restore class") removes the notice too.
    notice = models.OneToOneField(
        'Notice',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='cancellation',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'class cancellation'
        verbose_name_plural = 'class cancellations'

    def __str__(self):
        return (
            f'{self.course_code} · {self.department} Batch {self.batch} Sec {self.section} · '
            f'{self.date} {self.start_time:%H:%M}-{self.end_time:%H:%M}'
        )


class DeviceToken(models.Model):
    """An FCM push-subscription token for a signed-in user's device/browser.

    The web app registers its Firebase Messaging token here (POST
    /api/push/subscribe/); when a class is cancelled, pushes are sent to the
    tokens of the matched students. Tokens are per user — a user on several
    devices keeps one row per token.
    """

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='device_tokens',
    )
    token = models.CharField(max_length=255, unique=True)
    platform = models.CharField(max_length=20, default='web')  # web / android / ios
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = 'device token'
        verbose_name_plural = 'device tokens'

    def __str__(self):
        return f'{self.user} ({self.platform})'


class Notice(models.Model):
    """An announcement posted by an admin and targeted at roles / departments.

    The React admin portal (Notices page) creates, edits, pins and deletes
    these; the Faculty and Student dashboards render widgets that fetch only
    the notices relevant to the signed-in role (and department).
    """

    class Priority(models.TextChoices):
        NORMAL = 'normal', 'Normal'
        IMPORTANT = 'important', 'Important'
        URGENT = 'urgent', 'Urgent'

    class TargetRole(models.TextChoices):
        ALL = 'all', 'All Users'
        FACULTY = 'faculty', 'Faculty Only'
        STUDENT = 'student', 'Students Only'

    title = models.CharField(max_length=200)
    content = models.TextField()
    priority = models.CharField(
        max_length=20, choices=Priority.choices, default=Priority.NORMAL
    )
    target_role = models.CharField(
        max_length=20, choices=TargetRole.choices, default=TargetRole.ALL
    )
    # Optional narrowing: when set, only users from this department see it.
    department = models.CharField(max_length=10, blank=True)
    # Optional batch (0-16) / section (A-D) narrowing — a notice posted for
    # "CSE · Batch 10 · Sec A" only reaches students matching all three.
    batch = models.CharField(max_length=10, blank=True)
    section = models.CharField(max_length=10, blank=True)
    # Optional PDF / image attachment uploaded from the admin Notices page.
    attachment = models.FileField(
        upload_to='notice_attachments/', blank=True, null=True
    )
    pinned = models.BooleanField(default=False)
    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notices_created',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-pinned', '-created_at']
        verbose_name_plural = 'Notices'

    def __str__(self):
        audience = self.get_target_role_display()
        scope = ' · '.join(filter(None, [self.department, f'Batch {self.batch}', f'Sec {self.section}']))
        if scope:
            audience += f' ({scope})'
        return f'{self.title} — {audience} ({self.get_priority_display()})'



class MealCancellation(models.Model):
    """A student request to cancel a hostel meal for a specific date.

    Students submit these from the Meal Query page; the Meal Manager
    (another student with manager privileges) reviews them from a
    separate dashboard.
    """

    class MealType(models.TextChoices):
        LUNCH = 'lunch', 'Lunch'
        DINNER = 'dinner', 'Dinner'
        BOTH = 'both', 'Both'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='meal_cancellations',
    )
    student_name = models.CharField(max_length=100)
    campus_student_id = models.CharField(max_length=30, blank=True)
    department = models.CharField(max_length=50, blank=True)
    section = models.CharField(max_length=10, blank=True)
    date = models.DateField()
    meal_type = models.CharField(
        max_length=10, choices=MealType.choices, default=MealType.LUNCH
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = 'meal cancellation'
        verbose_name_plural = 'meal cancellations'

    def __str__(self):
        return (
            f'{self.student_name} · {self.get_meal_type_display()} · '
            f'{self.date} ({self.get_status_display()})'
        )