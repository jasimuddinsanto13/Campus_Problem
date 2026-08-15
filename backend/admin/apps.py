from django.apps import AppConfig


class AdminPortalConfig(AppConfig):
    """The Admin role section.

    The folder is named `admin` but the app label is `admin_portal` so it
    does not clash with Django's built-in `django.contrib.admin` (label `admin`).
    """
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'admin'
    label = 'admin_portal'
    verbose_name = 'Admin portal'
