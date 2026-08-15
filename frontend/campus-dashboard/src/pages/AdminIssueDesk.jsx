import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BanIcon,
  BuildingIcon,
  CaretDownIcon,
  CircleCheckIcon,
  ClockIcon,
  IssueDeskIcon,
  PaperClipIcon,
  RefreshIcon,
  SearchIcon,
  XIcon,
} from '../components/Icons';
import { getCsrfToken } from '../lib/csrf';
import {
  ISSUE_CATEGORIES,
  ISSUE_STATUS_META,
  fmtIssueDate,
} from '../lib/issues';

const selectClass =
  'w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';
const inputClass =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

/** Status filter pills ('' = all). Values match the backend. */
const STATUS_TABS = [
  { id: '', label: 'All' },
  { id: 'pending', label: '🟡 Pending' },
  { id: 'in_progress', label: '🔵 In Progress' },
  { id: 'resolved', label: '🟢 Resolved' },
];

export default function AdminIssueDesk() {
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ---- Filters ----
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');

  // ---- Per-row editing state ----
  const [drafts, setDrafts] = useState({}); // issueId -> admin_response draft
  const [saving, setSaving] = useState(null); // { id, kind: 'status' | 'response' } | null

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = useCallback((message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3600);
  }, []);

  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (category) params.set('category', category);
      const res = await fetch(`/api/admin/issues/?${params}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== reqSeq.current) return;
      if (!res.ok) throw new Error(data.error || 'Could not load issues.');
      setIssues(data.issues || []);
    } catch (err) {
      if (seq === reqSeq.current) setLoadError(err.message);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [status, category]);

  useEffect(() => {
    load();
  }, [load]);

  // Topbar refresh button re-fetches the table.
  useEffect(() => {
    const onRefresh = () => {
      load();
      window.dispatchEvent(new CustomEvent('app:refresh-handled'));
    };
    window.addEventListener('app:refresh', onRefresh);
    return () => window.removeEventListener('app:refresh', onRefresh);
  }, [load]);

  // ---- Row updates ----
  const patchIssue = async (issue, patch) => {
    setSaving({ id: issue.id, kind: patch.status ? 'status' : 'response' });
    try {
      const res = await fetch(`/api/admin/issues/${issue.id}/`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update the issue.');
      setIssues((prev) => prev.map((i) => (i.id === issue.id ? { ...i, ...data.issue } : i)));
      if (patch.status) {
        showToast(`Status updated to ${data.issue.status_label} — the reporter sees it instantly.`);
      } else {
        showToast("Admin response saved — visible on the reporter's outbox.");
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSaving(null);
    }
  };

  const changeStatus = async (issue, value) => {
    if (value === issue.status) return;
    await patchIssue(issue, { status: value });
    // When a status filter is active, a row moved out of it should leave the
    // view instead of lingering as a stale entry.
    if (status && value !== status) load();
  };

  const saveResponse = (issue) => {
    const draft = (drafts[issue.id] ?? issue.admin_response ?? '').trim();
    if (draft === (issue.admin_response ?? '').trim()) return;
    patchIssue(issue, { admin_response: draft });
  };

  // Client-side search over the filtered rows.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter((i) =>
      `${i.ticket_id} ${i.title} ${i.reporter} ${i.location} ${i.category_label}`
        .toLowerCase()
        .includes(q),
    );
  }, [issues, query]);

  const counts = useMemo(
    () => ({
      total: issues.length,
      pending: issues.filter((i) => i.status === 'pending').length,
      inProgress: issues.filter((i) => i.status === 'in_progress').length,
      resolved: issues.filter((i) => i.status === 'resolved').length,
    }),
    [issues],
  );

  const KPIS = [
    { label: 'Total Issues', value: counts.total, badge: 'bg-lime/25 text-lime-deep', accent: 'border-lime' },
    { label: 'Pending Review', value: counts.pending, badge: 'bg-amber-50 text-amber-600', accent: 'border-amber-300' },
    { label: 'In Progress', value: counts.inProgress, badge: 'bg-sky-50 text-sky-600', accent: 'border-sky-300' },
    { label: 'Resolved', value: counts.resolved, badge: 'bg-emerald-50 text-emerald-600', accent: 'border-emerald-300' },
  ];

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
        Admin portal / Issue desk
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[32px]">
            Issue Desk
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-gray-500">
            Every campus issue reported by faculty and students lands here. Update the status or
            leave a response — the reporter's outbox reflects it instantly.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
        >
          <RefreshIcon className="h-4 w-4 text-gray-400 transition group-hover:rotate-180 group-hover:text-lime-deep" />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <article
            key={kpi.label}
            className={`rounded-2xl border border-black/5 border-t-4 ${kpi.accent} bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
          >
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
              {kpi.label}
            </p>
            <p className="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-charcoal">
              {kpi.value}
            </p>
          </article>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-6 rounded-2xl border border-black/[0.05] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl bg-panel/70 p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setStatus(t.id)}
                className={`rounded-lg px-3.5 py-2 text-[12px] font-bold transition ${
                  status === t.id
                    ? 'bg-lime text-charcoal shadow-sm shadow-lime/40'
                    : 'text-gray-500 hover:text-charcoal'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="hidden h-6 w-px bg-black/[0.06] sm:block" />

          {/* Category filter */}
          <label className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="appearance-none rounded-xl border border-black/[0.08] bg-white py-2 pl-3.5 pr-8 text-[12.5px] font-bold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
            >
              <option value="">All categories</option>
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <CaretDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </label>

          {/* Search */}
          <div className="relative ml-auto w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket, title, reporter…"
              className="w-full rounded-xl border border-black/[0.08] bg-white py-2 pl-9 pr-3.5 text-[12.5px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
            />
          </div>
        </div>
      </div>

      {/* Issues table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl bg-panel/70 p-4">
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 animate-pulse rounded bg-black/[0.06]" />
                    <div className="h-3 w-64 animate-pulse rounded bg-black/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="grid min-h-[260px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                  <BanIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">Couldn't load issues</h3>
                <p className="mt-1 text-[12.5px] text-gray-500">{loadError}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                  <IssueDeskIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">
                  {issues.length === 0 ? 'No issues submitted yet' : 'No matches for your filters'}
                </h3>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {issues.length === 0
                    ? 'Faculty-submitted campus issues will appear here for review.'
                    : 'Try a different status, category or search keyword.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[1100px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.05] bg-panel/60">
                  {['Ticket', 'Reported by', 'Category & Location', 'Submitted', 'Status', 'Admin Response', 'Attachment'].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((issue) => {
                  const meta = ISSUE_STATUS_META[issue.status] || ISSUE_STATUS_META.pending;
                  const draft = drafts[issue.id] ?? issue.admin_response ?? '';
                  const draftChanged = draft.trim() !== (issue.admin_response ?? '').trim();
                  const isSavingStatus = saving?.id === issue.id && saving.kind === 'status';
                  const isSavingResponse = saving?.id === issue.id && saving.kind === 'response';
                  return (
                    <tr
                      key={issue.id}
                      className="border-b border-black/[0.04] transition last:border-0 hover:bg-canvas/70"
                    >
                      {/* Ticket */}
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-mono text-[11.5px] font-bold tracking-wide text-lime-deep">
                          {issue.ticket_id}
                        </p>
                        <p className="mt-1 max-w-[240px] text-[13px] font-bold leading-snug text-charcoal">
                          {issue.title}
                        </p>
                        <p className="mt-1 max-w-[240px] text-[11.5px] leading-relaxed text-gray-500">
                          {issue.description}
                        </p>
                      </td>

                      {/* Reported by */}
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-[12.5px] font-bold text-charcoal">{issue.reporter}</p>
                        <p className="mt-0.5 text-[11px] text-gray-400">
                          {fmtIssueDate(issue.created_at)}
                        </p>
                      </td>

                      {/* Category & location */}
                      <td className="px-4 py-3.5 align-top">
                        <span className="inline-flex max-w-[200px] items-center rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-charcoal">
                          <span className="truncate">{issue.category_label}</span>
                        </span>
                        <p className="mt-2 flex items-center gap-1.5 text-[11.5px] font-semibold text-gray-500">
                          <BuildingIcon className="h-3.5 w-3.5 shrink-0 text-lime-deep" />
                          <span className="max-w-[170px]">{issue.location}</span>
                        </p>
                      </td>

                      {/* Submitted */}
                      <td className="px-4 py-3.5 align-top">
                        <p className="flex items-center gap-1.5 whitespace-nowrap text-[11.5px] font-semibold text-gray-500">
                          <ClockIcon className="h-3.5 w-3.5 text-lime-deep" />
                          {fmtIssueDate(issue.created_at)}
                        </p>
                      </td>

                      {/* Status (inline update) */}
                      <td className="px-4 py-3.5 align-top">
                        <label className="relative block">
                          <select
                            value={issue.status}
                            disabled={!!saving}
                            onChange={(e) => changeStatus(issue, e.target.value)}
                            className="w-44 appearance-none rounded-xl border border-black/[0.08] bg-white py-2 pl-3 pr-8 text-[12px] font-bold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40 disabled:cursor-wait disabled:opacity-60"
                          >
                            <option value="pending">🟡 Pending Admin Review</option>
                            <option value="in_progress">🔵 In Progress</option>
                            <option value="resolved">🟢 Resolved</option>
                          </select>
                          <CaretDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                        </label>
                        {isSavingStatus && (
                          <p className="mt-1.5 text-[10.5px] font-bold text-lime-deep">Updating…</p>
                        )}
                      </td>

                      {/* Admin response */}
                      <td className="px-4 py-3.5 align-top">
                        <textarea
                          value={draft}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [issue.id]: e.target.value }))
                          }
                          rows={2}
                          placeholder="Reply to the reporter…"
                          className="w-56 resize-none rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[11.5px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                        />
                        {draftChanged && (
                          <button
                            type="button"
                            disabled={!!saving}
                            onClick={() => saveResponse(issue)}
                            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-[#C4F135] px-3 py-1.5 text-[11px] font-semibold text-black transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
                          >
                            {isSavingResponse ? 'Saving…' : 'Save Response'}
                          </button>
                        )}
                      </td>

                      {/* Attachment */}
                      <td className="px-4 py-3.5 align-top">
                        {issue.attachment_url ? (
                          <a
                            href={issue.attachment_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex max-w-[160px] items-center gap-1.5 text-[11.5px] font-bold text-lime-deep underline decoration-lime-deep/30 underline-offset-2 transition hover:decoration-lime-deep"
                          >
                            <PaperClipIcon className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{issue.attachment_name}</span>
                          </a>
                        ) : (
                          <span className="text-[11.5px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
