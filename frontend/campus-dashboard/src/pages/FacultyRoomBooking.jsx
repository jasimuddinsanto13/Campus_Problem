import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { getCsrfToken } from '../lib/csrf';
import {
  BATCHES,
  DAYS,
  DEPARTMENTS,
  DEPT_SECTIONS,
  to12h,
} from '../lib/routines';
import {
  REQUEST_STATUS_META,
  addHours,
  fmtDate,
  nextOccurrence,
  tdClass,
  thClass,
} from '../lib/roomBooking';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  BanIcon,
  BuildingIcon,
  CalendarIcon,
  CaretDownIcon,
  CircleCheckIcon,
  ClockIcon,
  EyeIcon,
  MegaphoneIcon,
  RefreshIcon,
  RoomBookingIcon,
  SearchIcon,
  SeatIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from '../components/Icons';

/* ---------------- constants ---------------- */

// Time-range filter: search start (08:00 AM onwards) and end (up to 05:00 PM).
const START_TIMES = Array.from({ length: 9 }, (_, i) => {
  const h = i + 8; // 08:00 … 16:00
  return `${String(h).padStart(2, '0')}:00`;
});
const END_TIMES = Array.from({ length: 9 }, (_, i) => {
  const h = i + 9; // 09:00 … 17:00
  return `${String(h).padStart(2, '0')}:00`;
});

// Booking durations offered inside the modal.
const MODAL_DURATIONS = [
  { label: '1 hour', hours: 1 },
  { label: '1.5 hours', hours: 1.5 },
  { label: '2 hours', hours: 2 },
  { label: '3 hours', hours: 3 },
];

// The availability search offers exactly these two buildings.
const BUILDINGS = ['Academic Building 1', 'Academic Building 2'];

