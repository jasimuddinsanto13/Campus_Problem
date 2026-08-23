"""
URL configuration for campus_project.

Routes:
  /              -> Entry point: login page when signed out, role portal when signed in
  /issues/       -> Campus Problem issue tracker (issues app)
  /booking/      -> NITER-Pulse room booking dashboard (booking app)
  /django-admin/ -> Django's built-in database admin (moved off /admin/ so the
                    React admin portal can own /admin/dashboard etc.)
"""

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from accounts import views as accounts_views
from booking import admin_booking_views
from booking import api_views as booking_api_views
from booking import cancellation_views
from booking import notice_views
from booking import firestore_notification_views
from issues import api_views as issues_api_views

# React dashboard portals — serves the built SPA in frontend/campus-dashboard/dist
# so /admin/dashboard & friends never 404 when Django is hit directly.
from . import views as spa_views

urlpatterns = [
    # Django's built-in admin moved to /django-admin/ — /admin/* is owned by
    # the React admin portal (login redirects admins to /admin/dashboard).
    path('django-admin/', admin.site.urls),

    # ---- React dashboard portals ----
    # These paths are client-side routes of the SPA in frontend/campus-dashboard. Django
    # serves the built entry point (and its /assets) so that direct visits and
    # the post-login redirects in accounts._role_dashboard() load the portal
    # instead of 404ing — even when the Vite dev server is not running. The
    # named routes must precede the <path:subpath> catch-alls to keep
    # reverse('admin_dashboard') resolving to the exact dashboard URL.
    path('admin/', spa_views.admin_portal, name='admin_home'),
    path('admin/dashboard', spa_views.admin_portal, name='admin_dashboard'),
    path('admin/<path:subpath>', spa_views.admin_portal),
    path('faculty/', spa_views.faculty_portal),
    path('faculty/dashboard', spa_views.faculty_portal, name='faculty_dashboard'),
    path('faculty/<path:subpath>', spa_views.faculty_portal),
    path('teacher/dashboard', spa_views.faculty_portal),  # legacy alias
    path('student/', spa_views.student_portal),
    path('student/dashboard', spa_views.student_portal, name='student_dashboard'),
    path('student/<path:subpath>', spa_views.student_portal),
    path('assets/<path:asset_path>', spa_views.spa_asset),
    path('accounts/', include('accounts.urls')),
    # REST endpoints for the React dashboard (Settings + Users + Routines pages).
    path('api/profile/', accounts_views.profile_api, name='api_profile'),
    path('api/profile/fcm-token/', accounts_views.profile_fcm_token_api, name='api_profile_fcm_token'),
    path('api/profile/picture/', accounts_views.profile_picture_api, name='api_profile_picture'),
    path('api/routines/', accounts_views.routines_api, name='api_routines'),
    path('api/routines/my-schedule/', accounts_views.my_schedule_api, name='api_my_schedule'),
    path('api/routines/department/', accounts_views.department_routine_api, name='api_department_routine'),
    path('api/users/', accounts_views.users_api, name='api_users'),
    path('api/users/<int:user_id>/force-reset/', accounts_views.user_force_reset_api, name='api_user_force_reset'),
    path('api/users/<int:user_id>/', accounts_views.user_profile_api, name='api_user_profile'),
    path('api/users/<int:user_id>/<str:action>/', accounts_views.user_action, name='api_user_action'),
    # Class Representative (CR) management — admin grants/revokes CR status,
    # plus a student-list endpoint for the CR picker.
    path('api/cr/', accounts_views.cr_list_api, name='api_cr_list'),
    path('api/cr/assign/', accounts_views.cr_assign_api, name='api_cr_assign'),
    path('api/cr/revoke/', accounts_views.cr_revoke_api, name='api_cr_revoke'),
    path('api/cr/students/', accounts_views.cr_students_api, name='api_cr_students'),
    # REST endpoints for the Faculty / Admin Room booking pages (extra classes).
    path('api/room-booking/availability/', booking_api_views.availability_api, name='api_room_availability'),
    path('api/room-booking/requests/', booking_api_views.extra_class_requests_api, name='api_room_requests'),
    path('api/room-booking/requests/<int:request_id>/', booking_api_views.extra_class_request_action, name='api_room_request_action'),
    # Admin instant bookings + exam-conflict override + displaced classes.
    path('api/room-booking/rooms/', admin_booking_views.rooms_api, name='api_rooms_list'),
    path('api/admin/room-booking/create/', admin_booking_views.admin_booking_create, name='api_admin_booking_create'),
    path('api/room-booking/displaced/', admin_booking_views.displaced_classes_api, name='api_displaced_classes'),
    # REST endpoints for the role-based Notice Board (admin management + feeds).
    path('api/notices/', notice_views.notices_api, name='api_notices'),
    path('api/notices/faculty/', notice_views.notice_feed_api, name='api_notices_faculty'),
    path('api/notices/student/', notice_views.notice_feed_api, name='api_notices_student'),
    path('api/notices/<int:notice_id>/', notice_views.notice_detail_api, name='api_notice_detail'),
    # Class cancellation + mass student notification (faculty -> students).
    path('api/teacher/cancel-class/', cancellation_views.cancel_class_api, name='api_cancel_class'),
    path('api/teacher/cancellations/', cancellation_views.teacher_cancellations_api, name='api_teacher_cancellations'),
    path('api/teacher/cancellations/<int:cancellation_id>/', cancellation_views.teacher_cancellation_delete, name='api_teacher_cancellation_delete'),
    path('api/student/cancellations/', cancellation_views.student_cancellations_api, name='api_student_cancellations'),
    # FCM push-subscription registration (web/mobile device tokens).
    path('api/push/subscribe/', cancellation_views.push_subscribe_api, name='api_push_subscribe'),
    path('api/push/unsubscribe/', cancellation_views.push_unsubscribe_api, name='api_push_unsubscribe'),
    # Firestore-backed real-time notifications.
    path('api/notifications/', firestore_notification_views.notification_list, name='api_notification_list'),
    path('api/notifications/unread-count/', firestore_notification_views.notification_unread_count, name='api_notification_unread_count'),
    path('api/notifications/read-all/', firestore_notification_views.notification_mark_all_read, name='api_notification_mark_all_read'),
    path('api/notifications/<str:notification_id>/read/', firestore_notification_views.notification_mark_read, name='api_notification_mark_read'),
    # AI chat assistant — same-origin proxy to the FastAPI Gemini endpoints
    # (chat, voice transcription, and text-to-speech).
    path('api/chat', spa_views.chat_proxy, name='api_chat'),
    path('api/chat/<path:subpath>', spa_views.chat_proxy, name='api_chat_subpath'),
    # Meal Query — hostel meal cancellation requests (student submits, manager reviews).
    path('api/meal-query/', accounts_views.meal_cancellations_api, name='api_meal_cancellations'),
    path('api/meal-query/create/', accounts_views.meal_cancellation_create_api, name='api_meal_cancellation_create'),
    path('api/meal-query/<int:cancellation_id>/', accounts_views.meal_cancellation_delete_api, name='api_meal_cancellation_delete'),
    # Campus Issue Desk — faculty submission/outbox + admin management.
    path('api/issues/create/', issues_api_views.create_issue, name='api_issue_create'),
    path('api/issues/my-issues/', issues_api_views.my_issues, name='api_my_issues'),
    path('api/issues/<int:issue_id>/', issues_api_views.delete_issue, name='api_issue_delete'),
    path('api/admin/issues/', issues_api_views.admin_issues, name='api_admin_issues'),
    path('api/admin/issues/<int:issue_id>/', issues_api_views.admin_issue_action, name='api_admin_issue_action'),
    # Site entry point: signed out -> login page; signed in -> role portal.
    path('', accounts_views.home, name='home'),
    # Issue desk (was mounted at '/', now lives at '/issues/').
    path('issues/', include('issues.urls')),
    # Role sections (admin/, faculty/, student/ apps):
    path('portal/admin/', include(('admin.urls', 'admin_portal'))),
    path('portal/faculty/', include(('faculty.urls', 'faculty_portal'))),
    path('portal/student/', include(('student.urls', 'student_portal'))),
    path('booking/', include('booking.urls')),
]

# Serve uploaded media (profile pictures) while DEBUG is enabled.
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
