"""Pydantic request and response schemas for the REST API."""

from datetime import date, time

from pydantic import BaseModel, Field

VALID_STATUSES = {'Open', 'In progress', 'Resolved'}
VALID_CATEGORIES = {'Facilities', 'Technology', 'Campus life', 'Transport', 'Safety'}
VALID_PRIORITIES = {'Low', 'Medium', 'High'}
VALID_BOOKING_TYPES = {'extra_class', 'reschedule', 'exam'}


class IssueOut(BaseModel):
    id: int
    title: str
    location: str
    category: str
    status: str
    priority: str
    reported: str
    reporter: str
    description: str


class StatusUpdate(BaseModel):
    status: str


class Summary(BaseModel):
    total: int
    open: int
    in_progress: int
    resolved: int


class RoomOut(BaseModel):
    id: int
    room_number: str
    building: str
    capacity: int


class RoomAvailability(RoomOut):
    free: bool
    free_until: str | None = None
    next_booking: str | None = None


class BookingCreate(BaseModel):
    room_id: int
    booking_type: str
    department: str = ''
    batch_section: str = ''
    date: date
    start_time: time
    end_time: time
    booked_by_id: int | None = None


class BookingOut(BaseModel):
    id: int
    room_id: int
    room_number: str = ''
    building: str = ''
    booking_type: str = ''
    department: str
    batch_section: str
    date: date
    start_time: time
    end_time: time
    booked_by_id: int | None = None
    # 'booking' for one-off room bookings, 'routine' for weekly class occupancy.
    source: str = 'booking'
    # Routine subject / teacher name when source == 'routine'.
    title: str = ''
    teacher: str = ''
