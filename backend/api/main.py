"""FastAPI REST layer for the campus project.

Endpoints
---------
Health   : GET  /api/health
Issues   : GET  /api/issues          list issues
           POST /api/issues          create an issue (JSON or form data)
           PATCH /api/issues/{id}    update issue status
Summary  : GET  /api/summary         counts by status
Rooms    : GET  /api/rooms           list all rooms
           GET  /api/rooms/free      rooms free in a time window (?date&start&end)
Bookings : GET  /api/bookings        list bookings (?date)
           POST /api/bookings        create a booking (401 unauthenticated,
                                     403 for students, 409 on conflict)

Run with:  py -m uvicorn api.main:app --reload --port 8001

Authorization: POST /api/bookings requires a valid Django ``sessionid``
cookie belonging to an active teacher or admin account — students are
rejected with 403 server-side (never trusted client-side UI state).
"""

import base64
import os
import struct
from datetime import datetime, time as dt_time
from datetime import date, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from .config import BASE_DIR
from .database import get_db
from .models import Issue, Room, RoomBooking, Routine
from .schemas import (
    VALID_BOOKING_TYPES,
    VALID_CATEGORIES,
    VALID_PRIORITIES,
    VALID_STATUSES,
    BookingCreate,
    BookingOut,
    ChatRequest,
    ChatResponse,
    ChatSpeakRequest,
    ChatSpeakResponse,
    ChatTranscribeRequest,
    ChatTranscribeResponse,
    IssueOut,
    RoomAvailability,
    RoomOut,
    StatusUpdate,
    Summary,
)

app = FastAPI(
    title='Campus Problem API',
    description='REST layer for the NITER-Pulse booking system and the Campus Problem tracker.',
    version='1.0.0',
)

# The Django-served pages call this API cross-origin during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        'http://127.0.0.1:8000',
        'http://localhost:8000',
        'http://127.0.0.1:8002',
        'http://localhost:8002',
    ],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _relative(dt: datetime) -> str:
    """Human string like '12 min ago' for a stored (naive UTC) datetime."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    delta = now - dt
    if delta < timedelta(minutes=1):
        return 'Just now'
    if delta < timedelta(hours=1):
        return f'{int(delta.total_seconds() // 60)} min ago'
    if delta < timedelta(days=1):
        return f'{int(delta.total_seconds() // 3600)} hr ago'
    return f'{delta.days} day{"s" if delta.days > 1 else ""} ago'


def _issue_out(issue: Issue) -> IssueOut:
    return IssueOut(
        id=issue.id,
        title=issue.title,
        location=issue.location,
        category=issue.category,
        status=issue.status,
        priority=issue.priority,
        reported=_relative(issue.created_at),
        reporter=issue.reporter,
        description=issue.description,
    )


def _summary(db: Session) -> Summary:
    rows = db.execute(select(Issue.status, func.count()).group_by(Issue.status)).all()
    counts = {status: n for status, n in rows}
    return Summary(
        total=sum(counts.values()),
        open=counts.get('Open', 0),
        in_progress=counts.get('In progress', 0),
        resolved=counts.get('Resolved', 0),
    )


async def _parse_payload(request: Request):
    """Accept either JSON or form-encoded bodies."""
    content_type = request.headers.get('content-type', '')
    if 'application/json' in content_type:
        return await request.json()
    return dict(await request.form())


WEEKDAY_CODES = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']


def _weekday_code(day: date) -> str:
    """Django Routine.day code ('MON'..'SUN') for a date's weekday."""
    return WEEKDAY_CODES[day.weekday()]


def _overlaps(db: Session, room_id: int, day: date, start: dt_time, end: dt_time, exclude_id: int | None = None):
    """A conflicting one-off booking for the window (if any)."""
    stmt = select(RoomBooking).where(
        RoomBooking.room_id == room_id,
        RoomBooking.date == day,
        RoomBooking.start_time < end,
        RoomBooking.end_time > start,
    )
    if exclude_id is not None:
        stmt = stmt.where(RoomBooking.id != exclude_id)
    return db.execute(stmt).scalars().first()


def _routine_overlap(db: Session, room_id: int, day: date, start: dt_time, end: dt_time):
    """A weekly routine occupying the room for the window (if any)."""
    return db.execute(
        select(Routine).where(
            Routine.room_id == room_id,
            Routine.day == _weekday_code(day),
            Routine.start_time < end,
            Routine.end_time > start,
        )
    ).scalars().first()


