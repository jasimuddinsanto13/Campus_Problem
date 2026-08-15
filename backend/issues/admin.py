from django.contrib import admin

from .models import CampusIssue, Issue


@admin.register(Issue)
class IssueAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'location', 'category', 'status', 'priority', 'created_at')
    list_filter = ('status', 'priority', 'category')
    search_fields = ('title', 'location', 'reporter')
    list_editable = ('status', 'priority')


@admin.register(CampusIssue)
class CampusIssueAdmin(admin.ModelAdmin):
    list_display = ('id', 'title', 'location', 'category', 'status', 'user', 'created_at')
    list_filter = ('status', 'category')
    search_fields = ('title', 'location', 'user__username', 'user__full_name')
    list_editable = ('status',)
