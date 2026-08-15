from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AdminPasskey,
    ClassCancellation,
    DeviceToken,
    ExtraClassRequest,
    Notice,
    RegistrationRequest,
    Room,
    RoomBooking,
    Routine,
    User,
)


@admin.register(User)
class CampusUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ('Campus profile', {'fields': ('role', 'department', 'section', 'batch', 'phone_number')}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ('Campus profile', {'fields': ('role', 'department', 'section', 'batch', 'phone_number')}),
    )
    list_display = ('display_name', 'username', 'role', 'department', 'section', 'batch', 'is_staff')
    list_filter = ('role', 'department', 'is_staff')

    @admin.display(description='Name')
    def display_name(self, obj):
        """Title Case display name (matches the rest of the app)."""
        return obj.get_display_name()


@admin.register(AdminPasskey)
class AdminPasskeyAdmin(admin.ModelAdmin):
    list_display = ('code', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('code',)


@admin.register(RegistrationRequest)
class RegistrationRequestAdmin(admin.ModelAdmin):
    list_display = ('display_name', 'email', 'campus_id', 'role', 'status', 'applied_at')
    list_filter = ('status', 'role')
    search_fields = ('full_name', 'email', 'campus_id')
    date_hierarchy = 'applied_at'

    @admin.display(description='Name')
    def display_name(self, obj):
        return obj.full_name.title()


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ('room_number', 'building', 'capacity')
    list_filter = ('building',)
    search_fields = ('room_number', 'building')


@admin.register(Routine)
class RoutineAdmin(admin.ModelAdmin):
    list_display = ('subject', 'department', 'section', 'room', 'day', 'start_time', 'end_time')
    list_filter = ('day', 'department', 'room')
    autocomplete_fields = ('teacher', 'room')


@admin.register(RoomBooking)
class RoomBookingAdmin(admin.ModelAdmin):
    list_display = ('room', 'booking_type', 'department', 'batch_section', 'date', 'start_time', 'end_time', 'booked_by')
    list_filter = ('booking_type', 'date', 'room')
    date_hierarchy = 'date'
    autocomplete_fields = ('room', 'booked_by')


@admin.register(ExtraClassRequest)
class ExtraClassRequestAdmin(admin.ModelAdmin):
    list_display = ('room', 'subject', 'department', 'batch', 'section', 'reason', 'day', 'date', 'start_time', 'end_time', 'status', 'faculty', 'in_trash', 'created_at')
    list_filter = ('status', 'reason', 'day', 'department')

    @admin.display(boolean=True, description='In trash')
    def in_trash(self, obj):
        return obj.trashed_at is not None


@admin.register(Notice)
class NoticeAdmin(admin.ModelAdmin):
    list_display = ('title', 'priority', 'target_role', 'department', 'pinned', 'created_by', 'created_at')
    list_filter = ('priority', 'target_role', 'department', 'pinned')
    search_fields = ('title', 'content')
    date_hierarchy = 'created_at'
    autocomplete_fields = ('created_by',)


@admin.register(ClassCancellation)
class ClassCancellationAdmin(admin.ModelAdmin):
    list_display = ('course_code', 'department', 'batch', 'section', 'date', 'start_time', 'end_time', 'reason', 'faculty', 'created_at')
    list_filter = ('reason', 'department', 'date')
    search_fields = ('course_code',)
    date_hierarchy = 'date'
    autocomplete_fields = ('faculty',)


@admin.register(DeviceToken)
class DeviceTokenAdmin(admin.ModelAdmin):
    list_display = ('user', 'platform', 'created_at', 'updated_at')
    list_filter = ('platform',)
    search_fields = ('user__username', 'token')
    autocomplete_fields = ('user',)
