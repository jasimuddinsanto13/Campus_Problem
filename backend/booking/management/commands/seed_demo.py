"""Seed the database with demo data for both apps.

Usage:  py manage.py seed_demo
"""

from datetime import date, time, timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.utils import timezone

from booking.models import ExtraClassRequest, Notice, Room, RoomBooking, Routine, RoutineSlot
from issues.models import Issue

User = get_user_model()

# The faculty availability search offers exactly two buildings, so every
# demo room lives under one of them.
ROOMS = [
    ('302', 'Academic Building 1', 60),
    ('204', 'Academic Building 1', 45),
    ('105', 'Academic Building 1', 30),
    ('410', 'Academic Building 1', 80),
    ('215', 'Academic Building 2', 50),
    ('118', 'Academic Building 2', 35),
    ('B-07', 'Academic Building 2', 40),
    ('B-12', 'Academic Building 2', 55),
    ('L-03', 'Academic Building 2', 25),
]

ROUTINES = [
    # (teacher, subject, department, section, room, day, start, end)
    ('teacher', 'Data Structures', 'CSE', '2A', '302', 'MON', time(9, 0), time(10, 30)),
    ('teacher', 'Data Structures', 'CSE', '2A', '302', 'WED', time(9, 0), time(10, 30)),
    ('teacher', 'Software Engineering', 'CSE', '3B', '204', 'TUE', time(11, 30), time(13, 0)),
    ('teacher', 'Software Engineering', 'CSE', '3B', '204', 'THU', time(11, 30), time(13, 0)),
    ('teacher', 'Linear Algebra', 'MATH', '1C', '105', 'MON', time(14, 0), time(15, 30)),
    ('teacher', 'Computer Networks', 'CSE', '4A', '410', 'FRI', time(9, 0), time(11, 0)),
    ('teacher', 'Physics Lab', 'PHY', '2B', '215', 'WED', time(13, 0), time(15, 0)),
]

# Published master routines across all departments (RoutineSlot rows the admin
# wizard writes). These make the faculty availability search show real
# occupancy: each row locks its room for a weekly day + time window.
ROUTINE_SLOTS = [
    # (department, batch, section, room, day, start, end, subject, faculty)
    ('CSE', '10', 'A', '302', 'SUN', time(9, 0), time(10, 0), 'Data Structures', 'Ayesha Rahman'),
    ('EEE', '11', 'A', '204', 'SUN', time(9, 0), time(10, 0), 'Circuit Theory', 'Prof. M. Karim'),
    ('TE', '12', 'A', 'B-07', 'SUN', time(10, 0), time(11, 0), 'Fabric Science', 'Dr. S. Nahar'),
    ('IPE', '12', 'B', '215', 'MON', time(11, 0), time(12, 0), 'Thermodynamics', 'Dr. A. Chowdhury'),
    ('FDAE', '9', 'A', 'B-12', 'TUE', time(9, 0), time(10, 0), 'Pattern Making', 'Ms. F. Aktar'),
    ('EEE', '11', 'A', '105', 'WED', time(9, 0), time(10, 0), 'Digital Logic Design', 'Prof. M. Karim'),
    ('TE', '12', 'B', '410', 'THU', time(9, 0), time(10, 0), 'Yarn Manufacturing', 'Dr. S. Nahar'),
    ('IPE', '12', 'A', 'L-03', 'SAT', time(9, 0), time(10, 0), 'Fluid Mechanics', 'Dr. A. Chowdhury'),
    ('FDAE', '9', 'A', '118', 'SAT', time(10, 0), time(11, 0), 'Garment Construction', 'Ms. F. Aktar'),
]

ISSUES = [
    # (title, location, category, status, priority, reporter, description, minutes_ago)
    ('Water fountain needs repair', 'North Quad, Level 1', 'Facilities', 'In progress', 'Medium', 'Maya R.',
     'The fountain near the study lounge is leaking from the base.', 12),
    ('Wi-Fi drops in design studio', 'Arts Building, Room 204', 'Technology', 'Open', 'High', 'Noah K.',
     'Connection drops every few minutes during afternoon classes.', 38),
    ('Bike rack is overflowing', 'Library east entrance', 'Campus life', 'Resolved', 'Low', 'Samira P.',
     'A second rack would help keep bikes clear of the accessible path.', 60),
    ('Late-night shuttle is full', 'Science Loop stop', 'Transport', 'Open', 'Medium', 'Eli T.',
     'The 10:30 PM shuttle has been leaving students behind this week.', 120),
]


