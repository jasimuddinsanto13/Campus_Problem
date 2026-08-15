/** Shared helpers for the Notice Board (admin page + role dashboard widgets). */

/** Priority -> label + Tailwind pill classes (values match the backend). */
export const PRIORITY_META = {
  normal: {
    label: 'Normal',
    pill: 'bg-gray-100 text-gray-500 ring-gray-400/20',
    dot: 'bg-gray-400',
    bar: 'bg-gray-300',
  },
  important: {
    label: 'Important',
    pill: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    dot: 'bg-amber-500',
    bar: 'bg-amber-400',
  },
  urgent: {
    label: 'Urgent',
    pill: 'bg-rose-50 text-rose-600 ring-rose-600/20',
    dot: 'bg-rose-500',
    bar: 'bg-rose-500',
  },
};

/** Target audience -> display label (values match the backend). */
export const TARGET_LABELS = {
  all: 'All Users',
  faculty: 'Faculty Only',
  student: 'Students Only',
};

/** Target groups offered by the admin notice wizard (Step 1). */
export const AUDIENCE_OPTIONS = [
  { id: 'all', label: 'All Users', sub: 'Faculty & students' },
  { id: 'faculty', label: 'Faculty Only', sub: 'Teachers only' },
  { id: 'student', label: 'Students Only', sub: 'Students only' },
];

/** Batches an admin may target (0..16). */
export const BATCHES = Array.from({ length: 17 }, (_, i) => String(i));

/** Sections each department offers (matches the routine wizard). */
export const SECTIONS_BY_DEPT = {
  CSE: ['A', 'B'],
  EEE: ['A'],
  TE: ['A', 'B', 'C', 'D'],
  IPE: ['A', 'B'],
  FDAE: ['A'],
};

/**
 * Human label for a notice's audience, e.g.
 * "Students Only · CSE · Batch 10 · Sec A" or "All Users".
 */
export function audienceLabel(notice) {
  const base = TARGET_LABELS[notice.target_role] || notice.target_label || '—';
  const bits = [];
  if (notice.department) bits.push(notice.department);
  if (notice.batch) bits.push(`Batch ${notice.batch}`);
  if (notice.section) bits.push(`Sec ${notice.section}`);
  return bits.length ? `${base} · ${bits.join(' · ')}` : base;
}

/** True when the notice was posted within the last `hours` (new dot). */
export function isNewNotice(createdAtIso, hours = 72) {
  if (!createdAtIso) return false;
  const age = Date.now() - new Date(createdAtIso).getTime();
  return Number.isFinite(age) && age >= 0 && age < hours * 3600 * 1000;
}

/** ISO timestamp -> 'Aug 12, 2026, 9:30 AM' style string. */
export function fmtNoticeDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}