def _teacher_names(db: Session) -> dict[int, str]:
    rows = db.execute(
        text('SELECT id, full_name, first_name, last_name FROM booking_user')
    ).all()
    # Title Case display ('Santo Jasim'), mirroring Django's get_display_name().
    return {
        r.id: (
            ((r.full_name or '').strip() or f'{r.first_name} {r.last_name}'.strip()).title()
            or '—'
        )
        for r in rows
    }


def _session_user(request: Request):
    """Resolve the Django ``sessionid`` cookie to an active booking_user row.

    Decoding is delegated to Django's own session backend (same settings /
    SECRET_KEY, same DB), so it always matches the installed Django version.
    Returns None when the cookie is missing, the session is gone/expired, or
    the session does not map to an active user. Imported lazily so the module
    imports cleanly without Django being configured first.
    """
    session_key = request.cookies.get('sessionid')
    if not session_key:
        return None
    try:
        import os
        import sys
        from pathlib import Path

        # The role-section apps (admin/, faculty/, student/) live next to
        # backend/ — mirror manage.py so django.setup() can import them.
        repo_root = str(Path(__file__).resolve().parent.parent.parent)
        if repo_root not in sys.path:
            sys.path.insert(0, repo_root)
        os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'campus_project.settings')
        import django

        django.setup()
        from django.contrib.auth import get_user_model
        from django.contrib.sessions.backends.db import SessionStore

        store = SessionStore(session_key=session_key)
        if not store.exists():
            return None
        user_id = store.get('_auth_user_id')
        if not user_id:
            return None
        return get_user_model().objects.filter(pk=user_id, is_active=True).first()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------

@app.get('/api/health')
def health(db: Session = Depends(get_db)):
    try:
        db.execute(select(1))
        db_status = 'ok'
    except Exception:  # pragma: no cover
        db_status = 'error'
    return {'status': 'ok', 'database': db_status, 'service': 'fastapi'}


# ---------------------------------------------------------------------------
# Issues (Campus Problem tracker)
# ---------------------------------------------------------------------------

@app.get('/api/issues', response_model=list[IssueOut])
def list_issues(db: Session = Depends(get_db)):
    issues = db.execute(select(Issue).order_by(Issue.created_at.desc())).scalars().all()
    return [_issue_out(issue) for issue in issues]


@app.post('/api/issues', response_model=dict, status_code=201)
async def create_issue(request: Request, db: Session = Depends(get_db)):
    payload = await _parse_payload(request)
    title = str(payload.get('title', '')).strip()
    location = str(payload.get('location', '')).strip()
    if not title or not location:
        raise HTTPException(status_code=400, detail='Title and location are required.')

    category = str(payload.get('category', 'Facilities')).strip()
    priority = str(payload.get('priority', 'Medium')).strip()
    if category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail='Category is not supported.')
    if priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail='Priority is not supported.')

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    issue = Issue(
        title=title[:80],
        location=location[:80],
        category=category,
        status='Open',
        priority=priority,
        reporter=(str(payload.get('reporter', 'You')).strip() or 'You')[:60],
        description=(str(payload.get('description', '')).strip() or 'No additional details provided.')[:300],
        created_at=now,
        updated_at=now,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return {'issue': _issue_out(issue), 'summary': _summary(db)}


@app.patch('/api/issues/{issue_id}', response_model=dict)
def update_issue(issue_id: int, payload: StatusUpdate, db: Session = Depends(get_db)):
    if payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail='Status is not supported.')
    issue = db.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail='Issue not found.')
    issue.status = payload.status
    issue.updated_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    db.refresh(issue)
    return {'issue': _issue_out(issue), 'summary': _summary(db)}


@app.get('/api/summary', response_model=Summary)
def summary(db: Session = Depends(get_db)):
    return _summary(db)


# ---------------------------------------------------------------------------
# Rooms & bookings (NITER-Pulse)
# ---------------------------------------------------------------------------

@app.get('/api/rooms', response_model=list[RoomOut])
def list_rooms(db: Session = Depends(get_db)):
    rooms = db.execute(select(Room).order_by(Room.building, Room.room_number)).scalars().all()
    return [RoomOut(id=r.id, room_number=r.room_number, building=r.building, capacity=r.capacity) for r in rooms]


