// Fall back to the current host (port 8001) when the template didn't inject
// an API base — keeps the Django sessionid cookie host-scoped to this host.
const API_BASE = window.API_BASE || `http://${window.location.hostname}:8001`;

const dateInput = document.querySelector('#booking-date');
const startSelect = document.querySelector('#start-time');
const endSelect = document.querySelector('#end-time');
const roomGrid = document.querySelector('#room-grid');
const freeCount = document.querySelector('#free-count');
const roomsSub = document.querySelector('#rooms-sub');
const bookingList = document.querySelector('#booking-list');
const bookingEmpty = document.querySelector('#booking-empty');
const bookDialog = document.querySelector('#book-dialog');
const bookForm = document.querySelector('#book-form');

const today = new Date();
// Local date (YYYY-MM-DD), so the picker matches the local calendar day.
const todayISO = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

// Default the date picker to today (local) and label the heading.
dateInput.value = todayISO;
document.querySelector('#today-label').textContent =
  today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase();

function timeWindow() {
  return { date: dateInput.value, start: startSelect.value, end: endSelect.value };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]));
}

const bookingTypeLabel = { exam: 'Examination', extra_class: 'Extra class', reschedule: 'Reschedule' };

function roomCard(room) {
  const chip = room.free
    ? '<span class="room-chip room-chip-free">&#9679; Free</span>'
    : '<span class="room-chip room-chip-busy">&#9679; Booked</span>';
  const note = room.free
    ? `Free until <strong>${room.free_until}</strong>`
    : `Busy <strong>${room.next_booking || 'all day'}</strong>`;
  let action;
  if (!window.CAN_BOOK) {
    // Students have view-only access — they can suggest the slot to a teacher.
    action = '<span class="book-button book-button-view">View only</span>';
  } else if (room.free) {
    action = '<button class="book-button">Book this room</button>';
  } else {
    action = '<button class="book-button" disabled>Not available</button>';
  }
  return `<article class="room-card ${room.free ? 'room-card-free' : 'room-card-busy'}" data-room-id="${room.id}" data-room-name="${escapeHtml(room.building)} · ${escapeHtml(room.room_number)}">
    <div class="room-card-top"><span class="room-number">${escapeHtml(room.room_number)}</span>${chip}</div>
    <p class="room-building">${escapeHtml(room.building)}</p>
    <p class="room-capacity">Seats <strong>${room.capacity}</strong></p>
    <p class="room-note">${note}</p>
    ${action}
  </article>`;
}

function bookingRow(booking) {
  const isRoutine = booking.source === 'routine';
  const kind = isRoutine
    ? '<span class="routine-tag">Routine</span>'
    : bookingTypeLabel[booking.booking_type] || booking.booking_type;
  const main = isRoutine
    ? `<strong>${escapeHtml(booking.title || booking.room_number)}</strong><span>${escapeHtml(booking.room_number)} · ${escapeHtml(booking.building)} · ${kind}</span>`
    : `<strong>${escapeHtml(booking.room_number)}</strong><span>${escapeHtml(booking.building)} · ${kind}</span>`;
  const meta = isRoutine
    ? `<span class="booking-batch">${escapeHtml(booking.department)}${booking.batch_section ? ' · ' + escapeHtml(booking.batch_section) : ''}${booking.teacher ? ' · ' + escapeHtml(booking.teacher) : ''}</span>`
    : `<span class="booking-batch">${escapeHtml(booking.department)}${booking.batch_section ? ' · ' + escapeHtml(booking.batch_section) : ''}</span>`;
  return `<div class="booking-row">
    <div class="booking-time">${booking.start_time.slice(0, 5)}<span>–${booking.end_time.slice(0, 5)}</span></div>
    <div class="booking-main">${main}</div>
    <div class="booking-meta">${meta}</div>
  </div>`;
}

async function loadRooms() {
  const { date, start, end } = timeWindow();
  roomGrid.innerHTML = '';
  freeCount.textContent = '…';
  roomsSub.textContent = `Checking ${date} ${start}–${end}…`;
  try {
    const response = await fetch(`${API_BASE}/api/rooms/free?date=${date}&start=${start}&end=${end}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rooms = await response.json();
    const free = rooms.filter((room) => room.free).length;
    freeCount.textContent = `${free} free`;
    roomsSub.textContent = `${free} of ${rooms.length} rooms are free ${start}–${end} on ${date}`;
    if (rooms.length === 0) {
      roomGrid.innerHTML = '<div class="empty-state">No rooms found in the system yet.</div>';
      return;
    }
    roomGrid.innerHTML = rooms.map(roomCard).join('');
  } catch (error) {
    roomGrid.innerHTML = `<div class="empty-state">Could not reach the API at ${API_BASE}. Is FastAPI running?</div>`;
    freeCount.textContent = '—';
    roomsSub.textContent = 'Connection failed';
    console.error(error);
  }
}

async function loadBookings() {
  try {
    const response = await fetch(`${API_BASE}/api/bookings?date=${dateInput.value}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const bookings = await response.json();
    bookingEmpty.hidden = bookings.length !== 0;
    bookingList.innerHTML = bookings.map(bookingRow).join('');
  } catch (error) {
    bookingList.innerHTML = '';
    bookingEmpty.hidden = false;
    bookingEmpty.textContent = 'Could not load bookings.';
    console.error(error);
  }
}

async function refresh() {
  await Promise.all([loadRooms(), loadBookings()]);
}

document.querySelector('#refresh-rooms').addEventListener('click', refresh);
startSelect.addEventListener('change', loadRooms);
endSelect.addEventListener('change', loadRooms);
dateInput.addEventListener('change', refresh);

roomGrid.addEventListener('click', (event) => {
  const button = event.target.closest('.book-button');
  // Only real <button> elements open the dialog — students see a view-only badge.
  if (!button || button.tagName !== 'BUTTON' || button.disabled) return;
  const card = button.closest('.room-card');
  bookForm.reset();
  bookForm.dataset.roomId = card.dataset.roomId;
  document.querySelector('#book-room-name').textContent = `Reserve ${card.dataset.roomName}`;
  document.querySelector('#book-window').textContent =
    `${dateInput.value} · ${startSelect.value}–${endSelect.value} · free until confirmed`;
  document.querySelector('#book-feedback').textContent = '';
  bookDialog.showModal();
});

bookForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(bookForm);
  const payload = {
    room_id: Number(bookForm.dataset.roomId),
    booking_type: formData.get('booking_type'),
    department: formData.get('department'),
    batch_section: formData.get('batch_section'),
    date: dateInput.value,
    start_time: startSelect.value,
    end_time: endSelect.value,
    booked_by_id: window.BOOKER_ID,
  };
  const feedback = document.querySelector('#book-feedback');
  try {
    // credentials: 'include' sends the Django sessionid cookie cross-origin
    // so FastAPI can verify the caller is faculty/admin (403 otherwise).
    const response = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      feedback.textContent = result.detail || 'Unable to book this room.';
      return;
    }
    feedback.textContent = result.message || 'Booked!';
    bookDialog.close();
    refresh();
  } catch (error) {
    feedback.textContent = 'Could not reach the booking service.';
    console.error(error);
  }
});

refresh();