export default function FacultyRoomBooking() {
  const { department: myDept, batch: myBatch, role } = useUser();

  // Role-based access: teachers book rooms; students get a read-only view.
  const isTeacher = role === 'teacher';

  // ---- Availability filter (day + start/end time range) ----
  const [day, setDay] = useState('SUN');
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('16:00');
  const [building, setBuilding] = useState('');
  const [rooms, setRooms] = useState([]);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  // ---- Booking modal ----
  const [modalRoom, setModalRoom] = useState(null);
  const [form, setForm] = useState({
    department: '',
    batch: '',
    section: 'A',
    subject: '',
    reason: 'extra',
    date: '',
  });
  const [submitting, setSubmitting] = useState(false);
  // The modal lets the teacher pick the exact start time + duration.
  const [modalStart, setModalStart] = useState('08:00');
  const [modalDuration, setModalDuration] = useState(1);

  // ---- History ----
  const [requests, setRequests] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [confirmTrash, setConfirmTrash] = useState(null);

  // ---- Displaced classes (admin exam override -> replacement workflow) ----
  const [searchParams] = useSearchParams();
  const [displaced, setDisplaced] = useState([]);
  const [activeDisplaced, setActiveDisplaced] = useState(null);
  const prefilled = useRef(false);

  // ---- Toast (optionally with an Undo action) ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback(
    (message, { error = false, actionLabel, onAction, duration = 3400 } = {}) => {
      clearTimeout(toastTimer.current);
      setToast({ message, error, actionLabel, onAction });
      toastTimer.current = setTimeout(() => setToast(null), duration);
    },
    [],
  );

  // Pending displaced classes — the dashboard banner links here with the
  // window pre-filled; the teacher picks a free room and submits a replacement.
  const loadDisplaced = useCallback(async () => {
    if (!isTeacher) return;
    try {
      const res = await fetch('/api/room-booking/displaced/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setDisplaced(data.displaced || []);
    } catch {
      /* the banner simply stays hidden on network errors */
    }
  }, [isTeacher]);

  useEffect(() => {
    if (isTeacher) loadDisplaced();
  }, [isTeacher, loadDisplaced]);

  // Pre-fill the availability search from a displaced-class link
  // (?displaced=<id>&day=WED&start=09:00&end=10:00) once on mount.
  useEffect(() => {
    if (!isTeacher || prefilled.current) return;
    const dayParam = searchParams.get('day');
    if (!dayParam) return;
    prefilled.current = true;
    setDay(dayParam);
    if (startParam) setStart(startParam);
    if (endParam) setEnd(endParam);
    setSearched(true);
  }, [isTeacher, searchParams]);

  // Once the displaced list loads, pin the one the link pointed at (or the
  // first pending one) so the banner shows which class is being replaced.
  useEffect(() => {
    if (!isTeacher || displaced.length === 0) return;
    const paramId = searchParams.get('displaced');
    setActiveDisplaced(
      (prev) =>
        prev || displaced.find((d) => String(d.id) === String(paramId)) || displaced[0],
    );
  }, [isTeacher, displaced, searchParams]);

  const applyDisplaced = (d) => {
    setActiveDisplaced(d);
    setDay(d.day);
    setStart(d.start_time);
    setEnd(d.end_time);
    setSearched(true);
  };

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/room-booking/requests/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load your booking history.');
      setRequests(data.requests || []);
    } catch (err) {
      showToast(err.message, { error: true });
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Students have no booking history (the API rejects their requests), so
  // only faculty fetch it.
  useEffect(() => {
    if (isTeacher) loadHistory();
  }, [isTeacher, loadHistory]);

  // ---- Availability search ----
  const search = useCallback(async () => {
    if (start >= end) {
      showToast('Start time must be before the end time.', { error: true });
      return;
    }
    setSearching(true);
    setSearchError(null);
    const params = new URLSearchParams({ day, start, end });
    if (building) params.set('building', building);
    try {
      const res = await fetch(`/api/room-booking/availability/?${params}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not check availability.');
      setRooms(data.rooms || []);
      setSearched(true);
    } catch (err) {
      setSearchError(err.message);
      setSearched(true);
    } finally {
      setSearching(false);
    }
  }, [day, start, end, building]);

  // Live results: any change to the search window re-runs the search once a
  // first search has happened (the callback identity tracks its own deps).
  useEffect(() => {
    if (searched) search();
  }, [searched, search]);

  // ---- Modal helpers ----
  const openModal = (room) => {
    // Defense in depth: only faculty can ever open the booking modal, even
    // if a student reaches the handler via dev tools or a keyboard shortcut.
    if (!isTeacher) return;
    setModalRoom(room);
    setForm({
      department: myDept || 'CSE',
      batch: BATCHES.includes(myBatch) ? myBatch : '10',
      section: 'A',
      subject: '',
      reason: 'extra',
      date: nextOccurrence(day),
    });
    if (activeDisplaced) {
      // Replacing a displaced class: the window is fixed to the class time.
      const [sh, sm] = activeDisplaced.start_time.split(':').map(Number);
      const [eh, em] = activeDisplaced.end_time.split(':').map(Number);
      const hours = (eh * 60 + em - (sh * 60 + sm)) / 60;
      setModalStart(activeDisplaced.start_time);
      // Snap to the nearest offered duration so the select never renders
      // blank for unusual class lengths.
      setModalDuration(
        MODAL_DURATIONS.reduce(
          (best, d) => (Math.abs(d.hours - hours) < Math.abs(best.hours - hours) ? d : best),
          MODAL_DURATIONS[0],
        ).hours,
      );
    } else {
      setModalStart(start);
      setModalDuration(1);
    }
  };

  const closeModal = () => {
    if (submitting) return;
    setModalRoom(null);
  };

  const sections = useMemo(
    () => (form.department ? DEPT_SECTIONS[form.department] || [] : []),
    [form.department],
  );

  const submitRequest = async () => {
    if (!form.subject.trim()) {
      showToast('Enter the course / subject name.', { error: true });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/room-booking/requests/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          room_id: modalRoom.id,
          department: form.department,
          batch: form.batch,
          section: form.section,
          subject: form.subject.trim(),
          reason: 'extra',
          day,
          date: form.date,
          start_time: modalStart,
          end_time: addHours(modalStart, modalDuration),
          // Faculty bookings are confirmed instantly — no admin approval step.
          auto_approve: true,
          // When the teacher is replacing a class displaced by an admin exam,
          // the backend resolves it and notifies the enrolled students.
          displaced_id: activeDisplaced?.id,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit the request.');
      showToast(data.message || 'Room booked — the slot is now locked.');
      if (activeDisplaced) {
        setDisplaced((prev) => prev.filter((d) => d.id !== activeDisplaced.id));
        setActiveDisplaced(null);
      }
      setModalRoom(null);
      loadHistory();
      search(); // the booked room disappears from the free list immediately
    } catch (err) {
      showToast(err.message, { error: true });
    } finally {
      setSubmitting(false);
    }
  };

  // ---- History actions (cancel / undo / trash) ----
  const patch = async (req, action) => {
    const res = await fetch(`/api/room-booking/requests/${req.id}/`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-CSRFToken': getCsrfToken(),
      },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'That action failed.');
    return data;
  };

  const applyRequest = (req, data) =>
    setRequests((prev) => prev.map((r) => (r.id === req.id ? { ...r, ...data.request } : r)));

  const doCancel = async (req) => {
    setBusyId(req.id);
    try {
      const data = await patch(req, 'cancel');
      applyRequest(req, data);
      showToast(`Room ${req.room_number} request cancelled — the slot is free again.`, {
        actionLabel: 'Undo',
        duration: 6000,
        onAction: () => {
          setToast(null);
          doUndo(data.request);
        },
      });
    } catch (err) {
      showToast(err.message, { error: true, duration: 5000 });
    } finally {
      setBusyId(null);
    }
  };

  const doUndo = async (req) => {
    setBusyId(req.id);
    try {
      const data = await patch(req, 'undo');
      applyRequest(req, data);
      showToast(`Room ${req.room_number} request restored to pending.`);
    } catch (err) {
      showToast(err.message, { error: true, duration: 5000 });
    } finally {
      setBusyId(null);
    }
  };

  const doTrash = async (req) => {
    setBusyId(req.id);
    try {
      await patch(req, 'trash');
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
      showToast(`Room ${req.room_number} request moved to trash.`);
    } catch (err) {
      showToast(err.message, { error: true, duration: 5000 });
    } finally {
      setBusyId(null);
    }
  };

  // Only free / unoccupied rooms are ever shown in the grid.
  const freeRooms = useMemo(() => rooms.filter((r) => r.free), [rooms]);
  const freeCount = freeRooms.length;

  // Close the modal on Escape (backdrop click + Cancel already work). A ref
  // keeps the handler current so a mid-submit Escape still respects submitting.
  const closeModalRef = useRef(closeModal);
  closeModalRef.current = closeModal;
  useEffect(() => {
    if (!modalRoom) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModalRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalRoom]);

  const selectClass =
    'w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Toast */}
      {toast && (
        <div className="fixed right-5 top-5 z-50 flex items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-4 py-3 shadow-xl shadow-black/[0.08] animate-[fadeIn_.3s_ease]">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              toast.error ? 'bg-rose-50 text-rose-500' : 'bg-lime text-charcoal'
            }`}
          >
            <CircleCheckIcon className="h-4 w-4" />
          </span>
          <p className="max-w-[360px] text-[13px] font-semibold text-charcoal">{toast.message}</p>
          {toast.actionLabel && (
            <button
              type="button"
              onClick={toast.onAction}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-ink px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-black"
            >
              <UndoIcon className="h-3.5 w-3.5" />
              {toast.actionLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="ml-1 grid h-6 w-6 place-items-center rounded-md text-gray-400 transition hover:bg-canvas hover:text-charcoal"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        {isTeacher ? 'Faculty portal / Room booking' : 'Student portal / Room availability'}
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[32px]">
            Find Free Classrooms &amp; Reschedule Classes
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Check real-time classroom availability across all departments{isTeacher ? ' and request extra, rescheduled or exam class slots' : ''}.
          </p>
        </div>
        <button
          type="button"
          onClick={isTeacher ? loadHistory : search}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
        >
          <RefreshIcon className="h-4 w-4 text-gray-400 transition group-hover:rotate-180 group-hover:text-lime-deep" />
          Refresh
        </button>
      </div>

      {/* Students are read-only — bookings must come from faculty */}
      {!isTeacher && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 text-sky-600">
            <EyeIcon className="h-5 w-5" />
          </span>
          <p className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-sky-800">
            Notice: Classroom bookings must be requested by a faculty member or department head.
          </p>
        </div>
      )}

      {/* Displaced classes (admin exam override) — pick a replacement room */}
      {isTeacher && displaced.length > 0 && (
        <div className="mt-5 overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 shadow-sm">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <MegaphoneIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-rose-800">
                {displaced.length} class{displaced.length > 1 ? 'es' : ''} displaced by an exam — pick a replacement room
              </p>
              <p className="text-[12px] text-rose-700/80">
                The original room is locked for the exam window. Pick a new free room below for the
                same date and time — students will be notified automatically.
              </p>
            </div>
          </div>
          <div className="border-t border-rose-200/70 bg-white/60">
            {displaced.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 border-b border-rose-100 px-5 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-charcoal">
                    {d.subject} · {d.department} Batch {d.batch} Sec {d.section}
                  </p>
                  <p className="text-[11.5px] text-gray-500">
                    {d.day_label} {fmtDate(d.date)} · {to12h(d.start_time)} – {to12h(d.end_time)} · Room {d.room_number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => applyDisplaced(d)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[11.5px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md"
                >
                  <SearchIcon className="h-3.5 w-3.5" />
                  Pick a free room
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active replacement context chip */}
      {isTeacher && activeDisplaced && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
            <MegaphoneIcon className="h-4 w-4" />
          </span>
          <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-snug text-amber-800">
            Replacing {activeDisplaced.subject} — the search below is filtered to{' '}
            {activeDisplaced.day_label}, {to12h(activeDisplaced.start_time)} – {to12h(activeDisplaced.end_time)}.
            Book any free room to move the class there; students will be notified.
          </p>
        </div>
      )}

      {/* ============ Availability filter ============ */}
      <section className="mt-6 rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
            <SearchIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[15px] font-extrabold tracking-tight text-charcoal">
              Search a weekly time slot
            </h2>
            <p className="text-[12px] text-gray-400">
              Pick a day and time range — rooms with a published class are filtered out automatically.
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {/* Day */}
          <label className="relative block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Day
            </span>
            <select value={day} onChange={(e) => setDay(e.target.value)} className={selectClass}>
              {DAYS.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.label}
                </option>
              ))}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
          </label>

          {/* Start time */}
          <label className="relative block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Start time
            </span>
            <select value={start} onChange={(e) => setStart(e.target.value)} className={selectClass}>
              {START_TIMES.map((t) => (
                <option key={t} value={t}>
                  {to12h(t)}
                </option>
              ))}
              {start && !START_TIMES.includes(start) && (
                <option value={start}>{to12h(start)}</option>
              )}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
          </label>

          {/* End time */}
          <label className="relative block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              End time
            </span>
            <select value={end} onChange={(e) => setEnd(e.target.value)} className={selectClass}>
              {END_TIMES.map((t) => (
                <option key={t} value={t}>
                  {to12h(t)}
                </option>
              ))}
              {end && !END_TIMES.includes(end) && (
                <option value={end}>{to12h(end)}</option>
              )}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
          </label>

          {/* Building — exactly two campus buildings */}
          <label className="relative block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Building (optional)
            </span>
            <select
              value={building}
              onChange={(e) => setBuilding(e.target.value)}
              className={selectClass}
            >
              <option value="">All buildings</option>
              {BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
          </label>

          {/* Search */}
          <div className="flex items-end">
            <button
              type="button"
              onClick={search}
              disabled={searching}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-6 py-2.5 text-[13.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:bg-lime/90 hover:shadow-lg disabled:cursor-wait disabled:opacity-60 md:w-auto xl:w-full"
            >
              <SearchIcon className="h-4 w-4" />
              {searching ? 'Searching…' : 'Search Available Rooms'}
            </button>
          </div>
        </div>

        {/* Selected window chip */}
        <p className="mt-4 inline-flex flex-wrap items-center gap-2 rounded-full bg-ink px-4 py-2 text-[12px] font-bold text-white shadow-md shadow-black/15">
          <ClockIcon className="h-4 w-4 text-lime" />
          {DAYS.find((d) => d.code === day)?.label} · {to12h(start)} – {to12h(end)}
          {building && (
            <>
              <span className="text-white/40">|</span>
              <BuildingIcon className="h-4 w-4 text-lime" />
              {building}
            </>
          )}
        </p>
      </section>

      {/* ============ Availability results ============ */}
      <section className="mt-6">
        {!searched ? (
          <div className="grid min-h-[260px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/50 p-10 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                <RoomBookingIcon className="h-7 w-7" />
              </span>
              <h3 className="mt-4 text-[15px] font-bold text-charcoal">Ready when you are</h3>
              <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
                Set the day and time range above, then hit{' '}
                <span className="font-semibold text-lime-deep">Search Available Rooms</span> to see
                which classrooms are free in that window.
              </p>
            </div>
          </div>
        ) : searching ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-24 animate-pulse rounded bg-black/[0.06]" />
                    <div className="h-3 w-32 animate-pulse rounded bg-black/[0.04]" />
                  </div>
                  <span className="h-6 w-24 animate-pulse rounded-full bg-black/[0.06]" />
                </div>
                <div className="mt-4 h-3 w-20 animate-pulse rounded bg-black/[0.04]" />
                <div className="mt-4 h-9 w-full animate-pulse rounded-xl bg-black/[0.04]" />
              </div>
            ))}
          </div>
        ) : searchError ? (
          <div className="grid min-h-[240px] place-items-center rounded-2xl border border-black/[0.05] bg-white p-10 text-center shadow-sm">
            <div className="max-w-sm">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                <BanIcon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-[15px] font-bold text-charcoal">Search failed</h3>
              <p className="mt-1 text-[12.5px] text-gray-500">{searchError}</p>
              <button
                type="button"
                onClick={search}
                className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
              >
                Try again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-[16px] font-extrabold tracking-tight text-charcoal">
                Available rooms
              </h2>
              <span
                className={`rounded-full px-3 py-1 text-[11.5px] font-bold ring-1 ${
                  freeCount > 0
                    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/10'
                    : 'bg-rose-50 text-rose-600 ring-rose-600/10'
                }`}
              >
                {freeCount} Available Free Rooms
              </span>
            </div>

            {freeRooms.length === 0 ? (
              <div className="grid min-h-[220px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/50 p-10 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-lime/20 text-lime-deep">
                    <RoomBookingIcon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-3 text-[14px] font-bold text-charcoal">
                    No free rooms in this window
                  </h3>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">
                    Try a different day, time range, or building to find an available classroom.
                  </p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {freeRooms.map((room) => (
                  <article
                    key={room.id}
                    className="group rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-lime-deep/30 hover:shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[17px] font-extrabold tracking-tight text-charcoal">
                          Room {room.room_number}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-gray-400">
                          <BuildingIcon className="h-3.5 w-3.5" />
                          {room.building}
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[10.5px] font-bold text-emerald-700 ring-1 ring-emerald-600/10">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Available / Free Slot
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                      <SeatIcon className="h-4 w-4 text-lime-deep" />
                      {room.capacity} Seats
                    </div>

                    {isTeacher ? (
                      <button
                        type="button"
                        onClick={() => openModal(room)}
                        className="mt-4 w-full rounded-xl bg-lime px-4 py-2.5 text-[13px] font-bold text-charcoal shadow-sm shadow-lime/30 transition hover:-translate-y-0.5 hover:shadow-md"
                      >
                        Book Room
                      </button>
                    ) : (
                      <p className="mt-4 flex items-center justify-center gap-2 rounded-xl bg-canvas px-3.5 py-2.5 text-[12px] font-bold text-gray-500">
                        <EyeIcon className="h-4 w-4 shrink-0 text-gray-400" />
                        View Only (Teacher Booking Required)
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* ============ Booking history (faculty only) ============ */}
      {isTeacher && (
      <section className="mt-10">
        <h2 className="text-[16px] font-extrabold tracking-tight text-charcoal">
          My booking requests
        </h2>
        <p className="mt-1 text-[12.5px] text-gray-500">
          Bookings are confirmed instantly and logged for the admin portal — the room stays
          locked until you cancel the booking.
        </p>

        <div className="mt-4 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
          <div className="overflow-x-auto">
            {historyLoading ? (
              <div className="space-y-3 p-5">
                {[0, 1].map((i) => (
                  <div key={i} className="flex items-center gap-4 rounded-xl bg-panel/70 p-4">
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-40 animate-pulse rounded bg-black/[0.06]" />
                      <div className="h-3 w-64 animate-pulse rounded bg-black/[0.04]" />
                    </div>
                  </div>
                ))}
              </div>
            ) : requests.length === 0 ? (
              <div className="grid min-h-[200px] place-items-center p-8 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                    <RoomBookingIcon className="h-6 w-6" />
                  </span>
                  <h3 className="mt-4 text-[15px] font-bold text-charcoal">No requests yet</h3>
                  <p className="mt-1 text-[12.5px] text-gray-500">
                    Search for a free room above and book your first class.
                  </p>
                </div>
              </div>
            ) : (
              <table className="w-full min-w-[860px] border-collapse text-left">
                <thead>
                  <tr className="border-b border-black/[0.05] bg-panel/60">
                    <th className={thClass}>Room No</th>
                    <th className={thClass}>Date &amp; Time</th>
                    <th className={thClass}>Course &amp; Batch</th>
                    <th className={thClass}>Reason</th>
                    <th className={thClass}>Status</th>
                    <th className={`${thClass} text-right`}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => {
                    const meta = REQUEST_STATUS_META[req.status] || REQUEST_STATUS_META.pending;
                    const cancellable = req.status === 'pending' || req.status === 'approved';
                    const isBusy = busyId === req.id;
                    return (
                      <tr
                        key={req.id}
                        className="border-b border-black/[0.04] transition last:border-0 hover:bg-canvas/70"
                      >
                        <td className={tdClass}>
                          <p className="text-[13px] font-bold text-charcoal">Room {req.room_number}</p>
                          <p className="text-[11px] text-gray-400">{req.building}</p>
                        </td>
                        <td className={tdClass}>
                          <p className="text-[12.5px] font-semibold text-charcoal">
                            {fmtDate(req.date)}
                          </p>
                          <p className="text-[11.5px] text-gray-400">
                            {req.day_label}, {to12h(req.start_time)} – {to12h(req.end_time)}
                          </p>
                        </td>
                        <td className={tdClass}>
                          <p className="max-w-[240px] truncate text-[12.5px] font-semibold text-charcoal">
                            {req.subject}
                          </p>
                          <p className="text-[11.5px] text-gray-400">
                            {req.department} · Batch {req.batch} · Sec {req.section}
                          </p>
                        </td>
                        <td className={tdClass}>
                          <span className="text-[12px] font-semibold text-gray-600">
                            {req.reason_label}
                          </span>
                        </td>
                        <td className={tdClass}>
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.pill}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                        </td>
                        <td className={`${tdClass} text-right`}>
                          <div className="flex items-center justify-end gap-1.5">
                            {cancellable ? (
                              <button
                                type="button"
                                disabled={!!busyId}
                                onClick={() => setConfirmCancel(req)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                              >
                                <XIcon className="h-3.5 w-3.5" />
                                {isBusy ? 'Working…' : 'Cancel Request'}
                              </button>
                            ) : req.status === 'cancelled' ? (
                              <button
                                type="button"
                                disabled={!!busyId}
                                onClick={() => doUndo(req)}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[11.5px] font-bold text-charcoal transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md disabled:cursor-wait disabled:opacity-50"
                              >
                                <UndoIcon className="h-3.5 w-3.5 text-lime-deep" />
                                {isBusy ? '…' : 'Undo'}
                              </button>
                            ) : (
                              <span className="text-[11.5px] text-gray-300">—</span>
                            )}
                            <button
                              type="button"
                              disabled={!!busyId}
                              onClick={() => setConfirmTrash(req)}
                              aria-label="Move to trash"
                              title="Move to trash"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.06] text-gray-400 transition hover:border-black/15 hover:text-charcoal disabled:cursor-wait disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </section>
      )}

      {/* ============ Booking request modal ============ */}
      {modalRoom && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="booking-modal-title"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] bg-ink px-6 py-5">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-lime">
                  Instant booking — no approval needed
                </p>
                <h3
                  id="booking-modal-title"
                  className="mt-1 text-[19px] font-extrabold tracking-tight text-white"
                >
                  Confirm Room Booking
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Read-only context: room + date/day */}
            <div className="grid grid-cols-1 gap-2 px-6 pt-5 sm:grid-cols-2">
              <div className="rounded-xl border border-black/[0.06] bg-canvas/70 px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Room
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-extrabold text-charcoal">
                  <RoomBookingIcon className="h-4 w-4 text-lime-deep" />
                  Room {modalRoom.room_number}
                </p>
              </div>
              <div className="rounded-xl border border-black/[0.06] bg-canvas/70 px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Date / Day
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] font-extrabold text-charcoal">
                  <CalendarIcon className="h-4 w-4 text-lime-deep" />
                  {DAYS.find((d) => d.code === day)?.label}, {fmtDate(form.date)}
                </p>
              </div>
            </div>

            {/* Modal form */}
            <div className="grid grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2">
              {/* Start time */}
              <label className="relative block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Start time
                </span>
                <select
                  value={modalStart}
                  onChange={(e) => setModalStart(e.target.value)}
                  disabled={!!activeDisplaced}
                  className={`${selectClass} disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70`}
                >
                  {START_TIMES.map((t) => (
                    <option key={t} value={t}>
                      {to12h(t)}
                    </option>
                  ))}
                  {modalStart && !START_TIMES.includes(modalStart) && (
                    <option value={modalStart}>{to12h(modalStart)}</option>
                  )}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
              </label>

              {/* Duration */}
              <label className="relative block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Duration
                </span>
                <select
                  value={modalDuration}
                  onChange={(e) => setModalDuration(Number(e.target.value))}
                  disabled={!!activeDisplaced}
                  className={`${selectClass} disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70`}
                >
                  {MODAL_DURATIONS.map((d) => (
                    <option key={d.hours} value={d.hours}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
              </label>

              {activeDisplaced && (
                <p className="flex items-center gap-1.5 rounded-xl bg-amber-50 px-3.5 py-2 text-[11.5px] font-semibold text-amber-800 sm:col-span-2">
                  <ClockIcon className="h-3.5 w-3.5 shrink-0" />
                  Replacement must cover the original class time —{' '}
                  {to12h(modalStart)} – {to12h(addHours(modalStart, modalDuration))}.
                </p>
              )}

              {/* Department */}
              <label className="relative block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Department
                </span>
                <select
                  value={form.department}
                  onChange={(e) => {
                    const dept = e.target.value;
                    setForm((f) => ({
                      ...f,
                      department: dept,
                      section: DEPT_SECTIONS[dept]?.[0] || 'A',
                    }));
                  }}
                  className={selectClass}
                >
                  {DEPARTMENTS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
              </label>

              {/* Batch */}
              <label className="relative block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Batch
                </span>
                <select
                  value={form.batch}
                  onChange={(e) => setForm((f) => ({ ...f, batch: e.target.value }))}
                  className={selectClass}
                >
                  {BATCHES.map((b) => (
                    <option key={b} value={b}>
                      Batch {b}
                    </option>
                  ))}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
              </label>

              {/* Section */}
              <label className="relative block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Section
                </span>
                <select
                  value={form.section}
                  onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                  className={selectClass}
                >
                  {sections.map((s) => (
                    <option key={s} value={s}>
                      Section {s}
                    </option>
                  ))}
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
              </label>

              {/* Subject / Course name */}
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Course name
                </span>
                <input
                  type="text"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  placeholder="e.g. CSE-2101 Data Structures"
                  className="w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                />
              </label>
            </div>

            {/* Modal footer */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.05] bg-canvas/60 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
                className="rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitRequest}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
              >
                <CircleCheckIcon className="h-4 w-4" />
                {submitting ? 'Booking…' : 'Confirm Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirmation popup */}
      {confirmCancel && (
        <ConfirmDialog
          open
          busy={!!busyId}
          tone="warning"
          title="Cancel this booking request?"
          message="The request will be marked as cancelled and the room slot will be freed. You can undo this afterwards."
          confirmLabel="Yes, Cancel"
          highlight={`Room ${confirmCancel.room_number} · ${confirmCancel.subject} · ${
            confirmCancel.day_label
          } ${to12h(confirmCancel.start_time)} – ${to12h(confirmCancel.end_time)}`}
          onConfirm={() => {
            const req = confirmCancel;
            setConfirmCancel(null);
            doCancel(req);
          }}
          onCancel={() => setConfirmCancel(null)}
        />
      )}

      {/* Trash confirmation popup */}
      {confirmTrash && (
        <ConfirmDialog
          open
          busy={!!busyId}
          tone="trash"
          title="Move this request to trash?"
          message="It will disappear from your history, its room slot will be freed, and it lands in the admin trash where it can be restored later."
          confirmLabel="Move to Trash"
          highlight={`Room ${confirmTrash.room_number} · ${confirmTrash.subject}`}
          onConfirm={() => {
            const req = confirmTrash;
            setConfirmTrash(null);
            doTrash(req);
          }}
          onCancel={() => setConfirmTrash(null)}
        />
      )}
    </div>
  );
}
