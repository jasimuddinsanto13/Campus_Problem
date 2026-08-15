from django.conf import settings
from django.contrib.auth.decorators import login_required
from django.shortcuts import render
from django.utils import timezone

from .models import Issue


@login_required
def index(request):
    """Render the Campus Problem issue desk with data read from MySQL."""
    issues = Issue.objects.all().order_by('-created_at')
    summary = {
        'total': issues.count(),
        'open': issues.filter(status=Issue.Status.OPEN).count(),
        'in_progress': issues.filter(status=Issue.Status.IN_PROGRESS).count(),
        'resolved': issues.filter(status=Issue.Status.RESOLVED).count(),
    }
    context = {
        'issues': issues,
        'summary': summary,
        'today': timezone.now(),
        'api_base': settings.API_BASE_URL,
    }
    return render(request, 'issues/index.html', context)
