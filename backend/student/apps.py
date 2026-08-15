from django.apps import AppConfig


class StudentPortalConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'student'
    label = 'student_portal'
    verbose_name = 'Student portal'
