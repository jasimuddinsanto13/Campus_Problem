/** Shared helpers for the Faculty + Admin room-booking pages. */

/** Booking purposes offered in the request modal (values match the backend). */
export const REASONS = [
  { id: 'extra', label: 'Extra Class' },
  { id: 'makeup', label: 'Rescheduled Class' },
  { id: 'exam', label: 'Exam/Quiz' },
];

/** Purposes in the admin "Create New Booking" modal (values match the backend). */
export const BOOKING_PURPOSES = [
  { id: 'exam', label: 'Exam / Quiz', note: 'Overrides a scheduled class if needed' },
  { id: 'event', label: 'Special Event', note: 'Department / campus event' },
  { id: 'extra', label: 'Extra Class', note: 'Additional class for a batch' },
];

/** Status -> label + Tailwind pill classes (values match the backend). */
export const REQUEST_STATUS_META = {
  pending: {
    label: 'Pending Admin Approval',
    pill: 'bg-amber-50 text-amber-700 ring-amber-600/10',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'Approved',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'Rejected',
    pill: 'bg-rose-50 text-rose-600 ring-rose-600/10',
    dot: 'bg-rose-500',
  },
  cancelled: {
    label: 'Cancelled',
    pill: 'bg-gray-100 text-gray-500 ring-gray-400/10',
    dot: 'bg-gray-400',
  },
};

export const thClass =
  'px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400';
export const tdClass = 'px-4 py-3.5 align-middle';

/** Weekday code (SUN..SAT) -> the next calendar date with that weekday. */
export function nextOccurrence(day) {
  const codeToJs = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const target = codeToJs[day] ?? 0;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (target - today.getDay() + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + delta);
  const y = next.getFullYear();
  const m = String(next.getMonth() + 1).padStart(2, '0');
  const d = String(next.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> 'Sat, Aug 15, 2026' */
export function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/** 'HH:MM' + hours -> 'HH:MM' (rounded to the nearest half hour). */
export function addHours(start, hours) {
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + Math.round(hours * 60);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' -> weekday code 'SUN'..'SAT' ('' when invalid). */
export function dayFromDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][date.getDay()];
}

/** Next calendar date that is not a Friday (the booking grid has no Fridays). */
export function nextBookingDate() {
  const now = new Date();
  for (let i = 1; i <= 9; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() !== 5) {
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${m}-${dd}`;
    }
  }
  return now.toISOString().slice(0, 10);
}
