import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser, capitalizeName } from '../context/UserContext';
import { getCsrfToken } from '../lib/csrf';
import {
  CircleCheckIcon,
  XIcon,
  CalendarXIcon,
  RefreshIcon,
  ClockIcon,
  AlertOctagonIcon,
} from '../components/Icons';

const inputClass =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13.5px] text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

const selectClass =
  'w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13.5px] text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

const MEAL_TYPES = [
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'both', label: 'Both (Lunch & Dinner)' },
];

const STATUS_STYLES = {
  pending: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    ring: 'ring-amber-200',
    icon: ClockIcon,
    iconColor: 'text-amber-500',
  },
  approved: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    ring: 'ring-emerald-200',
    icon: CircleCheckIcon,
    iconColor: 'text-emerald-500',
  },
  rejected: {
    bg: 'bg-rose-50',
    text: 'text-rose-600',
    ring: 'ring-rose-200',
    icon: AlertOctagonIcon,
    iconColor: 'text-rose-500',
  },
};

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function MealQuery() {
  const { fullName, department, batch, section, loading: userLoading } = useUser();

  // ---- Form state ----
  const [date, setDate] = useState('');
  const [mealType, setMealType] = useState('lunch');
  const [submitting, setSubmitting] = useState(false);

  // ---- History ----
  const [rows, setRows] = useState(null);
  const [listError, setListError] = useState(null);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // Fetch the student's existing meal cancellation requests.
  const loadHistory = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch('/api/meal-query/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load requests.');
      setRows(data.cancellations || []);
    } catch (err) {
      setListError(err.message);
      setRows([]);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // ---- Submit handler ----
  const onSubmit = async (e) => {
    e.preventDefault();

    if (!date) {
      showToast('Please select a date.', true);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/meal-query/create/', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
          Accept: 'application/json',
        },
        body: JSON.stringify({ date, mealType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not submit request.');
      showToast('Meal off request submitted successfully!');
      setDate('');
      setMealType('lunch');
      loadHistory(); // refresh list
    } catch (err) {
      showToast(err.message || 'Something went wrong.', true);
    } finally {
      setSubmitting(false);
    }
  };

  // ---- Withdraw a pending request ----
  const withdraw = async (id) => {
    try {
      const res = await fetch(`/api/meal-query/${id}/`, {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: { 'X-CSRFToken': getCsrfToken() },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not withdraw request.');
      showToast('Request withdrawn.');
      loadHistory();
    } catch (err) {
      showToast(err.message || 'Could not withdraw request.', true);
    }
  };

  // Min date = today (prevent selecting past dates via the picker)
  const today = new Date();
  const minDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const displayName = capitalizeName(fullName) || 'Student';
  const context = [department, batch && `Batch ${batch}`, section && `Sec ${section}`]
    .filter(Boolean)
    .join(' · ');

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
          <p className="text-[13px] font-semibold text-charcoal">{toast.message}</p>
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
        Meal management
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
            Hostel Meal Management
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Cancel your hostel meal for a specific date. Your request will be
            reviewed by the Meal Manager.
          </p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-2">
        {/* ---- Cancel a Meal Form ---- */}
        <form
          onSubmit={onSubmit}
          className="rounded-xl border border-black/[0.05] bg-white p-6 shadow-sm"
        >
          <h2 className="text-[15px] font-bold tracking-tight text-charcoal">
            Cancel a Meal
          </h2>
          <p className="mt-1 text-[12px] text-gray-400">
            Select the date and meal type you wish to cancel.
          </p>

          {/* Read-only student info */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                Name
              </span>
              <input
                type="text"
                value={displayName}
                readOnly
                className={`${inputClass} bg-gray-50 cursor-not-allowed`}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                Student ID
              </span>
              <input
                type="text"
                value={context || '—'}
                readOnly
                className={`${inputClass} bg-gray-50 cursor-not-allowed`}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                Department
              </span>
              <input
                type="text"
                value={department || '—'}
                readOnly
                className={`${inputClass} bg-gray-50 cursor-not-allowed`}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                Section
              </span>
              <input
                type="text"
                value={section || '—'}
                readOnly
                className={`${inputClass} bg-gray-50 cursor-not-allowed`}
              />
            </label>
          </div>

          {/* Editable fields */}
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                Meal Off Date
              </span>
              <input
                type="date"
                value={date}
                min={minDate}
                onChange={(e) => setDate(e.target.value)}
                className={inputClass}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-semibold text-gray-600">
                Meal Type
              </span>
              <div className="relative">
                <select
                  value={mealType}
                  onChange={(e) => setMealType(e.target.value)}
                  className={selectClass}
                >
                  {MEAL_TYPES.map((mt) => (
                    <option key={mt.value} value={mt.value}>
                      {mt.label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            </label>
          </div>

          {/* Submit */}
          <div className="mt-7 flex justify-end">
            <button
              type="submit"
              disabled={submitting || userLoading}
              className="rounded-xl bg-lime px-6 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Submitting…' : 'Submit Meal Off Request'}
            </button>
          </div>
        </form>

        {/* ---- Request History ---- */}
        <div className="rounded-xl border border-black/[0.05] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-charcoal">
                Your Requests
              </h2>
              <p className="mt-1 text-[12px] text-gray-400">
                History of your meal cancellation requests.
              </p>
            </div>
            <button
              type="button"
              onClick={loadHistory}
              className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-gray-500 shadow-sm transition hover:text-charcoal hover:shadow-md"
            >
              <RefreshIcon className="h-3.5 w-3.5 transition group-hover:rotate-180" />
              Refresh
            </button>
          </div>

          {listError && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] font-semibold text-rose-600">
              {listError}
            </p>
          )}

          <div className="mt-4 space-y-3">
            {rows == null ? (
              // Skeleton loaders
              [0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-sm">
                  <div className="h-3.5 w-56 animate-pulse rounded bg-black/[0.06]" />
                  <div className="mt-2.5 h-3 w-40 animate-pulse rounded bg-black/[0.04]" />
                </div>
              ))
            ) : rows.length === 0 ? (
              <div className="grid min-h-[200px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/60 p-8 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                    <CalendarXIcon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-3 text-[14px] font-bold text-charcoal">
                    No requests yet
                  </h3>
                  <p className="mt-1 text-[12px] text-gray-500">
                    Submit a meal cancellation request using the form.
                  </p>
                </div>
              </div>
            ) : (
              rows.map((r) => {
                const st = STATUS_STYLES[r.status] || STATUS_STYLES.pending;
                const StatusIcon = st.icon;
                return (
                  <div
                    key={r.id}
                    className="relative overflow-hidden rounded-2xl border border-black/[0.05] bg-white p-4 pl-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <span
                      className="absolute inset-y-0 left-0 w-1 bg-lime"
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`grid h-8 w-8 place-items-center rounded-lg ${st.bg}`}
                          >
                            <StatusIcon className={`h-4 w-4 ${st.iconColor}`} />
                          </span>
                          <div>
                            <p className="text-[14px] font-extrabold tracking-tight text-charcoal">
                              {fmtDate(r.date)}
                            </p>
                            <p className="text-[11px] font-semibold text-gray-400">
                              {r.meal_type_display}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${st.bg} ${st.text} ${st.ring}`}
                          >
                            {r.status_display}
                          </span>
                          {r.department && (
                            <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-bold text-gray-500">
                              {r.department}
                            </span>
                          )}
                        </div>
                      </div>

                      {r.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => withdraw(r.id)}
                          className="shrink-0 rounded-lg border border-black/[0.06] bg-white px-3 py-1.5 text-[11px] font-semibold text-gray-500 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                        >
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
