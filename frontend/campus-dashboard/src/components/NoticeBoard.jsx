import { useCallback, useEffect, useState } from 'react';
import {
  PRIORITY_META,
  TARGET_LABELS,
  fmtNoticeDate,
  isNewNotice,
} from '../lib/notices';
import {
  ArrowRightIcon,
  DownloadIcon,
  MegaphoneIcon,
  PaperClipIcon,
  PinIcon,
  RefreshIcon,
  XIcon,
} from './Icons';

const NEW_HOURS = 72; // a notice posted within this window gets the new dot

export default function NoticeBoard({ variant = 'faculty', limit = 5 }) {
  const [notices, setNotices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // notice being read

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notices/${variant}/`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load notices.');
      const rows = data.notices || [];
      // Urgent first (red accent at the top), then pinned, then newest.
      const rank = (n) =>
        (n.priority === 'urgent' ? 0 : n.pinned ? 1 : 2) * -1;
      setNotices([...rows].sort((a, b) => rank(a) - rank(b) || b.id - a.id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [variant]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = notices.slice(0, limit);
  const urgentCount = notices.filter((n) => n.priority === 'urgent').length;

  return (
    <section className="animate-[fadeIn_.35s_ease]">
      {/* Widget header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
            <MegaphoneIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[16px] font-extrabold tracking-tight text-charcoal">
              Notice Board
            </h2>
            <p className="text-[12px] text-gray-400">
              {urgentCount > 0
                ? `${urgentCount} urgent · latest from the admin office`
                : 'Announcements from the admin office'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-gray-500 shadow-sm transition hover:text-charcoal hover:shadow-md"
        >
          <RefreshIcon className="h-3.5 w-3.5 transition group-hover:rotate-180" />
          Refresh
        </button>
      </div>

      {/* Cards */}
      <div className="mt-4 space-y-3">
        {loading ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="h-3 w-52 animate-pulse rounded bg-black/[0.06]" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-black/[0.06]" />
              </div>
              <div className="mt-3 h-3 w-40 animate-pulse rounded bg-black/[0.04]" />
            </div>
          ))
        ) : error ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-5 text-center">
            <p className="text-[13px] font-semibold text-rose-600">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-black"
            >
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="grid min-h-[140px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/50 p-6 text-center">
            <div className="max-w-xs">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-lime/20 text-lime-deep">
                <MegaphoneIcon className="h-5 w-5" />
              </span>
              <p className="mt-3 text-[13px] font-bold text-charcoal">No notices for you yet</p>
              <p className="mt-0.5 text-[12px] text-gray-500">
                New announcements targeting you will show up here.
              </p>
            </div>
          </div>
        ) : (
          visible.map((n) => {
            const meta = PRIORITY_META[n.priority] || PRIORITY_META.normal;
            const urgent = n.priority === 'urgent';
            const newDot = isNewNotice(n.created_at, NEW_HOURS);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelected(n)}
                className={`group relative w-full overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                  urgent
                    ? 'border-rose-200 hover:border-rose-300'
                    : 'border-black/[0.05] hover:border-lime-deep/30'
                }`}
              >
                {/* Urgent left accent bar */}
                {urgent && (
                  <span className="absolute inset-y-0 left-0 w-1 bg-rose-500" aria-hidden="true" />
                )}

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
                      {newDot && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lime-deep opacity-60" />
                      )}
                      <span
                        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
                          newDot ? 'bg-lime-deep' : 'bg-transparent ring-1 ring-gray-300'
                        }`}
                      />
                    </span>
                    <p className="min-w-0 text-[14px] font-extrabold leading-snug tracking-tight text-charcoal">
                      {n.pinned && (
                        <PinIcon className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-amber-500" />
                      )}
                      {n.title}
                    </p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ring-1 ${meta.pill}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-[11.5px] text-gray-400">
                  <span>{fmtNoticeDate(n.created_at)}</span>
                  {(n.department || n.batch || n.section) && (
                    <span className="rounded-full bg-ink/5 px-2 py-0.5 font-bold text-charcoal">
                      {[n.department, n.batch && `Batch ${n.batch}`, n.section && `Sec ${n.section}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                  {newDot && <span className="font-bold text-lime-deep">New</span>}
                </div>

                <span className="mt-2.5 inline-flex items-center gap-1 pl-5 text-[11.5px] font-bold text-lime-deep opacity-0 transition group-hover:opacity-100">
                  View details
                  <ArrowRightIcon className="h-3 w-3 transition group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })
        )}

        {!loading && !error && notices.length > limit && (
          <button
            type="button"
            onClick={() => setSelected({ __all: true })}
            className="w-full rounded-xl border border-dashed border-black/10 py-2.5 text-[12px] font-bold text-gray-500 transition hover:border-lime-deep/40 hover:text-lime-deep"
          >
            View all {notices.length} notices
          </button>
        )}
      </div>

      {/* Detail modal */}
      {selected && !selected.__all && (
        <NoticeDetail
          notice={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Full list modal */}
      {selected && selected.__all && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="all-notices-title"
          onClick={() => setSelected(null)}
        >
          <div
            className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-4 border-b border-black/[0.05] bg-ink px-6 py-5">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-lime">
                  Notice board
                </p>
                <h3 id="all-notices-title" className="mt-1 text-[19px] font-extrabold tracking-tight text-white">
                  All notices ({notices.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[70vh] space-y-3 overflow-y-auto px-6 py-5">
              {notices.map((n) => {
                const meta = PRIORITY_META[n.priority] || PRIORITY_META.normal;
                const urgent = n.priority === 'urgent';
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setSelected(n)}
                    className={`group relative w-full overflow-hidden rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      urgent ? 'border-rose-200' : 'border-black/[0.05]'
                    }`}
                  >
                    {urgent && (
                      <span className="absolute inset-y-0 left-0 w-1 bg-rose-500" aria-hidden="true" />
                    )}
                    <div className="flex items-start justify-between gap-3 pl-2">
                      <p className="min-w-0 text-[13.5px] font-extrabold tracking-tight text-charcoal">
                        {n.pinned && (
                          <PinIcon className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-amber-500" />
                        )}
                        {n.title}
                      </p>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ring-1 ${meta.pill}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1.5 pl-2 text-[11.5px] text-gray-400">{fmtNoticeDate(n.created_at)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Full notice reader — used by both the faculty and student widgets. */
function NoticeDetail({ notice, onClose }) {
  const meta = PRIORITY_META[notice.priority] || PRIORITY_META.normal;
  const scopeBits = [
    notice.department,
    notice.batch && `Batch ${notice.batch}`,
    notice.section && `Sec ${notice.section}`,
  ].filter(Boolean);
  const audience = scopeBits.length
    ? `${TARGET_LABELS[notice.target_role] || notice.target_label} · ${scopeBits.join(' · ')}`
    : notice.target_label;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="notice-detail-title"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] bg-ink px-6 py-5">
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-lime">
              {audience} · {fmtNoticeDate(notice.created_at)}
            </p>
            <h3 id="notice-detail-title" className="mt-1 text-[19px] font-extrabold leading-snug tracking-tight text-white">
              {notice.title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Meta chips */}
        <div className="flex flex-wrap gap-2 px-6 pt-5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
          {notice.pinned && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700 ring-1 ring-amber-600/20">
              <PinIcon className="h-3 w-3" />
              Pinned
            </span>
          )}
          {(notice.department || notice.batch || notice.section) && (
            <span className="inline-flex items-center rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-charcoal">
              {[notice.department, notice.batch && `Batch ${notice.batch}`, notice.section && `Sec ${notice.section}`]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-gray-500">
            Posted by {notice.author}
          </span>
        </div>

        {/* Body */}
        <div className="max-h-[46vh] overflow-y-auto px-6 py-5">
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-gray-700">
            {notice.content}
          </p>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.05] bg-canvas/60 px-6 py-4">
          {notice.attachment_url ? (
            <a
              href={notice.attachment_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <DownloadIcon className="h-4 w-4" />
              Download {notice.attachment_name || 'attachment'}
            </a>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-400">
              <PaperClipIcon className="h-3.5 w-3.5" />
              No attachment
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