class Command(BaseCommand):
    help = 'Seed demo users, issues, rooms, routines and bookings.'

    def handle(self, *args, **options):
        # --- Users ---------------------------------------------------------
        teacher, _ = User.objects.get_or_create(username='teacher', defaults={'role': 'teacher'})
        teacher.role = 'teacher'
        teacher.department = 'CSE'
        teacher.first_name = 'Ayesha'
        teacher.last_name = 'Rahman'
        # Kept in sync so the exam-override pipeline can match the routine
        # slot's plain-text faculty name ('Ayesha Rahman') to this account.
        teacher.full_name = 'Ayesha Rahman'
        teacher.email = 'ayesha@niter.local'
        teacher.campus_id = 'CSE-99002'
        teacher.registration_status = User.RegistrationStatus.APPROVED
        teacher.is_active = True
        teacher.set_password('demo1234')
        teacher.save()

        student, _ = User.objects.get_or_create(username='student', defaults={'role': 'student'})
        student.role = 'student'
        student.department = 'CSE'
        student.section = 'A'
        student.batch = '13'
        student.email = 'arif@niter.local'
        student.campus_id = 'CSE-23014'
        student.registration_status = User.RegistrationStatus.APPROVED
        student.is_active = True
        student.set_password('demo1234')
        student.save()

        if not User.objects.filter(is_superuser=True).exists():
            User.objects.create_superuser('admin', 'admin@niter.local', 'admin1234', role='admin',
                                          campus_id='NITER-ADMIN-1',
                                          registration_status=User.RegistrationStatus.APPROVED)

        # --- Pending registrations (for the admin approval panel) -----------
        # Always reset these two to pending so the demo panel has content to
        # approve or reject on every fresh seed.
        pending_student, _ = User.objects.get_or_create(username='pending_student')
        pending_student.role = 'student'
        pending_student.first_name = 'Nusrat'
        pending_student.last_name = 'Jahan'
        pending_student.email = 'nusrat@niter.local'
        pending_student.campus_id = 'CSE-23028'
        pending_student.registration_status = User.RegistrationStatus.PENDING
        pending_student.is_active = False
        pending_student.set_password('demo1234')
        pending_student.save()

        pending_teacher, _ = User.objects.get_or_create(username='pending_teacher')
        pending_teacher.role = 'teacher'
        pending_teacher.first_name = 'Tanvir'
        pending_teacher.last_name = 'Ahmed'
        pending_teacher.email = 'tanvir@niter.local'
        pending_teacher.campus_id = 'EEE-88007'
        pending_teacher.registration_status = User.RegistrationStatus.PENDING
        pending_teacher.is_active = False
        pending_teacher.set_password('demo1234')
        pending_teacher.save()

        # --- Rooms ---------------------------------------------------------
        for number, building, capacity in ROOMS:
            Room.objects.get_or_create(room_number=number, defaults={'building': building, 'capacity': capacity})

        # --- Master routine slots (published across all departments) --------
        if RoutineSlot.objects.count() == 0:
            for department, batch, section, room_number, day, start, end, subject, faculty in ROUTINE_SLOTS:
                RoutineSlot.objects.create(
                    department=department,
                    batch=batch,
                    section=section,
                    room=room_number,
                    day=day,
                    start_time=start,
                    end_time=end,
                    subject=subject,
                    faculty=faculty,
                )

        # --- Routines ------------------------------------------------------
        if Routine.objects.count() == 0:
            for username, subject, dept, section, room_number, day, start, end in ROUTINES:
                Routine.objects.create(
                    teacher=User.objects.get(username=username),
                    subject=subject,
                    department=dept,
                    section=section,
                    room=Room.objects.get(room_number=room_number),
                    day=day,
                    start_time=start,
                    end_time=end,
                )

        # --- Issues (backdated so "x min ago" reads nicely) ----------------
        if Issue.objects.count() == 0:
            now = timezone.now()
            for title, location, category, status, priority, reporter, description, minutes_ago in ISSUES:
                issue = Issue.objects.create(
                    title=title,
                    location=location,
                    category=category,
                    status=status,
                    priority=priority,
                    reporter=reporter,
                    description=description,
                )
                Issue.objects.filter(pk=issue.pk).update(created_at=now - timedelta(minutes=minutes_ago))

        # --- Extra-class request (faculty -> admin approval workflow) ------
        if ExtraClassRequest.objects.count() == 0:
            # Next Saturday, so the demo request sits on the weekday grid
            # (5 = Saturday's weekday() index; % 7 keeps today when it is one).
            today = timezone.now().date()
            saturday = today + timedelta(days=(5 - today.weekday()) % 7)
            ExtraClassRequest.objects.create(
                faculty=teacher,
                room=Room.objects.get(room_number='410'),
                department='CSE',
                batch='10',
                section='A',
                subject='CSE-3101 Machine Learning (extra practice)',
                reason='extra',
                day='SAT',
                date=saturday,
                start_time=time(11, 0),
                end_time=time(12, 0),
                status=ExtraClassRequest.Status.PENDING,
            )

        # --- Notice board (admin -> role-based feeds) -----------------------
        if Notice.objects.count() == 0:
            admin_user = User.objects.filter(is_superuser=True).first()
            now = timezone.now()
            sample_notices = [
                {
                    'title': 'Midterm Exam Schedule Released',
                    'content': (
                        'The midterm examination schedule for all departments has been published. '
                        'Please check the routine section for your department, batch and section, '
                        'and report any timetable clash to the exam controller\'s office before the '
                        'end of this week.'
                    ),
                    'priority': Notice.Priority.URGENT,
                    'target_role': Notice.TargetRole.ALL,
                    'department': '',
                    'pinned': True,
                    'minutes_ago': 25,
                },
                {
                    'title': 'Faculty Workshop: Smart Classroom Tools',
                    'content': (
                        'A hands-on workshop on the smart classroom booking and availability tools '
                        'will be held in the Academic Building seminar room. All faculty are '
                        'encouraged to attend.'
                    ),
                    'priority': Notice.Priority.IMPORTANT,
                    'target_role': Notice.TargetRole.FACULTY,
                    'department': '',
                    'pinned': False,
                    'minutes_ago': 240,
                },
                {
                    'title': 'Library Hours Extended During Exam Week',
                    'content': (
                        'During the upcoming exam week the central library will stay open until '
                        '11:00 PM. Student IDs are required for late entry.'
                    ),
                    'priority': Notice.Priority.NORMAL,
                    'target_role': Notice.TargetRole.STUDENT,
                    'department': '',
                    'pinned': False,
                    'minutes_ago': 1440,
                },
                {
                    'title': 'CSE Dept: Software Project Mentorship Sign-up',
                    'content': (
                        'CSE students can now sign up for faculty mentorship on their final-year '
                        'software project. Slots are limited — see your batch coordinator.'
                    ),
                    'priority': Notice.Priority.IMPORTANT,
                    'target_role': Notice.TargetRole.STUDENT,
                    'department': 'CSE',
                    'pinned': False,
                    'minutes_ago': 2880,
                },
                {
                    'title': 'CSE Batch 10 Sec A: Lab Reschedule',
                    'content': (
                        'The Data Structures lab for CSE Batch 10, Section A moves from Room 302 '
                        'to Room 204 this week. Batch 10 Sec A students only.'
                    ),
                    'priority': Notice.Priority.NORMAL,
                    'target_role': Notice.TargetRole.STUDENT,
                    'department': 'CSE',
                    'batch': '10',
                    'section': 'A',
                    'pinned': False,
                    'minutes_ago': 4320,
                },
            ]
            for item in sample_notices:
                minutes_ago = item.pop('minutes_ago')
                notice = Notice.objects.create(created_by=admin_user, **item)
                Notice.objects.filter(pk=notice.pk).update(
                    created_at=now - timedelta(minutes=minutes_ago)
                )

        # --- Sample bookings for today -------------------------------------
        today = timezone.now().date()
        if not RoomBooking.objects.filter(date=today).exists():
            RoomBooking.objects.create(
                room=Room.objects.get(room_number='302'),
                booked_by=teacher,
                booking_type='exam',
                department='CSE',
                batch_section='13th Batch',
                date=today,
                start_time=time(10, 30),
                end_time=time(12, 30),
            )
            RoomBooking.objects.create(
                room=Room.objects.get(room_number='B-07'),
                booked_by=teacher,
                booking_type='extra_class',
                department='EEE',
                batch_section='9th Batch',
                date=today,
                start_time=time(15, 0),
                end_time=time(16, 30),
            )

        self.stdout.write(self.style.SUCCESS(
            f'Seeded: {User.objects.count()} users, {Room.objects.count()} rooms, '
            f'{Routine.objects.count()} routines, {Issue.objects.count()} issues, '
            f'{RoomBooking.objects.count()} bookings, {Notice.objects.count()} notices.'
        ))
