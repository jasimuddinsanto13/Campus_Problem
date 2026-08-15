/** Shared helpers for Class Cancellation (faculty cancel + student alerts). */

/** Cancellation reasons — values match ClassCancellation.Reason in the backend. */
export const CANCEL_REASONS = [
  { id: 'faculty_unavailable', label: 'Faculty Unavailable' },
  { id: 'emergency', label: 'Emergency' },
  { id: 'official_meeting', label: 'Official Department Meeting' },
  { id: 'rescheduled', label: 'Rescheduled to another slot' },
  { id: 'other', label: 'Other' },
];

/** 'YYYY-MM-DD' for the local calendar date (today). */
export function todayISO() {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

/** 'YYYY-MM-DD' -> 'Sat, Aug 15' (today -> 'Today'). */
export function fmtCancellationDate(dateStr) {
  if (!dateStr) return '—';
  if (dateStr === todayISO()) return 'Today';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * True when two zero-padded 'HH:MM' time ranges overlap. String comparison is
 * safe because both sides are normalized to 24-hour zero-padded form.
 */
export function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}
