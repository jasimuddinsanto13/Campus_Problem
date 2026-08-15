/** Shared helpers for the Campus Issue Desk (faculty + admin pages). */

/** Issue categories offered by the submission form (values match the backend). */
export const ISSUE_CATEGORIES = [
  { id: 'campus_life', label: 'Campus Life & Amenities' },
  { id: 'classroom_equipment', label: 'Classroom / Lab Equipment' },
  { id: 'electrical', label: 'Electrical / AC Fault' },
  { id: 'cleanliness', label: 'Cleanliness & Sanitation' },
  { id: 'other', label: 'Other' },
];

/** Buildings offered by the location dropdown on the form. */
export const ISSUE_BUILDINGS = [
  'Academic Building 1',
  'Academic Building 2',
  'Campus Grounds',
  'Library',
  'Cafeteria',
];

/** Files the attachment uploader accepts (JPG/PNG photos, PDF/DOCX docs). */
export const ACCEPTED_ATTACHMENT_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
export const ACCEPTED_ATTACHMENT_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.pdf',
  '.doc',
  '.docx',
];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB — matches the backend

/** Status -> label + emoji + Tailwind pill classes (values match the backend). */
export const ISSUE_STATUS_META = {
  pending: {
    label: 'Pending Admin Review',
    emoji: '🟡',
    pill: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'In Progress',
    emoji: '🔵',
    pill: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    dot: 'bg-sky-500',
  },
  resolved: {
    label: 'Resolved',
    emoji: '🟢',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    dot: 'bg-emerald-500',
  },
};

/** Validate a file against the allowed JPG/PNG/PDF/DOC/DOCX types. */
export function validateAttachmentFile(file) {
  if (!file) return null;
  if (file.size > MAX_ATTACHMENT_BYTES) return 'Attachment must be 10MB or smaller.';
  const name = (file.name || '').toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  const okType = ACCEPTED_ATTACHMENT_TYPES.includes(file.type);
  const okExt = ACCEPTED_ATTACHMENT_EXTENSIONS.includes(ext);
  if (!okType && !okExt) {
    return 'Attach a JPG/PNG photo or a PDF/DOC/DOCX document.';
  }
  return null;
}

/** ISO timestamp -> 'Aug 12, 2026, 9:30 AM' style string. */
export function fmtIssueDate(iso) {
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
