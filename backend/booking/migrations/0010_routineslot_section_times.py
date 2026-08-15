import datetime

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('booking', '0009_routineslot'),
    ]

    operations = [
        migrations.AddField(
            model_name='routineslot',
            name='section',
            field=models.CharField(default='A', max_length=10),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='routineslot',
            name='start_time',
            field=models.TimeField(default=datetime.time(8, 0)),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='routineslot',
            name='end_time',
            field=models.TimeField(default=datetime.time(9, 0)),
            preserve_default=False,
        ),
        migrations.RemoveField(
            model_name='routineslot',
            name='time_slot',
        ),
        migrations.AlterModelOptions(
            name='routineslot',
            options={'ordering': ['day', 'start_time'], 'verbose_name_plural': 'Routine slots'},
        ),
    ]
