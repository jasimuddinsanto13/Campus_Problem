import { useCallback, useEffect, useState } from 'react';
import { useUser } from '../context/UserContext';
import { fmtCancellationDate, todayISO } from '../lib/cancellations';
import { AlertOctagonIcon, CalendarXIcon, ClockIcon, MegaphoneIcon, RefreshIcon } from '../components/Icons';

export default function StudentCancellations() {
  const { department, batch, section } = useUser();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
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
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const todayCount = (rows || []).filter((c) => c.date === todayISO()).length;
  const scope = [department, batch && `Batch ${batch}`, section && `Sec ${section}`]
    .filter(Boolean)
    .join(' · ') || 'your class';

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Cancellations
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
            Class cancellation alerts
          </h1>
          <p className="mt-1.5 max-w-xl text-[13.5px] leading-relaxed text-gray-500">
            Classes cancelled for {scope} — updated the moment a teacher cancels.
          </p>
        </div>

        {/* Today's cancellations badge */}
        {rows != null && rows.length > 0 && (
          <span
            className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-[12.5px] font-extrabold shadow-sm ${
              todayCount > 0
                ? 'bg-rose-600 text-white shadow-rose-600/30 animate-[fadeIn_.35s_ease]'
                : 'bg-rose-50 text-rose-600 ring-1 ring-rose-200'
            }`}
          >
            <AlertOctagonIcon className="h-4 w-4" />
            {todayCount > 0 ? `${todayCount} today` : 'No cancellations today'}
          </span>
        )}
      </div>

      <div className="mt-5 flex items-center justify-end">
        <button
          type="button"
          onClick={load}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-[12px] font-semibold text-gray-500 shadow-sm transition hover:text-charcoal hover:shadow-md"
        >
          <RefreshIcon className="h-3.5 w-3.5 transition group-hover:rotate-180" />
          Refresh
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] font-semibold text-rose-600">
          {error}
        </p>
      )}

      {/* Active cancellations list */}
      <div className="mt-4 space-y-3">
        {rows == null ? (
          [0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-black/[0.05] bg-white p-4 shadow-sm">
              <div className="h-3.5 w-56 animate-pulse rounded bg-black/[0.06]" />
              <div className="mt-2.5 h-3 w-40 animate-pulse rounded bg-black/[0.04]" />
            </div>
          ))
        ) : rows.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/60 p-8 text-center">
            <div className="max-w-sm">
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                <CalendarXIcon className="h-6 w-6" />
              </span>
              <h2 className="mt-4 text-[16px] font-bold text-charcoal">No classes cancelled</h2>
              <p className="mt-1 text-[12.5px] text-gray-500">
                Good news — none of your upcoming {scope} classes have been cancelled.
              </p>
            </div>
          </div>
        ) : (
          rows.map((c) => {
            const today = c.date === todayISO();
            return (
              <div
                key={c.id}
                className={`relative overflow-hidden rounded-2xl border bg-white p-5 pl-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  today ? 'border-rose-300' : 'border-orange-200'
                }`}
              >
                <span
                  className={`absolute inset-y-0 left-0 w-1 ${today ? 'bg-rose-500' : 'bg-orange-400'}`}
                  aria-hidden="true"
                />
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`grid h-9 w-9 place-items-center rounded-xl ${today ? 'bg-rose-100 text-rose-600' : 'bg-orange-100 text-orange-600'}`}>
                        <MegaphoneIcon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-[15px] font-extrabold tracking-tight text-charcoal">
                          {c.course_code}
                        </p>
                        <p className="text-[11px] font-semibold text-gray-400">
                          by {c.faculty}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px]">
                      <span className="inline-flex items-center gap-1.5 font-bold text-charcoal">
                        <CalendarXIcon className="h-3.5 w-3.5 text-rose-500" />
                        {fmtCancellationDate(c.date)}
                      </span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-gray-600">
                        <ClockIcon className="h-3.5 w-3.5 text-gray-400" />
                        {c.start_label} – {c.end_label}
                      </span>
                      <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[10.5px] font-bold text-gray-500">
                        {c.department} · Batch {c.batch} · Sec {c.section}
                      </span>
                    </div>

                    <p className="mt-2.5 text-[12.5px] leading-relaxed text-gray-600">
                      {c.reason_label}
                      {c.reason_note ? <span className="text-gray-400"> — {c.reason_note}</span> : null}
                    </p>
                  </div>

                  {today && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white shadow-sm shadow-rose-600/30">
                      <AlertOctagonIcon className="h-3.5 w-3.5" />
                      Today
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
