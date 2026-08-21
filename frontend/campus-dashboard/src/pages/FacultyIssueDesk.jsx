import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  BanIcon,
  BuildingIcon,
  CaretDownIcon,
  CircleCheckIcon,
  ClockIcon,
  IssueDeskIcon,
  PaperClipIcon,
  RefreshIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '../components/Icons';
import { useUser } from '../context/UserContext';
import { getCsrfToken } from '../lib/csrf';
import {
  ACCEPTED_ATTACHMENT_EXTENSIONS,
  ACCEPTED_ATTACHMENT_TYPES,
  ISSUE_BUILDINGS,
  ISSUE_CATEGORIES,
  ISSUE_STATUS_META,
  fmtIssueDate,
  validateAttachmentFile,
} from '../lib/issues';

const EMPTY_FORM = {
  category: 'campus_life',
  building: '',
  room: '',
  title: '',
  description: '',
};

const selectClass =
  'w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';
const inputClass =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

export default function FacultyIssueDesk() {
  const { fullName } = useUser();

  // ---- Submission form ----
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [attachment, setAttachment] = useState(null); // File | null
  const [attachmentError, setAttachmentError] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  // ---- Outbox ----
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [deleting, setDeleting] = useState(null); // issue row pending delete
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  // ---- Outbox fetch (real-time: polled + manual refresh) ----
  const loadIssues = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/issues/my-issues/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load your issues.');
      setIssues(data.issues || []);
      setLoadError(null);
    } catch (err) {
      if (!silent) setLoadError(err.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadIssues();
    // Light polling keeps the status badges in sync with the admin portal
    // ("real-time" outbox) without a page reload.
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') loadIssues(true);
    }, 15000);
    const onRefresh = () => loadIssues();
    window.addEventListener('app:refresh', onRefresh);
    return () => {
      clearInterval(id);
      window.removeEventListener('app:refresh', onRefresh);
    };
  }, [loadIssues]);

  // The Topbar's "+ Report Issue" action scrolls to the form and focuses the
  // title field — no navigation needed, everything stays on this page.
  const formRef = useRef(null);
  const titleRef = useRef(null);
  useEffect(() => {
    const focusForm = () => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => titleRef.current?.focus(), 350);
    };
    window.addEventListener('issue:focus-form', focusForm);
    return () => window.removeEventListener('issue:focus-form', focusForm);
  }, []);

  // ---- Attachment dropzone ----
  const pickAttachment = (file) => {
    if (!file) return;
    const error = validateAttachmentFile(file);
    if (error) {
      setAttachmentError(error);
      return;
    }
    setAttachment(file);
    setAttachmentError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    pickAttachment(e.dataTransfer.files?.[0]);
  };

  // ---- Submit ----
  const submit = async () => {
    if (!form.title.trim()) return showToast('Enter a title for the issue.', true);
    if (!form.building) return showToast('Pick a location / building.', true);
    if (!form.description.trim()) return showToast('Describe the issue in detail.', true);
    const attachmentErrorText = attachment ? validateAttachmentFile(attachment) : null;
    if (attachmentErrorText) return showToast(attachmentErrorText, true);

    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('category', form.category);
      body.append('building', form.building);
      body.append('room', form.room.trim());
      body.append('title', form.title.trim());
      body.append('description', form.description.trim());
      if (attachment) body.append('attachment', attachment);

      const res = await fetch('/api/issues/create/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit the issue.');
      setForm({ ...EMPTY_FORM, category: form.category });
      setAttachment(null);
      setAttachmentError(null);
      showToast(data.message || 'Issue submitted — awaiting admin review.');
      await loadIssues(true);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Delete ----
  const doDelete = async () => {
    if (!confirmDelete) return;
    const issue = confirmDelete;
    setConfirmDelete(null);
    setDeleting(issue.id);
    try {
      const res = await fetch(`/api/issues/${issue.id}/`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the issue.');
      setIssues((prev) => prev.filter((i) => i.id !== issue.id));
      showToast(data.message || 'Issue record deleted.');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setDeleting(null);
    }
  };

  const counts = {
    total: issues.length,
    pending: issues.filter((i) => i.status === 'pending').length,
    inProgress: issues.filter((i) => i.status === 'in_progress').length,
    resolved: issues.filter((i) => i.status === 'resolved').length,
  };

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Toast */}
      {toast && (
        <div className="fixed right-3 top-5 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-3 py-3 shadow-xl shadow-black/[0.08] animate-[fadeIn_.3s_ease] sm:right-5 sm:px-4">
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${
              toast.error ? 'bg-rose-50 text-rose-500' : 'bg-lime text-charcoal'
            }`}
          >
            <CircleCheckIcon className="h-4 w-4" />
          </span>
          <p className="max-w-[420px] text-[13px] font-semibold text-charcoal">{toast.message}</p>
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
        Faculty portal / Issue desk
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
            Campus Issue Desk
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-gray-500">
            Report infrastructure problems — broken projectors, AC faults, cleanliness issues or
            anything else on campus — and track them through to resolution. Your submissions go
            straight to the admin portal.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadIssues()}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
        >
          <RefreshIcon className="h-4 w-4 text-gray-400 transition group-hover:rotate-180 group-hover:text-lime-deep" />
          Refresh
        </button>
      </div>

      {/* Submit form */}
      <section ref={formRef} className="mt-6 scroll-mt-24 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-black/[0.05] bg-ink px-6 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime">
            <IssueDeskIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[16px] font-extrabold tracking-tight text-white">
              Report a Campus / Facility Issue
            </h2>
            <p className="text-[11.5px] text-white/60">
              The more detail you add, the faster the admin team can act.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
          {/* Category */}
          <label className="relative block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Issue category
            </span>
            <select
              name="category"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={selectClass}
            >
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
          </label>

          {/* Location / building */}
          <label className="relative block">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Location / building
            </span>
            <select
              name="building"
              value={form.building}
              onChange={(e) => setForm((f) => ({ ...f, building: e.target.value }))}
              className={selectClass}
            >
              <option value="">Select a building…</option>
              {ISSUE_BUILDINGS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
          </label>

          {/* Room / specific area */}
          <label className="relative block sm:col-span-2">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Room / specific area <span className="normal-case text-gray-300">· optional</span>
            </span>
            <div className="relative">
              <BuildingIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                type="text"
                name="room"
                value={form.room}
                onChange={(e) => setForm((f) => ({ ...f, room: e.target.value }))}
                placeholder="e.g. Room 302, 2nd floor washroom, near the main gate…"
                className={`${inputClass} pl-10`}
              />
            </div>
          </label>

          {/* Title */}
          <label className="relative block sm:col-span-2">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Issue title
            </span>
            <input
              ref={titleRef}
              type="text"
              name="title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Sound system not working in Room 302"
              className={inputClass}
            />
          </label>

          {/* Description */}
          <label className="relative block sm:col-span-2">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Detailed description
            </span>
            <textarea
              name="description"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={4}
              placeholder="Explain what's wrong, when you noticed it, and any other context that will help the admin team fix it faster…"
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </label>

          {/* Attachment dropzone */}
          <div className="sm:col-span-2">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Attachment <span className="normal-case text-gray-300">· optional photo or document</span>
            </span>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className={`group cursor-pointer rounded-xl border-2 border-dashed px-5 py-6 text-center transition ${
                dragOver
                  ? 'border-lime-deep/60 bg-lime/10'
                  : attachment
                    ? 'border-lime-deep/40 bg-lime/5'
                    : 'border-black/12 bg-canvas/60 hover:border-lime-deep/40 hover:bg-lime/5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={[...ACCEPTED_ATTACHMENT_TYPES, ...ACCEPTED_ATTACHMENT_EXTENSIONS].join(',')}
                onChange={(e) => {
                  pickAttachment(e.target.files?.[0]);
                  e.target.value = '';
                }}
                className="sr-only"
              />
              {attachment ? (
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-[12.5px] font-bold text-charcoal shadow-sm ring-1 ring-black/[0.06]">
                    <PaperClipIcon className="h-4 w-4 text-lime-deep" />
                    <span className="max-w-[260px] truncate">{attachment.name}</span>
                    <span className="text-[10.5px] font-semibold text-gray-400">
                      {(attachment.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAttachment(null);
                    }}
                    className="grid h-7 w-7 place-items-center rounded-lg bg-rose-50 text-rose-500 transition hover:bg-rose-100"
                    aria-label="Remove attachment"
                  >
                    <XIcon className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <div>
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl bg-white text-gray-400 shadow-sm ring-1 ring-black/[0.05] transition group-hover:text-lime-deep">
                    <UploadIcon className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-[13px] font-bold text-charcoal">
                    {dragOver ? 'Drop the file here' : 'Drag & drop a file, or click to browse'}
                  </p>
                  <p className="mt-1 text-[11.5px] text-gray-400">
                    Photos (JPG, PNG) or documents (PDF, DOCX) · up to 10 MB
                  </p>
                </div>
              )}
            </div>
            {attachmentError && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-rose-500">
                <BanIcon className="h-3.5 w-3.5" />
                {attachmentError}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] bg-canvas/60 px-6 py-4">
          <p className="flex items-center gap-1.5 text-[11.5px] text-gray-400">
            <ClockIcon className="h-3.5 w-3.5" />
            Submitted by {fullName || 'you'} — the admin team is notified immediately.
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C4F135] px-6 py-3 text-[13.5px] font-semibold text-black shadow-md shadow-lime/30 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-wait disabled:opacity-60"
          >
            <IssueDeskIcon className="h-4 w-4" />
            {submitting ? 'Submitting…' : 'Submit Issue to Admin'}
          </button>
        </div>
      </section>

      {/* Outbox */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-extrabold tracking-tight text-charcoal">
              My Submitted Issues
            </h2>
            <p className="mt-0.5 text-[12.5px] text-gray-500">
              Live view of your reports — status updates from the admin appear here automatically.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {[
              { key: 'total', label: 'Total', value: counts.total, cls: 'bg-ink/5 text-charcoal' },
              { key: 'pending', label: 'Pending', value: counts.pending, cls: 'bg-amber-50 text-amber-700' },
              { key: 'inProgress', label: 'In progress', value: counts.inProgress, cls: 'bg-sky-50 text-sky-700' },
              { key: 'resolved', label: 'Resolved', value: counts.resolved, cls: 'bg-emerald-50 text-emerald-700' },
            ].map((c) => (
              <span
                key={c.key}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold ${c.cls}`}
              >
                {c.value} {c.label}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {loading ? (
            [0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-24 animate-pulse rounded bg-black/[0.06]" />
                  <div className="h-4 w-32 animate-pulse rounded bg-black/[0.04]" />
                  <div className="ml-auto h-8 w-8 animate-pulse rounded-lg bg-black/[0.04]" />
                </div>
                <div className="mt-3 h-4 w-3/4 animate-pulse rounded bg-black/[0.06]" />
                <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-black/[0.04]" />
              </div>
            ))
          ) : loadError ? (
            <div className="grid min-h-[220px] place-items-center rounded-2xl border border-black/[0.05] bg-white p-8 text-center shadow-sm">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                  <BanIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">Couldn't load your issues</h3>
                <p className="mt-1 text-[12.5px] text-gray-500">{loadError}</p>
                <button
                  type="button"
                  onClick={() => loadIssues()}
                  className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : issues.length === 0 ? (
            <div className="grid min-h-[220px] place-items-center rounded-2xl border border-black/[0.05] bg-white p-8 text-center shadow-sm">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                  <IssueDeskIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">No issues submitted yet</h3>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  Use the form above to report the first campus issue — it will show up here the
                  moment it's sent.
                </p>
              </div>
            </div>
          ) : (
            issues.map((issue) => {
              const meta = ISSUE_STATUS_META[issue.status] || ISSUE_STATUS_META.pending;
              const busy = deleting === issue.id;
              return (
                <article
                  key={issue.id}
                  className="group rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-lime-deep/25 hover:shadow-md"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="rounded-lg bg-ink/5 px-2.5 py-1 font-mono text-[11px] font-bold tracking-wide text-charcoal">
                      {issue.ticket_id}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.pill}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                      {meta.emoji} {meta.label}
                    </span>
                    <button
                      type="button"
                      disabled={!!deleting}
                      onClick={() => setConfirmDelete(issue)}
                      title="Delete this issue record"
                      className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 opacity-60 transition hover:bg-rose-100 hover:text-rose-600 group-hover:opacity-100 disabled:cursor-wait disabled:opacity-40"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <h3 className="mt-3 text-[15px] font-bold leading-snug tracking-tight text-charcoal">
                    {issue.title}
                  </h3>

                  <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500 line-clamp-2">
                    {issue.description}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-gray-400">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2.5 py-1 text-charcoal ring-1 ring-black/[0.05]">
                      {issue.category_label}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <BuildingIcon className="h-3.5 w-3.5 text-lime-deep" />
                      {issue.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon className="h-3.5 w-3.5 text-lime-deep" />
                      {fmtIssueDate(issue.created_at)}
                    </span>
                    {issue.attachment_url && (
                      <a
                        href={issue.attachment_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-lime-deep underline decoration-lime-deep/30 underline-offset-2 transition hover:decoration-lime-deep"
                      >
                        <PaperClipIcon className="h-3.5 w-3.5" />
                        {issue.attachment_name}
                      </a>
                    )}
                  </div>

                  {issue.admin_response && (
                    <div className="mt-3 rounded-xl border border-black/[0.05] bg-canvas/70 px-3.5 py-3">
                      <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                        Admin response
                      </p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-charcoal">
                        {issue.admin_response}
                      </p>
                    </div>
                  )}
                </article>
              );
            })
          )}
        </div>
      </section>

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          open
          busy={!!deleting}
          tone="danger"
          title="Delete this issue record?"
          message="The report and any attached file will be permanently removed from your outbox. This cannot be undone."
          confirmLabel="Delete Issue"
          highlight={`${confirmDelete.ticket_id} — ${confirmDelete.title}`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
