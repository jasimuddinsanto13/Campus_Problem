import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getCsrfToken } from '../lib/csrf';
import { BATCHES, DAYS, DEPARTMENTS, DEPT_SECTIONS, to12h } from '../lib/routines';
import {
  BOOKING_PURPOSES,
  REQUEST_STATUS_META,
  addHours,
  dayFromDate,
  fmtDate,
  nextBookingDate,
  tdClass,
  thClass,
} from '../lib/roomBooking';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  ArchiveIcon,
  BanIcon,
  BuildingIcon,
  CalendarIcon,
  CaretDownIcon,
  CheckIcon,
  CircleCheckIcon,
  ClockIcon,
  HourglassIcon,
  MegaphoneIcon,
  PlusIcon,
  RefreshIcon,
  RoomBookingIcon,
  TrashIcon,
  UndoIcon,
  XIcon,
} from '../components/Icons';

const TABS = [
  { id: 'all', label: 'All Requests' },
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: 'trash', label: 'Trash', icon: ArchiveIcon },
];

const CONFIRM_META = {
  approve: {
    title: 'Approve this booking request?',
    tone: 'success',
    confirmLabel: 'Approve Request',
    message:
      'The room will be locked for the requested slot, so other faculty can no longer book it. You can undo this afterwards.',
  },
  reject: {
    title: 'Reject this booking request?',
    tone: 'warning',
    confirmLabel: 'Reject Request',
    message:
      'The room slot will stay free for others. You can undo this afterwards.',
  },
  trash: {
    title: 'Move this request to trash?',
    tone: 'trash',
    confirmLabel: 'Move to Trash',
    message:
      'It will disappear from the live lists, its room slot will be freed, and it lands in the Trash tab where you can restore or permanently delete it.',
  },
  delete: {
    title: 'Delete permanently?',
    tone: 'danger',
    confirmLabel: 'Delete Forever',
    message: 'This removes the request from the database. This action cannot be undone.',
  },
};

