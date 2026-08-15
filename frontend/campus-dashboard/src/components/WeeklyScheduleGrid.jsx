import { useMemo } from 'react';
import { timeRangesOverlap } from '../lib/cancellations';
import { slotLabel } from '../lib/routines';
import { BanIcon, BuildingIcon, GraduationIcon } from './Icons';

// Default weekly teaching grid: Sunday → Thursday, 8:00 AM – 4:00 PM (hourly cells).
const DEFAULT_DAYS = [
  { code: 'SUN', label: 'Sunday', short: 'Sun' },
  { code: 'MON', label: 'Monday', short: 'Mon' },
  { code: 'TUE', label: 'Tuesday', short: 'Tue' },
  { code: 'WED', label: 'Wednesday', short: 'Wed' },
  { code: 'THU', label: 'Thursday', short: 'Thu' },
];

/** '09:00' & '10:00' -> true when the [s, e) window overlaps [cs, ce). */
function overlaps(s, e, cs, ce) {
  return s < ce && e > cs;
}

/**
 * Weekly timetable grid shared by the Faculty Dashboard and the two-tab
 * Routines page. Renders hourly time cells across the given days; each cell
 * holds chips for the classes overlapping it (a class spanning several hours
 * shows its full chip in the starting cell and a dimmed "↳ continued" chip
 * afterwards). Empty cells get a subtle "Free Slot" badge.
 *
 * Props:
 *  - slots:        [{id, day, start_time, end_time, subject, room, building,
 *                    department, batch, section}] with 24h 'HH:MM' times.
 *  - days:         Optional [{code, label, short}] column set (default Sun-Thu).
 *  - hourStart/End Optional grid window (default 8 / 16).
 *  - loading/error/onRetry: state plumbing for the loading skeleton & retry.
 *  - onCancelSlot: Optional (slot) => void — renders a hover cancel button on
 *                  the starting chip of each class (faculty views).
 *  - cancellations / isOwnRoutine: Optional — when the view is the student's
 *                  own routine, matching cancellations replace the cell with a
 *                  red CANCELLED card.
 *  - showFaculty:  Optional — also render the assigned faculty name on each
 *                  chip (used by the All Routines browse view).
 *  - emptyIcon/Title/Sub: empty-state copy when no slots match.
 */