@app.get('/api/rooms/free', response_model=list[RoomAvailability])
def free_rooms(
    date: date = Query(...),
    start: str = Query('09:00'),
    end: str = Query('10:30'),
    db: Session = Depends(get_db),
):
    """Rooms with no overlapping booking for the requested window."""
    try:
        start_t, end_t = dt_time.fromisoformat(start), dt_time.fromisoformat(end)
    except ValueError:
        raise HTTPException(status_code=400, detail='Times must be HH:MM.')
    if start_t >= end_t:
        raise HTTPException(status_code=400, detail='Start must be before end.')

    rooms = db.execute(select(Room).order_by(Room.building, Room.room_number)).scalars().all()
    bookings = db.execute(
        select(RoomBooking).where(
            RoomBooking.date == date,
            RoomBooking.start_time < end_t,
            RoomBooking.end_time > start_t,
        ).order_by(RoomBooking.start_time)
    ).scalars().all()
    # Weekly routines occupy rooms too (baseline occupancy per the SRS).
    routines = db.execute(
        select(Routine).where(
            Routine.day == _weekday_code(date),
            Routine.start_time < end_t,
            Routine.end_time > start_t,
        ).order_by(Routine.start_time)
    ).scalars().all()

    # Room -> the earliest conflicting occupancy inside the window.
    busy: dict[int, object] = {}
    for b in bookings:
        busy.setdefault(b.room_id, b)
    for r in routines:
        if r.room_id not in busy or r.start_time < busy[r.room_id].start_time:
            busy[r.room_id] = r

    result = []
    for room in rooms:
        own = busy.get(room.id)
        if own is not None:
            result.append(RoomAvailability(
                id=room.id, room_number=room.room_number, building=room.building,
                capacity=room.capacity, free=False,
                next_booking=f'{own.start_time:%H:%M}-{own.end_time:%H:%M}',
            ))
        else:
            # Earliest occupancy later the same day (booking or routine).
            later = db.execute(
                select(RoomBooking.start_time).where(
                    RoomBooking.room_id == room.id,
                    RoomBooking.date == date,
                    RoomBooking.start_time >= end_t,
                ).order_by(RoomBooking.start_time)
            ).scalars().first()
            later_routine = db.execute(
                select(Routine.start_time).where(
                    Routine.room_id == room.id,
                    Routine.day == _weekday_code(date),
                    Routine.start_time >= end_t,
                ).order_by(Routine.start_time)
            ).scalars().first()
            free_until = 'End of day'
            if later is not None and later_routine is not None:
                free_until = f'{min(later, later_routine):%H:%M}'
            elif later is not None:
                free_until = f'{later:%H:%M}'
            elif later_routine is not None:
                free_until = f'{later_routine:%H:%M}'
            result.append(RoomAvailability(
                id=room.id, room_number=room.room_number, building=room.building,
                capacity=room.capacity, free=True,
                free_until=free_until,
            ))
    return result


@app.get('/api/bookings', response_model=list[BookingOut])
def list_bookings(date: Optional[date] = None, db: Session = Depends(get_db)):
    stmt = select(RoomBooking).order_by(RoomBooking.date, RoomBooking.start_time)
    if date is not None:
        stmt = stmt.where(RoomBooking.date == date)
    bookings = db.execute(stmt).scalars().all()
    rooms = {r.id: r for r in db.execute(select(Room)).scalars().all()}

    items = [
        BookingOut(
            id=b.id, room_id=b.room_id, booked_by_id=b.booked_by_id,
            room_number=rooms[b.room_id].room_number if b.room_id in rooms else '',
            building=rooms[b.room_id].building if b.room_id in rooms else '',
            booking_type=b.booking_type, department=b.department, batch_section=b.batch_section,
            date=b.date, start_time=b.start_time, end_time=b.end_time,
            source='booking',
        )
        for b in bookings
    ]

    # Weekly routines occupy the room as well — include them in the daily feed
    # (routines are weekly, so they need a concrete date to map to a weekday).
    if date is not None:
        teachers = _teacher_names(db)
        routines = db.execute(
            select(Routine).where(Routine.day == _weekday_code(date)).order_by(Routine.start_time)
        ).scalars().all()
        items += [
            BookingOut(
                id=r.id, room_id=r.room_id,
                room_number=rooms[r.room_id].room_number if r.room_id in rooms else '',
                building=rooms[r.room_id].building if r.room_id in rooms else '',
                booking_type='', department=r.department, batch_section=r.section,
                date=date, start_time=r.start_time, end_time=r.end_time,
                source='routine', title=r.subject, teacher=teachers.get(r.teacher_id, ''),
            )
            for r in routines
        ]

    items.sort(key=lambda item: item.start_time)
    return items