export default function RoomBooking() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('all');
  const [busy, setBusy] = useState(null); // { id, action }
  const [confirm, setConfirm] = useState(null); // { req, action }

  // ---- "+ New Booking" (admin instant booking + exam override) ----
  const [showCreate, setShowCreate] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    purpose: 'exam',
    department: 'CSE',
    batch: '10',
    section: 'A',
    room_id: '',
    date: nextBookingDate(),
    start: '09:00',
    duration: 1,
    subject: '',
    notes: '',
  });

  const openCreate = useCallback(async () => {
    setShowCreate(true);
    try {
      const res = await fetch('/api/room-booking/rooms/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRooms(data.rooms || []);
    } catch {
      /* the dropdown simply stays empty on network errors */
    }
  }, []);

  // The Topbar's "+ New Booking" action dispatches this event — open the
  // modal the same way the header button does (rooms dropdown included).
  useEffect(() => {
    window.addEventListener('booking:open-create', openCreate);
    return () => window.removeEventListener('booking:open-create', openCreate);
  }, [openCreate]);

  const closeCreate = () => {
    if (creating) return;
    setShowCreate(false);
  };

  const createSections = useMemo(
    () => (createForm.department ? DEPT_SECTIONS[createForm.department] || [] : []),
    [createForm.department],
  );

  const createDay = dayFromDate(createForm.date);
  const createDayLabel = DAYS.find((d) => d.code === createDay)?.label;

  const createBooking = async () => {
    if (!createForm.room_id) {
      showToast('Pick a room to book.', { error: true });
      return;
    }
    if (!createForm.date) {
      showToast('Pick a date for the booking.', { error: true });
      return;
    }
    if (createDay === 'FRI') {
      showToast('Bookings run Sunday–Thursday or Saturday (no Friday).', { error: true });
      return;
    }
    if (!createForm.subject.trim()) {
      showToast('Enter the course / subject name.', { error: true });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/admin/room-booking/create/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify({
          purpose: createForm.purpose,
          room_id: Number(createForm.room_id),
          department: createForm.department,
          batch: createForm.batch,
          section: createForm.section,
          date: createForm.date,
          start_time: createForm.start,
          end_time: addHours(createForm.start, createForm.duration),
          subject: createForm.subject.trim(),
          notes: createForm.notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create the booking.');
      // Live update: prepend the row + jump to the Approved tab so the new
      // booking (and the counters) update without a page reload.
      setRequests((prev) => [data.request, ...prev]);
      setTab('approved');
      setShowCreate(false);
      if (data.created === 'override' && data.displaced) {
        const d = data.displaced;
        showToast(
          `Exam override — ${d.subject} displaced${d.faculty_name ? `, ${d.faculty_name} notified` : ''}.`,
          { duration: 6000 },
        );
      } else {
        showToast('Booking created and approved — the slot is now locked.');
      }
    } catch (err) {
      showToast(err.message, { error: true, duration: 5000 });
    } finally {
      setCreating(false);
    }
  };

  // ---- Toast (optionally with an Undo action) ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, { error = false, actionLabel, onAction, duration = 3400 } = {}) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error, actionLabel, onAction });
    toastTimer.current = setTimeout(() => setToast(null), duration);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/room-booking/requests/?include=trashed', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load booking requests.');
      setRequests(data.requests || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

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

  const decide = async (req, action) => {
    setBusy({ id: req.id, action });
    try {
      const data = await patch(req, action);
      if (data.deleted) {
        setRequests((prev) => prev.filter((r) => r.id !== req.id));
        showToast('Request permanently deleted.');
        return;
      }
      const fresh = data.request;
      setRequests((prev) =>
        prev.map((r) => (r.id === req.id ? { ...r, ...fresh } : r)),
      );

      const summary = `Room ${fresh.room_number} · ${fresh.subject}`;
      if (action === 'approve') {
        showToast(`${summary} approved — the slot is now locked.`, {
          actionLabel: 'Undo',
          duration: 6000,
          onAction: () => {
            setToast(null);
            decide(fresh, 'undo');
          },
        });
      } else if (action === 'reject') {
        showToast(`${summary} rejected — the slot stays free.`, {
          actionLabel: 'Undo',
          duration: 6000,
          onAction: () => {
            setToast(null);
            decide(fresh, 'undo');
          },
        });
      } else if (action === 'trash') {
        showToast(`${summary} moved to trash.`, {
          actionLabel: 'Undo',
          duration: 6000,
          onAction: () => {
            setToast(null);
            decide(fresh, 'restore');
          },
        });
      } else if (action === 'restore') {
        showToast(`${summary} restored from trash.`);
      } else if (action === 'undo') {
        showToast(`${summary} restored to pending.`);
      }
    } catch (err) {
      showToast(err.message, { error: true, duration: 5000 });
    } finally {
      setBusy(null);
    }
  };

  // ---- Confirmation flow ----
  const askConfirm = (req, action) => setConfirm({ req, action });
  const runConfirmed = async () => {
    if (!confirm) return;
    const { req, action } = confirm;
    setConfirm(null);
    await decide(req, action);
  };

  const active = useMemo(() => requests.filter((r) => !r.trashed), [requests]);
  const trashed = useMemo(() => requests.filter((r) => r.trashed), [requests]);

  const counts = useMemo(
    () => ({
      all: active.length,
      pending: active.filter((r) => r.status === 'pending').length,
      approved: active.filter((r) => r.status === 'approved').length,
      rejected: active.filter((r) => r.status === 'rejected').length,
      cancelled: active.filter((r) => r.status === 'cancelled').length,
      trash: trashed.length,
    }),
    [active, trashed],
  );

  const visible = useMemo(() => {
    if (tab === 'trash') return trashed;
    if (tab === 'all') return active;
    return active.filter((r) => r.status === tab);
  }, [active, trashed, tab]);

  const KPIS = [
    {
      label: 'Awaiting Approval',
      value: counts.pending,
      icon: HourglassIcon,
      badge: 'bg-amber-100 text-amber-600',
      accent: 'border-amber-300',
    },
    {
      label: 'Approved',
      value: counts.approved,
      icon: CheckIcon,
      badge: 'bg-emerald-100 text-emerald-600',
      accent: 'border-emerald-300',
    },
    {
      label: 'Total Requests',
      value: counts.all,
      icon: RoomBookingIcon,
      badge: 'bg-lime/30 text-lime-deep',
      accent: 'border-lime',
    },
    {
      label: 'In Trash',
      value: counts.trash,
      icon: ArchiveIcon,
      badge: 'bg-ink/5 text-charcoal',
      accent: 'border-charcoal/30',
    },
  ];

  const confirmMeta = confirm ? CONFIRM_META[confirm.action] : null;

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
        Admin portal / Room booking
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[32px]">
            Booking Requests &amp; Approvals
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Review extra-class, makeup and rescheduled-class requests from faculty. Every decision
            asks for confirmation, can be undone, and removed requests land in the trash.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <PlusIcon className="h-4 w-4" />
            New Booking
          </button>
          <button
            type="button"
            onClick={load}
            className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
          >
            <RefreshIcon className="h-4 w-4 text-gray-400 transition group-hover:rotate-180 group-hover:text-lime-deep" />
            Refresh
          </button>
        </div>
      </div>

      {/* Pending banner */}
      {tab !== 'trash' && counts.pending > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
            <HourglassIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-amber-800">
              {counts.pending} request{counts.pending > 1 ? 's' : ''} waiting for approval
            </p>
            <p className="text-[12px] text-amber-700/80">
              Approve a request to lock the room for that slot, or reject it to free the window.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* Requests table */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-black/[0.05] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by status">
            {TABS.map((t) => {
              const TabIcon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
                    tab === t.id
                      ? 'bg-ink text-white shadow-md shadow-black/15'
                      : 'bg-panel text-gray-500 hover:bg-white hover:text-charcoal hover:shadow-sm'
                  }`}
                >
                  {TabIcon && <TabIcon className="h-3.5 w-3.5" />}
                  {t.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                      tab === t.id ? 'bg-lime text-charcoal' : 'bg-black/[0.05] text-gray-400'
                    }`}
                  >
                    {counts[t.id] ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {tab === 'trash' && (
          <div className="flex flex-wrap items-center gap-3 border-b border-black/[0.05] bg-ink/[0.03] px-5 py-3.5">
            <ArchiveIcon className="h-4 w-4 text-gray-400" />
            <p className="text-[12.5px] text-gray-500">
              Trashed requests are hidden from the live lists and their room slot is freed. Restore
              brings them back (if the slot is still free) — deleting removes them forever.
            </p>
          </div>
        )}

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
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">Couldn't load requests</h3>
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
          ) : visible.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                  {tab === 'trash' ? (
                    <ArchiveIcon className="h-6 w-6" />
                  ) : (
                    <RoomBookingIcon className="h-6 w-6" />
                  )}
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">
                  {tab === 'trash'
                    ? 'Trash is empty'
                    : requests.length === 0
                      ? 'No booking requests yet'
                      : 'Nothing in this view'}
                </h3>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {tab === 'trash'
                    ? 'Requests you move to trash will appear here.'
                    : requests.length === 0
                      ? 'Faculty extra-class requests will appear here for approval.'
                      : 'No requests match this status filter.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[980px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.05] bg-panel/60">
                  <th className={thClass}>Requester</th>
                  <th className={thClass}>Room</th>
                  <th className={thClass}>Date &amp; Time</th>
                  <th className={thClass}>Course &amp; Batch</th>
                  <th className={thClass}>Reason</th>
                  <th className={thClass}>Status</th>
                  <th className={`${thClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((req) => {
                  const meta = REQUEST_STATUS_META[req.status] || REQUEST_STATUS_META.pending;
                  const isPending = req.status === 'pending' && !req.trashed;
                  const isDecided = !req.trashed && req.status !== 'pending';
                  const isBusy = busy && busy.id === req.id;
                  const isTrash = req.trashed;
                  return (
                    <tr
                      key={req.id}
                      className={`border-b border-black/[0.04] transition last:border-0 hover:bg-canvas/70 ${
                        isTrash ? 'opacity-75' : ''
                      }`}
                    >
                      {/* Requester */}
                      <td className={tdClass}>
                        <p className="text-[13px] font-bold text-charcoal">{req.faculty_name}</p>
                        <p className="text-[11px] text-gray-400">
                          {req.requester_role === 'admin' ? 'Admin' : 'Faculty'}
                        </p>
                      </td>

                      {/* Room */}
                      <td className={tdClass}>
                        <p className="flex items-center gap-1.5 text-[13px] font-bold text-charcoal">
                          <RoomBookingIcon className="h-4 w-4 text-lime-deep" />
                          Room {req.room_number}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
                          <BuildingIcon className="h-3 w-3" />
                          {req.building}
                        </p>
                      </td>

                      {/* Date & time */}
                      <td className={tdClass}>
                        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal">
                          <CalendarIcon className="h-3.5 w-3.5 text-gray-300" />
                          {fmtDate(req.date)}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-gray-400">
                          {req.day_label}, {to12h(req.start_time)} – {to12h(req.end_time)}
                        </p>
                      </td>

                      {/* Course & batch */}
                      <td className={tdClass}>
                        <p className="max-w-[220px] truncate text-[12.5px] font-semibold text-charcoal">
                          {req.subject}
                        </p>
                        <p className="text-[11.5px] text-gray-400">
                          {req.department} · Batch {req.batch} · Sec {req.section}
                        </p>
                      </td>

                      {/* Reason */}
                      <td className={tdClass}>
                        <span className="inline-flex rounded-full bg-ink/5 px-2.5 py-1 text-[11px] font-bold text-charcoal">
                          {req.reason_label}
                        </span>
                      </td>

                      {/* Status */}
                      <td className={tdClass}>
                        <div className="flex flex-col items-start gap-1">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${meta.pill}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                            {meta.label}
                          </span>
                          {req.is_override && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 ring-1 ring-amber-600/10">
                              <MegaphoneIcon className="h-3 w-3" />
                              Exam Override
                            </span>
                          )}
                          {isTrash && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-bold text-gray-500">
                              <ArchiveIcon className="h-3 w-3" />
                              In trash
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className={`${tdClass} text-right`}>
                        {isTrash ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => decide(req, 'restore')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:-translate-y-0.5 hover:bg-black hover:shadow-md disabled:cursor-wait disabled:opacity-50"
                            >
                              <UndoIcon className="h-3.5 w-3.5" />
                              {isBusy && busy.action === 'restore' ? '…' : 'Restore'}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => askConfirm(req, 'delete')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                              {isBusy && busy.action === 'delete' ? '…' : 'Delete'}
                            </button>
                          </div>
                        ) : isPending ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => askConfirm(req, 'approve')}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-lime px-3 py-1.5 text-[11.5px] font-bold text-charcoal shadow-sm shadow-lime/30 transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-50"
                            >
                              <CheckIcon className="h-3.5 w-3.5" />
                              {isBusy && busy.action === 'approve' ? '…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => askConfirm(req, 'reject')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                            >
                              <BanIcon className="h-3.5 w-3.5" />
                              {isBusy && busy.action === 'reject' ? '…' : 'Reject'}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => askConfirm(req, 'trash')}
                              aria-label="Move to trash"
                              title="Move to trash"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.06] text-gray-400 transition hover:border-black/15 hover:text-charcoal disabled:cursor-wait disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : isDecided ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => decide(req, 'undo')}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-black/[0.08] bg-white px-3 py-1.5 text-[11.5px] font-bold text-charcoal transition hover:-translate-y-0.5 hover:border-black/20 hover:shadow-md disabled:cursor-wait disabled:opacity-50"
                            >
                              <UndoIcon className="h-3.5 w-3.5 text-lime-deep" />
                              {isBusy && busy.action === 'undo' ? '…' : 'Undo'}
                            </button>
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => askConfirm(req, 'trash')}
                              aria-label="Move to trash"
                              title="Move to trash"
                              className="grid h-7 w-7 place-items-center rounded-lg border border-black/[0.06] text-gray-400 transition hover:border-black/15 hover:text-charcoal disabled:cursor-wait disabled:opacity-50"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          </div>
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

      {/* ============ Create New Booking modal (admin instant booking) ============ */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-[2px] animate-[fadeIn_.2s_ease]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-booking-title"
          onClick={closeCreate}
        >
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl animate-[fadeIn_.25s_ease]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-4 border-b border-black/[0.05] bg-ink px-6 py-5">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-lime">
                  Admin portal / Instant booking
                </p>
                <h3
                  id="create-booking-title"
                  className="mt-1 text-[19px] font-extrabold tracking-tight text-white"
                >
                  Create New Room Booking / Exam Booking
                </h3>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                disabled={creating}
                aria-label="Close"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/60 transition hover:bg-white/10 hover:text-white disabled:opacity-40"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-[68vh] overflow-y-auto px-6 py-5">
              {/* Purpose radios */}
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                Purpose / Type
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {BOOKING_PURPOSES.map((p) => {
                  const active = createForm.purpose === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCreateForm((f) => ({ ...f, purpose: p.id }))}
                      className={`rounded-xl border-2 p-3.5 text-left transition ${
                        active
                          ? 'border-lime bg-lime/10 shadow-sm'
                          : 'border-black/[0.08] bg-white hover:border-lime-deep/30'
                      }`}
                    >
                      <span
                        className={`block text-[13px] font-bold ${
                          active ? 'text-lime-deep' : 'text-charcoal'
                        }`}
                      >
                        {p.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-gray-400">
                        {p.note}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Selected slot chips */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-[11.5px] font-bold text-charcoal">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {createDayLabel ? `${createDayLabel}, ${fmtDate(createForm.date)}` : 'Pick a date'}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-[11.5px] font-bold text-charcoal">
                  <ClockIcon className="h-3.5 w-3.5" />
                  {to12h(createForm.start)} – {to12h(addHours(createForm.start, createForm.duration))}
                </span>
                {createForm.room_id && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-lime/20 px-3 py-1.5 text-[11.5px] font-bold text-lime-deep">
                    <RoomBookingIcon className="h-3.5 w-3.5" />
                    Room {rooms.find((r) => r.id === Number(createForm.room_id))?.room_number || ''}
                  </span>
                )}
              </div>

              {createDay === 'FRI' && (
                <p className="mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-[12px] font-semibold text-rose-600">
                  Friday is not a booking day — pick a date from Sunday to Thursday, or Saturday.
                </p>
              )}

              {/* Form grid */}
              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                {/* Department */}
                <label className="relative block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Department
                  </span>
                  <select
                    value={createForm.department}
                    onChange={(e) => {
                      const dept = e.target.value;
                      setCreateForm((f) => ({
                        ...f,
                        department: dept,
                        section: DEPT_SECTIONS[dept]?.[0] || 'A',
                      }));
                    }}
                    className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
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
                    value={createForm.batch}
                    onChange={(e) => setCreateForm((f) => ({ ...f, batch: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
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
                    value={createForm.section}
                    onChange={(e) => setCreateForm((f) => ({ ...f, section: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  >
                    {createSections.map((s) => (
                      <option key={s} value={s}>
                        Section {s}
                      </option>
                    ))}
                  </select>
                  <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                </label>

                {/* Room */}
                <label className="relative block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Room number
                  </span>
                  <select
                    value={createForm.room_id}
                    onChange={(e) => setCreateForm((f) => ({ ...f, room_id: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  >
                    <option value="">Select a room…</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        Room {r.room_number} · {r.building} ({r.capacity} seats)
                      </option>
                    ))}
                  </select>
                  <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                </label>

                {/* Date */}
                <label className="relative block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Date
                  </span>
                  <input
                    type="date"
                    value={createForm.date}
                    onChange={(e) => setCreateForm((f) => ({ ...f, date: e.target.value }))}
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  />
                </label>

                {/* Start time */}
                <label className="relative block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Start time
                  </span>
                  <select
                    value={createForm.start}
                    onChange={(e) => setCreateForm((f) => ({ ...f, start: e.target.value }))}
                    className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  >
                    {Array.from({ length: 14 }, (_, i) => {
                      const t = `${String(i + 8).padStart(2, '0')}:00`;
                      return (
                        <option key={t} value={t}>
                          {to12h(t)}
                        </option>
                      );
                    })}
                  </select>
                  <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                </label>

                {/* Duration */}
                <label className="relative block">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Duration
                  </span>
                  <select
                    value={createForm.duration}
                    onChange={(e) =>
                      setCreateForm((f) => ({ ...f, duration: Number(e.target.value) }))
                    }
                    className="w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  >
                    <option value={1}>1 hour</option>
                    <option value={1.5}>1.5 hours</option>
                  </select>
                  <CaretDownIcon className="pointer-events-none absolute right-3 top-[34px] h-3.5 w-3.5 text-gray-400" />
                </label>

                {/* Subject */}
                <label className="block sm:col-span-3">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Course / Subject name
                  </span>
                  <input
                    type="text"
                    value={createForm.subject}
                    onChange={(e) => setCreateForm((f) => ({ ...f, subject: e.target.value }))}
                    placeholder="e.g. Role E2E / CSE-2101"
                    className="w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  />
                </label>

                {/* Notes */}
                <label className="block sm:col-span-3">
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Notes / Reason
                  </span>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm((f) => ({ ...f, notes: e.target.value }))}
                    rows={2}
                    placeholder="Optional — why this booking is being created…"
                    className="w-full resize-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40"
                  />
                </label>
              </div>

              {createForm.purpose === 'exam' && (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[12px] leading-snug text-amber-800">
                  <MegaphoneIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  If a regular class is scheduled in this room and slot, it will be
                  automatically overridden — the class will be flagged{' '}
                  <span className="font-bold">Pending Reschedule</span> and its faculty
                  member notified to pick a replacement room.
                </p>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t border-black/[0.05] bg-canvas/60 px-6 py-4">
              <button
                type="button"
                onClick={closeCreate}
                disabled={creating}
                className="rounded-xl border border-black/[0.08] bg-white px-5 py-2.5 text-[13px] font-bold text-gray-600 transition hover:border-black/20 hover:text-charcoal disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createBooking}
                disabled={creating}
                className="inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-wait disabled:opacity-60"
              >
                <CircleCheckIcon className="h-4 w-4" />
                {creating ? 'Creating…' : 'Create & Approve Booking'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation popup */}
      {confirm && confirmMeta && (
        <ConfirmDialog
          open
          busy={!!busy}
          tone={confirmMeta.tone}
          title={confirmMeta.title}
          message={confirmMeta.message}
          confirmLabel={confirmMeta.confirmLabel}
          highlight={`Room ${confirm.req.room_number} · ${confirm.req.subject} · ${
            confirm.req.day_label
          } ${to12h(confirm.req.start_time)} – ${to12h(confirm.req.end_time)}`}
          onConfirm={runConfirmed}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
