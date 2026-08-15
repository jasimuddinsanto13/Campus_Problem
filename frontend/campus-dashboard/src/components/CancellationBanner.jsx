import { useCallback, useEffect, useState } from 'react';
import { fmtCancellationDate } from '../lib/cancellations';
import { BanIcon, ClockIcon, MegaphoneIcon, RefreshIcon, XIcon } from './Icons';

/**
 * High-priority class-cancellation alerts for the student dashboard.
 *
 * Fetches GET /api/student/cancellations/ (scoped server-side to the
 * student's own department / batch / section, today & upcoming) and renders
 * each active cancellation as a red alert card.
 */
export default function CancellationBanner() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dismissed, setDismissed] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/student/cancellations/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load cancellations.');
      setRows(data.cancellations || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // A foreground FCM push (or any 'app:cancellation-push' event) refreshes
  // the alerts immediately, so the banner appears the moment a class is
  // cancelled while the student is on the dashboard.
  useEffect(() => {
    const onPush = () => load();
    window.addEventListener('app:cancellation-push', onPush);
    return () => window.removeEventListener('app:cancellation-push', onPush);
  }, [load]);

  const visible = rows.filter((c) => !dismissed[c.id]);
  if (!loading && !error && visible.length === 0) return null;

  return (
    <section className="animate-[fadeIn_.35s_ease]" aria-label="Class cancellations">
      {/* Section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-100 text-rose-600">
            <BanIcon className="h-4 w-4" />
          </span>
          <h2 className="text-[13.5px] font-extrabold tracking-tight text-charcoal">
            Class cancellation alerts
          </h2>
          {!loading && rows.length > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10.5px] font-bold text-rose-600">
              {rows.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={load}
          className="group flex items-center gap-1.5 rounded-lg border border-black/[0.06] bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-gray-500 shadow-sm transition hover:text-charcoal hover:shadow"
        >
          <RefreshIcon className="h-3.5 w-3.5 transition group-hover:rotate-180" />
          Refresh
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {loading ? (
          [0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-rose-200 bg-rose-50 p-4 shadow-sm">
              <div className="h-3.5 w-56 animate-pulse rounded bg-rose-200/60" />
              <div className="mt-2.5 h-3 w-40 animate-pulse rounded bg-rose-200/40" />
            </div>
          ))
        ) : error ? (
          <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/60 p-4 text-center">
            <p className="text-[12.5px] font-semibold text-rose-600">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-2 rounded-lg bg-ink px-3 py-1.5 text-[11.5px] font-bold text-white transition hover:bg-black"
            >
              Try again
            </button>
          </div>
        ) : (
          visible.map((c) => {
            const today = fmtCancellationDate(c.date) === 'Today';
            return (
              <div
                key={c.id}
                className={`relative overflow-hidden rounded-2xl border bg-white p-4 pl-5 shadow-sm ${
                  today ? 'border-rose-300' : 'border-orange-200'
                }`}
              >
                {/* Accent bar */}
                <span
                  className={`absolute inset-y-0 left-0 w-1 ${today ? 'bg-rose-500' : 'bg-orange-400'}`}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={() => setDismissed((d) => ({ ...d, [c.id]: true }))}
                  aria-label="Dismiss alert"
                  className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-lg text-gray-300 transition hover:bg-rose-50 hover:text-rose-500"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>

                <div className="flex items-start gap-3">
                  <span
                    className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                      today ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'
                    }`}
                  >
                    <MegaphoneIcon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1 pr-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-[14px] font-extrabold tracking-tight ${today ? 'text-rose-700' : 'text-orange-700'}`}>
                        {today ? '🚨 Class cancelled today' : '🚨 Class cancelled'}
                      </p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${
                          today ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'
                        }`}
                      >
                        {fmtCancellationDate(c.date)}
                      </span>
                    </div>
                    <p className="mt-1 text-[13px] font-bold text-charcoal">
                      {c.course_code}
                      <span className="ml-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-gray-500">
                        <ClockIcon className="h-3.5 w-3.5" />
                        {c.start_label} – {c.end_label}
                      </span>
                    </p>
                    <p className="mt-1 text-[12px] text-gray-500">
                      {c.reason_label}
                      {c.reason_note ? ` — ${c.reason_note}` : ''}
                    </p>
                    <p className="mt-1 text-[11px] font-semibold text-gray-400">
                      by {c.faculty} · {c.department} Batch {c.batch} Sec {c.section}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