export default function WeeklyScheduleGrid({
  slots,
  days = DEFAULT_DAYS,
  hourStart = 8,
  hourEnd = 16,
  loading,
  error,
  onRetry,
  onCancelSlot,
  cancellations = [],
  isOwnRoutine = false,
  showFaculty = false,
  emptyIcon: EmptyIcon = GraduationIcon,
  emptyTitle = 'No classes assigned yet',
  emptySub = 'Once an admin publishes routines for your classes, they will appear here as a weekly timetable.',
}) {
  // Hourly cells -> the classes overlapping each cell (occupancy view).
  const hours = useMemo(
    () =>
      Array.from({ length: hourEnd - hourStart }, (_, i) => hourStart + i).map((h) => ({
        start: `${String(h).padStart(2, '0')}:00`,
        end: `${String(h + 1).padStart(2, '0')}:00`,
      })),
    [hourStart, hourEnd],
  );
  const cellsFor = (dayCode, cell) =>
    slots.filter(
      (s) => s.day === dayCode && overlaps(s.start_time, s.end_time, cell.start, cell.end),
    );

  return (
    <div>
      {loading ? (
        <div className="space-y-3 p-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="h-9 w-24 animate-pulse rounded-lg bg-black/[0.06]" />
              {days.map((d) => (
                <div key={d.code} className="h-14 flex-1 animate-pulse rounded-lg bg-black/[0.04]" />
              ))}
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="grid min-h-[260px] place-items-center p-8 text-center">
          <div>
            <h3 className="text-[15px] font-bold text-charcoal">Couldn't load this schedule</h3>
            <p className="mt-1 text-[12.5px] text-gray-500">Check your connection and try again.</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
            >
              Try again
            </button>
          </div>
        </div>
      ) : slots.length === 0 ? (
        <div className="grid min-h-[280px] place-items-center p-8 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
              <EmptyIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-[15px] font-bold text-charcoal">{emptyTitle}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-gray-500">{emptySub}</p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className="border-b border-r border-slate-200/80 bg-panel px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400">
                  Time
                </th>
                {days.map((d) => (
                  <th
                    key={d.code}
                    className="border-b border-slate-200/80 bg-panel px-3 py-3 text-center text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400"
                  >
                    {d.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map((cell, hi) => (
                <tr key={cell.start} className={hi % 2 ? 'bg-canvas/40' : 'bg-white'}>
                  <td className="border-b border-r border-slate-200/80 px-4 py-2 align-top">
                    <p className="whitespace-nowrap pt-1 text-[11.5px] font-extrabold text-charcoal">
                      {slotLabel(cell.start, cell.end)}
                    </p>
                  </td>
                  {days.map((d) => {
                    const chips = cellsFor(d.code, cell);
                    // A cancelled class for this weekday + time window replaces
                    // the slot with a red alert. The slot is only painted when
                    // it actually holds the cancelled course (or is empty — the
                    // routine may not list it, but students still get the alert).
                    const cancelledFor = isOwnRoutine
                      ? cancellations.find((c) => {
                          if (c.day !== d.code) return false;
                          if (!timeRangesOverlap(c.start_time, c.end_time, cell.start, cell.end))
                            return false;
                          return chips.length === 0 || chips.some((s) => s.subject === c.course_code);
                        })
                      : null;
                    return (
                      <td key={d.code} className="border-b border-slate-200/80 px-2 py-2 align-top">
                        {cancelledFor ? (
                          <div className="h-[64px] rounded-xl border border-rose-300 bg-rose-50 px-2.5 py-2">
                            <p className="text-[10.5px] font-extrabold uppercase tracking-wide text-rose-600">
                              🔴 CANCELLED
                            </p>
                            <p className="mt-0.5 text-[12px] font-bold leading-tight text-rose-800">
                              {cancelledFor.course_code}
                            </p>
                            <p className="mt-0.5 truncate text-[10.5px] font-semibold text-rose-600">
                              {cancelledFor.reason_label}
                            </p>
                          </div>
                        ) : chips.length === 0 ? (
                          <div className="grid h-[64px] place-items-center rounded-xl border border-dashed border-slate-200/80 bg-canvas/30">
                            <span className="rounded-full bg-white/70 px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.12em] text-gray-300">
                              Free Slot
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1.5">
                            {chips.map((s) => {
                              // A class spanning several hours shows its full
                              // chip in the starting cell and a dimmed
                              // "continued" chip in the following cells.
                              const startsHere = s.start_time === cell.start;
                              return (
                                <div
                                  key={s.id}
                                  className={`group relative rounded-xl border px-2.5 py-2 ${
                                    startsHere
                                      ? 'border-lime-deep/20 bg-lime/10 pr-8'
                                      : 'border-slate-200/80 bg-lime/5'
                                  }`}
                                >
                                  {startsHere && onCancelSlot && (
                                    <button
                                      type="button"
                                      onClick={() => onCancelSlot(s)}
                                      aria-label={`Cancel ${s.subject}`}
                                      title={`Cancel ${s.subject}`}
                                      className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-rose-500 opacity-0 shadow-sm transition focus-visible:opacity-100 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600"
                                    >
                                      <BanIcon className="h-3 w-3" />
                                    </button>
                                  )}
                                  <p
                                    className={`text-[12px] font-bold leading-tight ${
                                      startsHere ? 'text-charcoal' : 'text-gray-500'
                                    }`}
                                  >
                                    {startsHere ? s.subject : `↳ ${s.subject}`}
                                  </p>
                                  <p className="mt-0.5 flex items-center gap-1 text-[10.5px] font-semibold text-lime-deep">
                                    {s.room && (
                                      <>
                                        <BuildingIcon className="h-3 w-3 shrink-0" />
                                        Room {s.room}
                                        {s.building ? ` · ${s.building}` : ''}
                                      </>
                                    )}
                                  </p>
                                  <p className="mt-0.5 text-[10px] font-semibold text-gray-500">
                                    {s.department} · Batch {s.batch} · Sec {s.section}
                                  </p>
                                  {showFaculty && s.faculty && (
                                    <p className="mt-1 truncate rounded-md bg-white/60 px-1.5 py-0.5 text-[9.5px] font-semibold text-gray-500">
                                      👤 {s.faculty}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
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
      )}
    </div>
  );
}
