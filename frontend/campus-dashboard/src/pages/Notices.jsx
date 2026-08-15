import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCsrfToken } from '../lib/csrf';
import {
  AUDIENCE_OPTIONS,
  BATCHES,
  PRIORITY_META,
  SECTIONS_BY_DEPT,
  audienceLabel,
  fmtNoticeDate,
} from '../lib/notices';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  ArrowRightIcon,
  BanIcon,
  CaretDownIcon,
  CircleCheckIcon,
  MegaphoneIcon,
  PaperClipIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '../components/Icons';

const EMPTY_FORM = {
  title: '',
  content: '',
  priority: 'normal',
  targetGroup: 'all',
  scope: 'general',
  department: '',
  batch: '',
  section: '',
  pinned: false,
};

const selectClass =
  'w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';
const inputClass =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

/** Primary audience tabs for the admin filter view. */
const PRIMARY_TABS = [
  { id: 'faculty', label: 'Faculty Notices' },
  { id: 'student', label: 'Student Notices' },
];

/** Sub-category tab labels per audience. */
const SUB_TAB_LABELS = {
  student: { general: 'General Notices', department: 'Department Notices' },
  faculty: { general: 'General Faculty Notices', department: 'Department Faculty Notices' },
};

export default function Notices() {
  const [notices, setNotices] = useState([]);
  const closeModalRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState(null); // { id, action }
  const [confirmDelete, setConfirmDelete] = useState(null);

  // ---- Filter view: audience tabs -> scope -> department -> search ----
  const [target, setTarget] = useState('student'); // 'student' | 'faculty'
  const [category, setCategory] = useState('general'); // 'general' | 'department'
  const [dept, setDept] = useState('CSE');
  const [query, setQuery] = useState('');

  // ---- Create / edit modal (3-step targeting wizard) ----
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // notice row being edited (null = create)
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [step, setStep] = useState(1);

  // The wizard always walks: target group -> target scope -> content. Faculty
  // notices may also pick a department scope (batch/section stay student-only).
  const steps = [
    { id: 'group', label: 'Target group' },
    { id: 'scope', label: 'Target scope' },
    { id: 'content', label: 'Content & priority' },
  ];
  const maxStep = steps.length;

  const handleNext = () => {
    if (step === 2 && form.scope === 'dept' && !form.department)
      return showToast('Pick a department for this notice.', true);
    setStep((s) => Math.min(s + 1, maxStep));
  };
  const [attachment, setAttachment] = useState(null); // new File
  const [removeAttachment, setRemoveAttachment] = useState(false);
  const [saving, setSaving] = useState(false);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  };

  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    const seq = ++reqSeq.current; // drop stale in-flight responses
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({ target, category });
      if (category === 'department') params.set('dept', dept);
      const res = await fetch(`/api/notices/?${params}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (seq !== reqSeq.current) return;
      if (!res.ok) throw new Error(data.error || 'Could not load notices.');
      setNotices(data.notices || []);
    } catch (err) {
      if (seq === reqSeq.current) setLoadError(err.message);
    } finally {
      if (seq === reqSeq.current) setLoading(false);
    }
  }, [target, category, dept]);

  useEffect(() => {
    load();
  }, [load]);

  // ---- Modal helpers ----
  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      // Pre-select the active filter as the new notice's target audience.
      targetGroup: target === 'faculty' ? 'faculty' : 'student',
      scope: category,
      department: category === 'department' ? dept : '',
    });
    setStep(1);
    setAttachment(null);
    setRemoveAttachment(false);
    setModalOpen(true);
  }, [target, category, dept]);

  // The header's "+ New Notice" button (Topbar) opens the create modal, and
  // the header refresh button re-fetches the list — both via custom events.
  useEffect(() => {
    const openFromHeader = () => openCreate();
    const refreshFromHeader = () => {
      load();
      window.dispatchEvent(new CustomEvent('app:refresh-handled'));
    };
    window.addEventListener('notice:open-create', openFromHeader);
    window.addEventListener('app:refresh', refreshFromHeader);
    return () => {
      window.removeEventListener('notice:open-create', openFromHeader);
      window.removeEventListener('app:refresh', refreshFromHeader);
    };
  }, [load, openCreate]);

  const openEdit = (notice) => {
    setEditing(notice);
    setForm({
      title: notice.title,
      content: notice.content,
      priority: notice.priority,
      targetGroup: notice.target_role,
      // Keep an existing department narrowing when editing (a legacy
      // faculty+dept notice keeps its scope — the wizard only hides the
      // scope step from NEW faculty-only notices).
      scope: notice.department ? 'dept' : 'general',
      department: notice.department || '',
      batch: notice.batch || '',
      section: notice.section || '',
      pinned: notice.pinned,
    });
    setStep(1);
    setAttachment(null);
    setRemoveAttachment(false);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
  };
  closeModalRef.current = closeModal;

  // Close the create/edit modal on Escape (backdrop click + Cancel also work).
  useEffect(() => {
    if (!modalOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeModalRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen]);

  const save = async () => {
    if (!form.title.trim()) return showToast('Enter a notice title.', true);
    if (!form.content.trim()) return showToast('Notice content is required.', true);
    if (form.scope === 'dept' && !form.department)
      return showToast('Pick a department for this notice.', true);

    const narrowed = form.scope === 'dept' && form.department;
    const body = new FormData();
    body.append('title', form.title.trim());
    body.append('content', form.content.trim());
    body.append('priority', form.priority);
    body.append('target_role', form.targetGroup);
    body.append('department', narrowed ? form.department : '');
    body.append('batch', narrowed ? form.batch : '');
    body.append('section', narrowed ? form.section : '');
    body.append('pinned', form.pinned ? '1' : '0');
    if (attachment) body.append('attachment', attachment);
    if (removeAttachment) body.append('remove_attachment', '1');

    setSaving(true);
    try {
      const res = await fetch(editing ? `/api/notices/${editing.id}/` : '/api/notices/', {
        method: editing ? 'PATCH' : 'POST',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save the notice.');
      // Keep the server's pinned-first / newest-first order after a create.
      setNotices((prev) => {
        const next = editing
          ? prev.map((n) => (n.id === editing.id ? { ...n, ...data.notice } : n))
          : [data.notice, ...prev];
        return [...next].sort(
          (a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.created_at) - new Date(a.created_at),
        );
      });
      showToast(editing ? 'Notice updated.' : 'Notice published.');
      setModalOpen(false);
      setEditing(null);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  // ---- Row actions ----
  const togglePin = async (notice) => {
    setBusy({ id: notice.id, action: 'pin' });
    try {
      const res = await fetch(`/api/notices/${notice.id}/`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({ pinned: !notice.pinned }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not update the notice.');
      setNotices((prev) => prev.map((n) => (n.id === notice.id ? { ...n, ...data.notice } : n)));
      showToast(notice.pinned ? 'Notice unpinned.' : 'Notice pinned to top.');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    if (!confirmDelete) return;
    const notice = confirmDelete;
    setConfirmDelete(null);
    setBusy({ id: notice.id, action: 'delete' });
    try {
      const res = await fetch(`/api/notices/${notice.id}/`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not delete the notice.');
      setNotices((prev) => prev.filter((n) => n.id !== notice.id));
      showToast(`Notice "${notice.title}" deleted.`);
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setBusy(null);
    }
  };

  // Client-side search over the tab-filtered rows (instant, no refetch).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notices;
    return notices.filter((n) =>
      `${n.title} ${n.content} ${n.department || ''} ${n.batch || ''} ${n.section || ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [notices, query]);

  const counts = useMemo(
    () => ({
      total: filtered.length,
      urgent: filtered.filter((n) => n.priority === 'urgent').length,
      pinned: filtered.filter((n) => n.pinned).length,
    }),
    [filtered],
  );

  const KPIS = [
    {
      label: 'Total Notices',
      value: counts.total,
      icon: MegaphoneIcon,
      badge: 'bg-lime/30 text-lime-deep',
      accent: 'border-lime',
    },
    {
      label: 'Urgent',
      value: counts.urgent,
      icon: BanIcon,
      badge: 'bg-rose-100 text-rose-600',
      accent: 'border-rose-300',
    },
    {
      label: 'Pinned to Top',
      value: counts.pinned,
      icon: PinIcon,
      badge: 'bg-amber-100 text-amber-600',
      accent: 'border-amber-300',
    },
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
        Admin portal / Notice board
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[32px]">
            Notice Management
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Publish announcements to everyone, to a role, or to a single department — and pin the
            important ones to the top.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={load}
            className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
          >
            <RefreshIcon className="h-4 w-4 text-gray-400 transition group-hover:rotate-180 group-hover:text-lime-deep" />
            Refresh
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <PlusIcon className="h-4 w-4" />
            Create New Notice
          </button>
        </div>
      </div>

      {/* Filter view: primary audience tabs -> scope sub-tabs -> department -> search */}
      <div className="mt-6 rounded-2xl border border-black/[0.05] bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Primary tabs */}
          <div className="flex items-center gap-1.5 rounded-xl bg-panel/70 p-1">
            {PRIMARY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTarget(t.id);
                  setCategory('general');
                }}
                className={`rounded-lg px-4 py-2 text-[12.5px] font-bold transition ${
                  target === t.id
                    ? 'bg-lime text-charcoal shadow-sm shadow-lime/40'
                    : 'text-gray-500 hover:text-charcoal'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="hidden h-6 w-px bg-black/[0.06] sm:block" />

          {/* Sub-tabs */}
          <div className="flex items-center gap-1.5 rounded-xl bg-panel/70 p-1">
            {['general', 'department'].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-lg px-3.5 py-2 text-[12px] font-bold transition ${
                  category === c
                    ? 'bg-white text-charcoal shadow-sm ring-1 ring-black/[0.05]'
                    : 'text-gray-500 hover:text-charcoal'
                }`}
              >
                {SUB_TAB_LABELS[target][c]}
              </button>
            ))}
          </div>

          {/* Department picker (only for the department scope) */}
          {category === 'department' && (
            <label className="relative">
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                className="appearance-none rounded-xl border border-black/[0.08] bg-white py-2 pl-3.5 pr-8 text-[12.5px] font-bold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
              >
                {Object.keys(SECTIONS_BY_DEPT).map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
              <CaretDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </label>
          )}

          {/* Search */}
          <div className="relative ml-auto w-full sm:w-64">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search notices…"
              className="w-full rounded-xl border border-black/[0.08] bg-white py-2 pl-9 pr-3.5 text-[12.5px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
            />
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article
              key={kpi.label}
              className={`rounded-2xl border border-black/5 border-t-4 ${kpi.accent} bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-charcoal">
                    {kpi.value}
                  </p>
                </div>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${kpi.badge}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Notices table */}
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
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">Couldn't load notices</h3>
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
                  <MegaphoneIcon className="h-6 w-6" />
                </span>
                {notices.length === 0 ? (
                  <>
                    <h3 className="mt-4 text-[15px] font-bold text-charcoal">
                      No {target} notices here yet
                    </h3>
                    <p className="mt-1 text-[12.5px] text-gray-500">
                      {category === 'general'
                        ? `No general notices are published for the ${target === 'faculty' ? 'faculty' : 'student'} audience. Create one to get started.`
                        : `No ${dept} department notices are published for the ${target === 'faculty' ? 'faculty' : 'student'} audience.`}
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="mt-4 text-[15px] font-bold text-charcoal">
                      No matches for “{query}”
                    </h3>
                    <p className="mt-1 text-[12.5px] text-gray-500">
                      Try a different keyword, or clear the search to see all
                      {target === 'faculty' ? ' faculty' : ' student'} notices.
                    </p>
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
                    >
                      Clear search
                    </button>
                  </>
                )}
                {notices.length === 0 && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2 text-[12px] font-bold text-charcoal shadow-sm shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Create New Notice
                  </button>
                )}
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.05] bg-panel/60">
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Targeted Audience
                  </th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Date Sent
                  </th>
                  <th className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Priority
                  </th>
                  <th className="px-4 py-3 text-right text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((n) => {
                  const meta = PRIORITY_META[n.priority] || PRIORITY_META.normal;
                  const isBusy = busy && busy.id === n.id;
                  return (
                    <tr
                      key={n.id}
                      className={`border-b border-black/[0.04] transition last:border-0 hover:bg-canvas/70 ${
                        n.pinned ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Title */}
                      <td className="px-4 py-3.5 align-middle">
                        <p className="flex items-center gap-2 text-[13.5px] font-bold text-charcoal">
                          {n.pinned && (
                            <PinIcon className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Pinned" />
                          )}
                          <span className="max-w-[300px] truncate">{n.title}</span>
                        </p>
                        <p className="mt-0.5 flex items-center gap-1.5 pl-0 text-[11px] text-gray-400">
                          <MegaphoneIcon className="h-3 w-3" />
                          {n.author} · {fmtNoticeDate(n.created_at)}
                        </p>
                      </td>

                      {/* Audience */}
                      <td className="px-4 py-3.5 align-middle">
                        <span className="inline-flex max-w-[220px] items-center rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-charcoal">
                          <span className="truncate">{audienceLabel(n)}</span>
                        </span>
                      </td>

                      {/* Date */}
                      <td className="px-4 py-3.5 align-middle text-[12.5px] font-semibold text-charcoal">
                        {fmtNoticeDate(n.created_at)}
                      </td>

                      {/* Priority */}
                      <td className="px-4 py-3.5 align-middle">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.pill}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3.5 text-right align-middle">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => openEdit(n)}
                            title="Edit notice"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[11.5px] font-bold text-charcoal transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md disabled:cursor-wait disabled:opacity-50"
                          >
                            <PencilIcon className="h-3.5 w-3.5 text-lime-deep" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => togglePin(n)}
                            title={n.pinned ? 'Unpin from top' : 'Pin to top'}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${
                              n.pinned
                                ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                : 'border border-black/[0.08] bg-white text-gray-500 hover:text-charcoal'
                            }`}
                          >
                            <PinIcon className="h-3.5 w-3.5" />
                            {isBusy && busy.action === 'pin' ? '…' : n.pinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button
                            type="button"
                            disabled={!!busy}
                            onClick={() => setConfirmDelete(n)}
                            title="Delete notice"
                            className="grid h-8 w-8 place-items-center rounded-lg border border-rose-200 bg-rose-50 text-rose-500 transition hover:bg-rose-100 hover:text-rose-600 disabled:cursor-wait disabled:opacity-50"
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

      {/* Delete confirmation */}
      {confirmDelete && (
        <ConfirmDialog
          open
          busy={!!busy}
          tone="danger"
          title="Delete this notice?"
          message="The notice will be removed from every dashboard immediately and any attached file will be deleted. This cannot be undone."
          confirmLabel="Delete Notice"
          highlight={`"${confirmDelete.title}"`}
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notice-modal-title"
          onClick={closeModal}
        >
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] bg-ink px-6 py-5">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-lime">
                  {editing ? 'Edit notice' : 'New notice'}
                </p>
                <h3 id="notice-modal-title" className="mt-1 text-[19px] font-extrabold tracking-tight text-white">
                  {editing ? 'Update the announcement' : 'Create New Notice'}
                </h3>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Wizard steps */}
            <div className="flex flex-wrap items-center gap-2 border-b border-black/[0.05] bg-canvas/40 px-6 py-3.5">
              {steps.map((s, i) => {
                const n = i + 1;
                const reached = n <= maxStep;
                const active = n === step;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={!reached}
                    onClick={() => reached && setStep(n)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                      active
                        ? 'bg-lime text-charcoal shadow-sm shadow-lime/40'
                        : reached
                          ? 'bg-white text-charcoal ring-1 ring-black/[0.06] hover:bg-lime/30'
                          : 'bg-white/60 text-gray-400'
                    }`}
                  >
                    <span
                      className={`grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold ${
                        active
                          ? 'bg-ink/10 text-ink'
                          : reached
                            ? 'bg-lime-deep text-white'
                            : 'bg-gray-200 text-gray-400'
                      }`}
                    >
                      {n}
                    </span>
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="px-6 py-5">
              {/* ---- Step 1: target group ---- */}
              {step === 1 && (
                <fieldset>
                  <legend className="mb-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Who should see this notice?
                  </legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {AUDIENCE_OPTIONS.map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
                          form.targetGroup === opt.id
                            ? 'border-lime-deep/40 bg-lime/10 ring-2 ring-lime/30'
                            : 'border-black/[0.08] bg-white hover:border-black/20'
                        }`}
                      >
                        <input
                          type="radio"
                          name="target-group"
                          checked={form.targetGroup === opt.id}
                          onChange={() =>
                            setForm((f) => ({
                              ...f,
                              targetGroup: opt.id,
                              // Batch/section are student-only — drop them
                              // when switching to a faculty-only notice.
                              batch: opt.id === 'faculty' ? '' : f.batch,
                              section: opt.id === 'faculty' ? '' : f.section,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 accent-lime-deep"
                        />
                        <span>
                          <span className="block text-[13px] font-bold text-charcoal">{opt.label}</span>
                          <span className="block text-[11px] text-gray-400">{opt.sub}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              )}

              {/* ---- Step 2: target scope ---- */}
              {step === 2 && (
                <fieldset>
                  <legend className="mb-3 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    How wide should this notice reach?
                  </legend>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
                        form.scope === 'general'
                          ? 'border-lime-deep/40 bg-lime/10 ring-2 ring-lime/30'
                          : 'border-black/[0.08] bg-white hover:border-black/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="scope"
                        checked={form.scope === 'general'}
                        onChange={() =>
                          setForm((f) => ({ ...f, scope: 'general', batch: '', section: '' }))
                        }
                        className="mt-0.5 h-4 w-4 accent-lime-deep"
                      />
                      <span>
                        <span className="block text-[13px] font-bold text-charcoal">General notice</span>
                        <span className="block text-[11px] text-gray-400">All departments &amp; all students</span>
                      </span>
                    </label>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
                        form.scope === 'dept'
                          ? 'border-lime-deep/40 bg-lime/10 ring-2 ring-lime/30'
                          : 'border-black/[0.08] bg-white hover:border-black/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="scope"
                        checked={form.scope === 'dept'}
                        onChange={() => setForm((f) => ({ ...f, scope: 'dept' }))}
                        className="mt-0.5 h-4 w-4 accent-lime-deep"
                      />
                      <span>
                        <span className="block text-[13px] font-bold text-charcoal">Department specific</span>
                        <span className="block text-[11px] text-gray-400">Pick a department below</span>
                      </span>
                    </label>
                  </div>

                  {form.scope === 'dept' && (
                    <div
                      className={`mt-4 grid grid-cols-1 gap-4 rounded-2xl border border-black/[0.06] bg-canvas/50 p-4 ${
                        form.targetGroup === 'faculty' ? 'sm:max-w-xs' : 'sm:grid-cols-3'
                      }`}
                    >
                      {/* Department */}
                      <label className="relative block">
                        <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                          Department
                        </span>
                        <select
                          value={form.department}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, department: e.target.value, section: '' }))
                          }
                          className={selectClass}
                        >
                          <option value="">Select…</option>
                          {Object.keys(SECTIONS_BY_DEPT).map((code) => (
                            <option key={code} value={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                        <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                      </label>

                      {form.targetGroup !== 'faculty' && (
                        <>
                          {/* Batch (optional) */}
                          <label className="relative block">
                            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                              Batch · optional
                            </span>
                            <select
                              value={form.batch}
                              onChange={(e) => setForm((f) => ({ ...f, batch: e.target.value }))}
                              className={selectClass}
                            >
                              <option value="">Any batch</option>
                              {BATCHES.map((b) => (
                                <option key={b} value={b}>
                                  Batch {b}
                                </option>
                              ))}
                            </select>
                            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                          </label>

                          {/* Section (optional, per department) */}
                          <label className="relative block">
                            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                              Section · optional
                            </span>
                            <select
                              value={form.section}
                              onChange={(e) => setForm((f) => ({ ...f, section: e.target.value }))}
                              disabled={!form.department}
                              className={`${selectClass} disabled:cursor-not-allowed disabled:opacity-50`}
                            >
                              <option value="">Any section</option>
                              {(SECTIONS_BY_DEPT[form.department] || []).map((s) => (
                                <option key={s} value={s}>
                                  Sec {s}
                                </option>
                              ))}
                            </select>
                            <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                          </label>
                        </>
                      )}
                    </div>
                  )}

                  <p className="mt-3 text-[11.5px] leading-relaxed text-gray-400">
                    {form.targetGroup === 'faculty'
                      ? 'A department notice reaches faculty of that department. A general notice reaches all faculty members.'
                      : `A department notice reaches every student in that department${form.batch ? ` · batch ${form.batch}` : ''}${form.section ? ` · section ${form.section}` : ''}. A general notice reaches everyone in the chosen group.`}
                  </p>
                </fieldset>
              )}

              {/* ---- Step 3: content & priority ---- */}
              {step === maxStep && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Title */}
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Title
                </span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="e.g. Midterm Exam Schedule Released"
                  className={inputClass}
                />
              </label>

              {/* Content */}
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Content
                </span>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={5}
                  placeholder="Write the full notice body…"
                  className={`${inputClass} resize-y leading-relaxed`}
                />
              </label>

              {/* Priority */}
              <label className="relative block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Priority level
                </span>
                <select
                  value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                  className={selectClass}
                >
                  <option value="normal">Normal</option>
                  <option value="important">Important</option>
                  <option value="urgent">Urgent</option>
                </select>
                <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                <span
                  className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ring-1 ${
                    (PRIORITY_META[form.priority] || PRIORITY_META.normal).pill
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${(PRIORITY_META[form.priority] || PRIORITY_META.normal).dot}`}
                  />
                  {(PRIORITY_META[form.priority] || PRIORITY_META.normal).label}
                </span>
              </label>

              {/* Pinned */}
              <label className="flex items-end pb-1">
                <span className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5">
                  <input
                    type="checkbox"
                    checked={form.pinned}
                    onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                    className="h-4 w-4 accent-lime-deep"
                  />
                  <span className="text-[12.5px] font-bold text-charcoal">Pin to top</span>
                </span>
              </label>

              {/* Attachment */}
              <label className="block sm:col-span-2">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                  Attachment (optional PDF / image)
                </span>
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-black/15 bg-canvas/60 px-4 py-3.5">
                  {editing && editing.attachment_url && !removeAttachment && !attachment && (
                    <a
                      href={editing.attachment_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-lime-deep underline decoration-lime-deep/30 underline-offset-2 transition hover:decoration-lime-deep"
                    >
                      <PaperClipIcon className="h-4 w-4" />
                      {editing.attachment_name}
                    </a>
                  )}

                  {editing && editing.attachment_url && !removeAttachment && (
                    <label className="flex cursor-pointer items-center gap-1.5 text-[12px] font-semibold text-gray-500">
                      <input
                        type="checkbox"
                        checked={removeAttachment}
                        onChange={(e) => setRemoveAttachment(e.target.checked)}
                        className="h-3.5 w-3.5 accent-rose-500"
                      />
                      Remove current attachment
                    </label>
                  )}

                  <label
                    className={`flex w-full cursor-pointer items-center gap-3 ${
                      editing && editing.attachment_url && !removeAttachment && !attachment
                        ? 'border-t border-dashed border-black/10 pt-3'
                        : ''
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) => {
                        setAttachment(e.target.files?.[0] || null);
                        setRemoveAttachment(false);
                      }}
                      className="sr-only"
                    />
                    {attachment ? (
                      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-charcoal">
                        <PaperClipIcon className="h-4 w-4 text-lime-deep" />
                        {attachment.name}
                        {editing && editing.attachment_url && (
                          <span className="font-semibold text-gray-400">(replaces current)</span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-gray-500 transition hover:text-charcoal">
                        <UploadIcon className="h-4 w-4" />
                        {editing && editing.attachment_url && !removeAttachment
                          ? 'Replace with a new PDF or image'
                          : 'Click to upload a PDF or image'}
                      </span>
                    )}
                  </label>
                </div>
              </label>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.05] bg-canvas/60 px-6 py-4">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal disabled:opacity-50"
              >
                Cancel
              </button>
              <div className="flex items-center gap-3">
                {step > 1 && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => s - 1)}
                    disabled={saving}
                    className="rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal disabled:opacity-50"
                  >
                    Back
                  </button>
                )}
                {step < maxStep ? (
                  <button
                    type="button"
                    onClick={handleNext}
                    className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    Next
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
                  >
                    <MegaphoneIcon className="h-4 w-4" />
                    {saving ? 'Saving…' : editing ? 'Save Changes' : 'Publish Notice'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
