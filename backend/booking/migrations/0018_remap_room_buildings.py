"""Remap room buildings onto the two canonical names.

The faculty availability search offers exactly two buildings
('Academic Building 1' / 'Academic Building 2'), so every room created under
the older mock names (Academic Building, Science Building, Arts Building,
Library) is folded into one of them.
"""

from django.db import migrations

CANONICAL_ONE = 'Academic Building 1'
CANONICAL_TWO = 'Academic Building 2'


def remap_buildings(apps, schema_editor):
    Room = apps.get_model('booking', 'Room')
    for room in Room.objects.exclude(
        building__in=[CANONICAL_ONE, CANONICAL_TWO]
    ):
        room.building = CANONICAL_ONE if room.building == 'Academic Building' else CANONICAL_TWO
        room.save(update_fields=['building'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('booking', '0017_extraclassrequest_is_override_and_more'),
    ]

    operations = [
        migrations.RunPython(remap_buildings, noop),
    ]