@app.post('/api/bookings', response_model=dict, status_code=201)
def create_booking(payload: BookingCreate, request: Request, db: Session = Depends(get_db)):
    # Server-side role enforcement — the client never decides who may book.
    user = _session_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail='Sign in to book a room.')
    if user.role not in ('teacher', 'admin'):
        raise HTTPException(
            status_code=403,
            detail='Only faculty or admins can book rooms. Contact a faculty member.',
        )

    if payload.booking_type not in VALID_BOOKING_TYPES:
        raise HTTPException(status_code=400, detail='Booking type is not supported.')
    if payload.start_time >= payload.end_time:
        raise HTTPException(status_code=400, detail='Start must be before end.')
    if db.get(Room, payload.room_id) is None:
        raise HTTPException(status_code=404, detail='Room not found.')

    conflict = _overlaps(db, payload.room_id, payload.date, payload.start_time, payload.end_time)
    if conflict is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f'Room is already booked {conflict.start_time:%H:%M}-{conflict.end_time:%H:%M} '
                f'for {conflict.department or "another class"}.'
            ),
        )

    routine = _routine_overlap(db, payload.room_id, payload.date, payload.start_time, payload.end_time)
    if routine is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f'Room is occupied by a routine class {routine.start_time:%H:%M}-{routine.end_time:%H:%M} '
                f'({routine.subject}).'
            ),
        )

    booking = RoomBooking(
        room_id=payload.room_id,
        booked_by_id=user.id,  # the authenticated user — client ids are ignored
        booking_type=payload.booking_type,
        department=payload.department.strip(),
        batch_section=payload.batch_section.strip(),
        date=payload.date,
        start_time=payload.start_time,
        end_time=payload.end_time,
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    room = db.get(Room, payload.room_id)
    return {
        'booking': BookingOut(
            id=booking.id, room_id=booking.room_id, booked_by_id=booking.booked_by_id,
            room_number=room.room_number, building=room.building,
            booking_type=booking.booking_type, department=booking.department,
            batch_section=booking.batch_section, date=booking.date,
            start_time=booking.start_time, end_time=booking.end_time,
        ).model_dump(mode='json'),
        'message': f'{room.room_number} locked for {payload.start_time:%H:%M}-{payload.end_time:%H:%M}.',
    }


# ---------------------------------------------------------------------------
# AI chat assistant (Google Gemini — official google-genai SDK)
# ---------------------------------------------------------------------------

# Rules the assistant must follow on every turn. In the current Interactions
# API, system_instruction is scoped to the interaction, so it is re-sent with
# each request rather than set once on the client.
CHAT_SYSTEM_INSTRUCTION = (
    'You are Campus Assistant, the official chatbot of the Campus Problem '
    'university portal. You help students, faculty and admins with questions '
    'about weekly routines, room booking and availability, notices, class '
    'cancellations and campus issue reports. Be concise, friendly and '
    'accurate. If you do not know something about this specific platform, say '
    'so instead of guessing — never invent room numbers, schedules or bookings.'
)

# Fastest, cost-efficient chat model — gemini-2.5-flash and other 2.x/1.x
# models are legacy and deprecated; the 3.x lite models are the supported,
# fastest replacement for lightweight chat.
CHAT_MODEL = 'gemini-3.1-flash-lite'

# Spoken replies use the dedicated TTS model (speech generation). The chosen
# voice comes from the prebuilt output voices (e.g. Kore=Firm, Puck=Upbeat,
# Achird=Friendly, Sulafat=Warm).
CHAT_TTS_MODEL = 'gemini-3.1-flash-tts-preview'
CHAT_TTS_VOICE = 'Achird'  # Friendly


def _pcm_to_wav(pcm: bytes, sample_rate: int = 24000, channels: int = 1, sample_width: int = 2) -> bytes:
    """Wrap raw PCM16 audio in a RIFF/WAVE container so browsers can play it.

    The TTS model returns bare PCM (24000 Hz, mono, 16-bit) — the same shape
    the Gemini docs show being written straight into a .wav file.
    """
    data_size = len(pcm)
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16, 1, channels, sample_rate,
        sample_rate * channels * sample_width,
        channels * sample_width, sample_width * 8, b'data', data_size,
    )
    return header + pcm

_genai_client = None
_genai_client_key = None


def _gemini_api_key() -> str:
    """Current GEMINI_API_KEY, refreshing the .env files on every call.

    ``load_dotenv(override=True)`` makes .env the live source of truth, so a
    key change applies on the next message without restarting the server.
    """
    load_dotenv(BASE_DIR / '.env', override=True)
    load_dotenv(BASE_DIR.parent / '.env', override=True)
    return os.environ.get('GEMINI_API_KEY', '').strip()


