from django.db import migrations, models


def backfill(apps, schema_editor):
    """Populate full_name (from first/last name) and ensure every row has a
    non-empty email before the unique constraint is added."""
    User = apps.get_model('booking', 'User')
    for user in User.objects.all():
        if not user.full_name:
            full = ' '.join(filter(None, [user.first_name, user.last_name])).strip()
            user.full_name = full or user.username
        if not user.email:
            user.email = user.username
        user.save(update_fields=['full_name', 'email'])


class Migration(migrations.Migration):

    dependencies = [
        ('booking', '0007_user_profile_picture'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='full_name',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.RunPython(backfill, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.EmailField(blank=True, max_length=254, unique=True),
        ),
    ]
