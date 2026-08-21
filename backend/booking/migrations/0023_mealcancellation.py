from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('booking', '0022_add_is_cr_to_user'),
    ]

    operations = [
        migrations.CreateModel(
            name='MealCancellation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('student_name', models.CharField(max_length=100)),
                ('campus_student_id', models.CharField(blank=True, max_length=30)),
                ('department', models.CharField(blank=True, max_length=50)),
                ('section', models.CharField(blank=True, max_length=10)),
                ('date', models.DateField()),
                ('meal_type', models.CharField(
                    choices=[('lunch', 'Lunch'), ('dinner', 'Dinner'), ('both', 'Both')],
                    default='lunch',
                    max_length=10,
                )),
                ('status', models.CharField(
                    choices=[('pending', 'Pending'), ('approved', 'Approved'), ('rejected', 'Rejected')],
                    default='pending',
                    max_length=20,
                )),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('student', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='meal_cancellations',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'verbose_name': 'meal cancellation',
                'verbose_name_plural': 'meal cancellations',
                'ordering': ['-created_at'],
            },
        ),
    ]
