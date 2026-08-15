from django.db import models


class CampusIssue(models.Model):
    """A campus / facility issue report submitted by a user (faculty portal).

    Faculty submit these from the React Issue Desk page; an admin reviews
    them in the admin portal — updating the status and leaving a response
    that the reporter sees on their outbox.
    """

    class Category(models.TextChoices):
        CAMPUS_LIFE = 'campus_life', 'Campus Life & Amenities'
        CLASSROOM_EQUIPMENT = 'classroom_equipment', 'Classroom / Lab Equipment'
        ELECTRICAL = 'electrical', 'Electrical / AC Fault'
        CLEANLINESS = 'cleanliness', 'Cleanliness & Sanitation'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending Admin Review'
        IN_PROGRESS = 'in_progress', 'In Progress'
        RESOLVED = 'resolved', 'Resolved'

    user = models.ForeignKey(
        'booking.User',
        on_delete=models.CASCADE,
        related_name='campus_issues',
        help_text='The user who submitted the issue.',
    )
    category = models.CharField(
        max_length=40, choices=Category.choices, default=Category.CAMPUS_LIFE
    )
    title = models.CharField(max_length=200)
    # Building + room combined (e.g. "Academic Building 1 · Room 302").
    location = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    # Optional photo (JPG/PNG) or document (PDF/DOCX) uploaded from the form.
    attachment = models.FileField(
        upload_to='issue_attachments/', blank=True, null=True
    )
    status = models.CharField(
        max_length=20, choices=Status.choices, default=Status.PENDING
    )
    # The admin's reply / resolution note, shown on the reporter's outbox.
    admin_response = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'Campus issues'

    def __str__(self):
        return f'#{self.pk} {self.title} ({self.get_status_display()})'


class Issue(models.Model):
    """A problem report submitted about the campus."""

    class Category(models.TextChoices):
        FACILITIES = 'Facilities', 'Facilities'
        TECHNOLOGY = 'Technology', 'Technology'
        CAMPUS_LIFE = 'Campus life', 'Campus life'
        TRANSPORT = 'Transport', 'Transport'
        SAFETY = 'Safety', 'Safety'

    class Status(models.TextChoices):
        OPEN = 'Open', 'Open'
        IN_PROGRESS = 'In progress', 'In progress'
        RESOLVED = 'Resolved', 'Resolved'

    class Priority(models.TextChoices):
        LOW = 'Low', 'Low'
        MEDIUM = 'Medium', 'Medium'
        HIGH = 'High', 'High'

    title = models.CharField(max_length=80)
    location = models.CharField(max_length=80)
    category = models.CharField(max_length=20, choices=Category.choices, default=Category.FACILITIES)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    priority = models.CharField(max_length=10, choices=Priority.choices, default=Priority.MEDIUM)
    reporter = models.CharField(max_length=60, default='You')
    description = models.TextField(blank=True, default='No additional details provided.')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'#{self.pk} {self.title}'
