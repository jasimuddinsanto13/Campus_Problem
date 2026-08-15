import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BackArrowIcon,
  CircleCheckIcon,
  DownloadIcon,
  PencilIcon,
  RoutinesIcon,
  XIcon,
} from '../components/Icons';
import {
  BATCHES,
  DAYS,
  DEPARTMENTS,
  DEPT_SECTIONS,
  buildPeriods,
  exportRoutinePdf,
  from12h,
  slotLabel,
} from '../lib/routines';

export default function RoutineDownload() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const department = (searchParams.get('dept') || '').toUpperCase();
  const batch = searchParams.get('batch') || '';
  const section = (searchParams.get('sec') || '').toUpperCase();

  // Validate the query params against the known options.
  const invalid =
    !DEPARTMENTS.some((d) => d.code === department) ||
    !BATCHES.includes(batch) ||
    !(DEPT_SECTIONS[department] || []).includes(section);

  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [exporting, setExporting] = useState(false);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const query = () => `?dept=${department}&batch=${batch}&sec=${section}`;

  const loadRoutine = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/routines/?department=${department}&batch=${batch}&section=${section}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load this routine.');
      // Normalize API 12h times ('8:00 AM') to 24h ('08:00') so the timetable
      // rows sort chronologically (lexicographic 12h sort would put 10 AM first).
      setSlots(
        (data.slots || []).map((s) => ({ ...s, start_time: from12h(s.start_time), end_time: from12h(s.end_time) })),
      );
    } catch (err) {
      setLoadError(err.message);
      setSlots([]);
    } finally {
      setLoading(false);
    }
  }, [department, batch, section]);

  useEffect(() => {
    if (!invalid) loadRoutine();
  }, [invalid, loadRoutine]);

  // Weekly matrix: time periods as rows, days as columns.
  const periods = useMemo(() => buildPeriods(slots), [slots]);
  const hasRoutine = periods.length > 0;

  const deptName = useMemo(
    () => (DEPARTMENTS.find((d) => d.code === department) || {}).name || department,
    [department],
  );

  const downloadPdf = () => {
    if (!hasRoutine) {
      showToast('Nothing to export yet — create a routine first.', true);
      return;
    }
    setExporting(true);
    // Defer so the busy state paints before the synchronous PDF draw.
    setTimeout(() => {
      try {
        exportRoutinePdf(periods, { department, batch, section });
      } catch (err) {
        showToast('Could not generate the PDF.', true);
      } finally {
        setExporting(false);
      }
    }, 60);
  };

  const crumb = ['Admin portal', 'Routines'];
  if (department) crumb.push(department);
  if (batch != null) crumb.push(`Batch ${batch}`);
  if (section) crumb.push(`Section ${section}`);

  if (invalid) {
    return (
      <div className="animate-[fadeIn_.35s_ease]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">Routines management</p>
        <div className="mt-8 grid min-h-[320px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/60 p-8">
          <div className="max-w-sm text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
              <RoutinesIcon className="h-6 w-6" />
            </span>
            <h2 className="mt-4 text-[15px] font-bold text-charcoal">Invalid selection</h2>
            <p className="mt-1 text-[12.5px] text-gray-500">
              Please pick a department, batch and section from the routines menu.
            </p>
            <button
              type="button"
              onClick={() => navigate('/routines')}
              className="mt-4 rounded-xl bg-lime px-4 py-2 text-[12px] font-bold text-charcoal shadow-sm shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-md"
            >
              Back to Selection
            </button>
          </div>
        </div>
      </div>
    );
  }

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

      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
            <RoutinesIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-charcoal">
              Department: {department} | Batch: {batch} | Section: {section}
            </p>
            <p className="text-[11.5px] text-gray-400">{deptName}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(`/routines/edit${query()}`)}
            className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
          >
            <PencilIcon className="h-4 w-4" />
            Edit Routine
          </button>
          <button
            type="button"
            onClick={downloadPdf}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <DownloadIcon className="h-4 w-4" />
            {exporting ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-1.5 text-[12px]">
        {crumb.map((part, i) => (
          <span key={part} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-300">/</span>}
            <span className={i === crumb.length - 1 ? 'font-bold text-charcoal' : 'text-gray-400'}>{part}</span>
          </span>
        ))}
      </nav>

      {/* ---- Body ---- */}
      {loading ? (
        <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.05] bg-white p-6 shadow-sm">
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <div className="h-10 w-28 animate-pulse rounded-lg bg-black/[0.06]" />
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="h-16 flex-1 animate-pulse rounded-lg bg-black/[0.04]" />
                ))}
              </div>
            ))}
          </div>
        </div>
      ) : loadError ? (
        <div className="mt-5 grid min-h-[300px] place-items-center rounded-2xl border border-black/[0.05] bg-white p-8 text-center shadow-sm">
          <div>
            <h3 className="text-[15px] font-bold text-charcoal">Couldn't load this routine</h3>
            <p className="mt-1 text-[12.5px] text-gray-500">{loadError}</p>
            <button
              type="button"
              onClick={loadRoutine}
              className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
            >
              Try again
            </button>
          </div>
        </div>
      ) : !hasRoutine ? (
        /* ---- Empty state ---- */
        <div className="mt-5 grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-black/10 bg-white/60 p-8 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
              <RoutinesIcon className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-[18px] font-extrabold tracking-tight text-charcoal">No routine created yet</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-gray-500">
              The schedule for {department} · Batch {batch} · Section {section} is empty. Create one to see the weekly
              timetable and export a printable PDF.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/routines/edit${query()}`)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-lime px-5 py-3 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <PencilIcon className="h-4 w-4" />
              Create Routine
            </button>
          </div>
        </div>
      ) : (
        /* ---- Weekly timetable matrix ---- */
        <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.05] p-5">
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-charcoal">Weekly Timetable</h2>
              <p className="mt-0.5 text-[11.5px] text-gray-400">
                {periods.length} time {periods.length === 1 ? 'period' : 'periods'} · {department} Batch {batch} (Sec{' '}
                {section})
              </p>
            </div>
            <button
              type="button"
              onClick={downloadPdf}
              disabled={exporting}
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadIcon className="h-4 w-4" />
              {exporting ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-black/[0.06] bg-panel px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    Time
                  </th>
                  {DAYS.map((d) => (
                    <th
                      key={d.code}
                      className="border-b border-black/[0.06] bg-panel px-3 py-3 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400"
                    >
                      {d.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period, pi) => (
                  <tr key={`${period.start}|${period.end}`} className={pi % 2 ? 'bg-canvas/40' : 'bg-white'}>
                    <td
                      className={`sticky left-0 z-10 border-b border-r border-black/[0.05] px-4 py-3 align-top ${
                        pi % 2 ? 'bg-canvas/40' : 'bg-white'
                      }`}
                    >
                      <p className="text-[12px] font-extrabold text-charcoal">
                        {slotLabel(period.start, period.end)}
                      </p>
                    </td>
                    {DAYS.map((d) => {
                      const cells = period.cells[d.code] || [];
                      return (
                        <td key={d.code} className="border-b border-black/[0.05] px-2 py-2 align-top">
                          {cells.length === 0 ? (
                            <div className="h-[68px] rounded-lg border border-dashed border-black/[0.05] bg-canvas/30" />
                          ) : (
                            <div className="space-y-1.5">
                              {cells.map((s, ci) => (
                                <div
                                  key={`${pi}-${d.code}-${ci}`}
                                  className="rounded-xl border border-lime-deep/20 bg-lime/10 px-2.5 py-2"
                                >
                                  <p className="text-[12px] font-bold leading-tight text-charcoal">{s.subject}</p>
                                  {s.room && <p className="mt-0.5 text-[10.5px] font-semibold text-lime-deep">Room: {s.room}</p>}
                                  {s.faculty && <p className="mt-0.5 text-[10.5px] text-gray-500">{s.faculty}</p>}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="mt-4 flex items-center gap-2 text-[11.5px] text-gray-400">
        <BackArrowIcon className="h-3.5 w-3.5" />
        Need changes? Use “Edit Routine” above, or pick another section from the Routines menu.
      </p>
    </div>
  );
}
