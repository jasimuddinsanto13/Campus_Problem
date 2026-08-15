# Seed the initial admin passkeys (add001 .. add010) that unlock
# auto-approved Admin registration.

from django.db import migrations

PASSKEYS = [f'add{i:03d}' for i in range(1, 11)]


def seed_passkeys(apps, schema_editor):
    AdminPasskey = apps.get_model('booking', 'AdminPasskey')
    for code in PASSKEYS:
        AdminPasskey.objects.get_or_create(code=code)


def unseed_passkeys(apps, schema_editor):
    AdminPasskey = apps.get_model('booking', 'AdminPasskey')
    AdminPasskey.objects.filter(code__in=PASSKEYS).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('booking', '0003_adminpasskey'),
    ]

    operations = [
        migrations.RunPython(seed_passkeys, unseed_passkeys),
    ]