def _gemini_client():
    """Lazily-built GoogleGenAI client (official ``google-genai`` SDK).

    Returns None when GEMINI_API_KEY is missing so the rest of the API keeps
    working — the widget then gets a clean 503 instead of a crash. The client
    is rebuilt whenever the key changes.
    """
    global _genai_client, _genai_client_key
    api_key = _gemini_api_key()
    if not api_key:
        _genai_client, _genai_client_key = None, None
        return None
    if _genai_client is not None and _genai_client_key == api_key:
        return _genai_client
    from google import genai

    _genai_client = genai.Client(api_key=api_key)
    _genai_client_key = api_key
    return _genai_client


@app.post('/api/chat', response_model=ChatResponse)
def chat(payload: ChatRequest):
    """One turn of the chat widget.

    Sends the user's message (plus the previous interaction id so Gemini
    maintains conversation history server-side) and returns the reply plus the
    new interaction id to chain the next turn. Defined as a plain ``def`` so
    FastAPI runs the blocking Gemini call in a worker thread.
    """
    client = _gemini_client()
    if client is None:
        raise HTTPException(
            status_code=503,
            detail='The chat assistant is not configured (GEMINI_API_KEY missing).',
        )
    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail='Message is required.')
    try:
        interaction = client.interactions.create(
            model=CHAT_MODEL,
            input=message,
            system_instruction=CHAT_SYSTEM_INSTRUCTION,
            previous_interaction_id=payload.interaction_id or None,
        )
    except Exception as exc:  # network / quota / auth failures -> 502
        raise HTTPException(status_code=502, detail=f'Gemini request failed: {exc}')
    return ChatResponse(
        reply=interaction.output_text or '',
        interaction_id=interaction.id,
    )


@app.post('/api/chat/transcribe', response_model=ChatTranscribeResponse)
def transcribe_chat_audio(payload: ChatTranscribeRequest):
    """Voice input: transcribe recorded audio (base64 WAV) to text.

    The audio goes to Gemini as an inline part (under the 20 MB limit) on the
    same chat model; the transcript is then sent through the normal /api/chat
    flow by the widget, so conversation history is preserved.
    """
    client = _gemini_client()
    if client is None:
        raise HTTPException(status_code=503, detail='The chat assistant is not configured (GEMINI_API_KEY missing).')
    try:
        audio_bytes = base64.b64decode(payload.audio_base64, validate=False)
    except Exception:
        raise HTTPException(status_code=400, detail='audio_base64 is not valid base64.')
    if not audio_bytes:
        raise HTTPException(status_code=400, detail='Audio payload is empty.')
    try:
        interaction = client.interactions.create(
            model=CHAT_MODEL,
            input=[
                {'type': 'text', 'text': 'Transcribe the speech in this audio exactly. Output only the transcript, no commentary.'},
                {'type': 'audio', 'data': base64.b64encode(audio_bytes).decode('ascii'), 'mime_type': payload.mime_type},
            ],
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Gemini transcription failed: {exc}')
    transcript = (interaction.output_text or '').strip()
    if not transcript:
        raise HTTPException(status_code=502, detail='No speech was recognized in the audio.')
    return ChatTranscribeResponse(transcript=transcript)


@app.post('/api/chat/speak', response_model=ChatSpeakResponse)
def speak_chat_text(payload: ChatSpeakRequest):
    """Voice output: turn text into speech with the Gemini TTS model.

    Returns a base64 WAV (24000 Hz PCM wrapped in a WAVE header) the browser
    can play directly via an <audio> blob URL.
    """
    client = _gemini_client()
    if client is None:
        raise HTTPException(status_code=503, detail='The chat assistant is not configured (GEMINI_API_KEY missing).')
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail='Text is required.')
    try:
        interaction = client.interactions.create(
            model=CHAT_TTS_MODEL,
            input=text[:5000],
            response_format={'type': 'audio'},
            generation_config={'speech_config': [{'voice': CHAT_TTS_VOICE}]},
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f'Gemini speech generation failed: {exc}')
    audio = getattr(interaction, 'output_audio', None)
    if audio is None or not getattr(audio, 'data', None):
        raise HTTPException(status_code=502, detail='The TTS model returned no audio.')
    pcm = base64.b64decode(audio.data)
    return ChatSpeakResponse(audio_base64=base64.b64encode(_pcm_to_wav(pcm)).decode('ascii'))
