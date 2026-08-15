import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getCsrfToken } from '../lib/csrf';
import {
  BackArrowIcon,
  CaretDownIcon,
  CircleCheckIcon,
  ClockIcon,
  PlusIcon,
  RoutinesIcon,
  TrashIcon,
  XIcon,
} from '../components/Icons';
import {
  BATCHES,
  DAYS,
  DEPARTMENTS,
  DEPT_SECTIONS,
  defaultRow,
  from12h,
  nextSlot,
} from '../lib/routines';

const thClass = 'px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400';
const cellInputClass =
  'w-full rounded-lg border border-black/[0.07] bg-white px-2.5 py-2 text-[12.5px] text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

export default function RoutineEdit() {
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

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const rowCounter = useRef(1);
  const [facultyOptions, setFacultyOptions] = useState([]);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const query = () => `?dept=${department}&batch=${batch}&sec=${section}`;

  // Faculty dropdown suggestions: approved teachers from the user directory.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/users/', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const names = [
          ...new Set(
            (data.users || [])
              .filter((u) => u.role === 'teacher')
              .map((u) => u.full_name.trim())
              .filter(Boolean),
          ),
        ];
        setFacultyOptions(names);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

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
      const loaded = (data.slots || []).map((s) => ({
        id: rowCounter.current++,
        day: s.day,
        start_time: from12h(s.start_time),
        end_time: from12h(s.end_time),
        subject: s.subject,
        faculty: s.faculty,
        room: s.room,
      }));
      // Fresh page -> exactly ONE row: Row 1 defaults to Sunday, 08:00 AM - 09:00 AM.
      setRows(loaded.length ? loaded : [{ ...defaultRow(), id: rowCounter.current++ }]);
    } catch (err) {
      setLoadError(err.message);
      setRows([{ ...defaultRow(), id: rowCounter.current++ }]);
    } finally {
      setLoading(false);
    }
  }, [department, batch, section]);

  useEffect(() => {
    if (!invalid) loadRoutine();
  }, [invalid, loadRoutine]);

  // ---- Row editing ----
  // Strict incremental logic (see lib/routines.js nextSlot): the first row
  // defaults to Sunday, "+ Add Slot" advances the day through the sequence
  // (Sun -> Mon -> Tue -> Wed -> Thu -> Sat, wrapping back to Sun) and
  // continues the time hourly from the last row's end (08:00-09:00 -> 09:00-10:00).
  // Because it always reads the CURRENT last row, deleting a row re-bases the
  // sequence so the next added slot continues from the new last row. The Day
  // field stays an editable dropdown for manual override.
  const addRow = () =>
    setRows((prev) => [...prev, { id: rowCounter.current++, ...nextSlot(prev) }]);

  const updateRow = (id, field, value) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const deleteRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const buildSlots = () => {
    const slots = [];
    for (let i = 0; i < rows.length; i += 1) {
      const r = rows[i];
      const slot = {
        day: r.day,
        start_time: r.start_time,
        end_time: r.end_time,
        subject: r.subject.trim(),
        faculty: r.faculty.trim(),
        room: r.room.trim(),
      };
      // A row counts as "blank" only when nothing was typed — the pre-filled
      // start/end times are always present, so they must not make a row look
      // filled. Matches the live preview's definition of a blank row.
      const hasContent = slot.faculty || slot.room;
      if (!slot.subject && !hasContent) continue; // fully blank row
      if (!slot.subject) return { error: `Row ${i + 1} needs a subject before saving.` };
      slots.push(slot);
    }
    if (!slots.length) return { error: 'Add at least one class with a subject before saving.' };
    return { slots };
  };

  const saveRoutine = async (thenView) => {
    if (invalid) {
      showToast('That selection is not valid.', true);
      return;
    }
    const built = buildSlots();
    if (built.error) {
      showToast(built.error, true);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/routines/', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
        body: JSON.stringify({ department, batch, section, slots: built.slots }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save this routine.');
      showToast(`Routine saved for ${department} · Batch ${batch} · Section ${section}.`);
      await loadRoutine(); // canonical rows from the server
      if (thenView) navigate(`/routines/download${query()}`);
    } catch (err) {
      showToast(err.message || 'Could not save this routine.', true);
    } finally {
      setSaving(false);
    }
  };

  const deptName = useMemo(
    () => (DEPARTMENTS.find((d) => d.code === department) || {}).name || department,
    [department],
  );

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

      {/* Context banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/[0.05] bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
            <RoutinesIcon className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-charcoal">
              Editing Routine: {department} | Batch {batch} | Section {section}
            </p>
            <p className="text-[11.5px] text-gray-400">{deptName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/routines')}
          className="inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
        >
          <BackArrowIcon className="h-4 w-4" />
          Back to Selection
        </button>
      </div>

      {/* Edit table */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/[0.05] p-5">
          <div>
            <h2 className="text-[15px] font-bold tracking-tight text-charcoal">Edit Routine</h2>
            <p className="mt-0.5 text-[11.5px] text-gray-400">
              Time slots start at 08:00 AM · “+ Add Slot” advances to the next day and continues the hourly sequence.
            </p>
          </div>
          <button
            type="button"
            onClick={addRow}
            className="inline-flex items-center gap-1.5 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2 text-[12px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
          >
            <PlusIcon className="h-3.5 w-3.5 text-lime-deep" />
            Add Slot
          </button>
        </div>

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
          ) : (
            <table className="w-full min-w-[900px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.05] bg-panel/60">
                  <th className={thClass}>Day</th>
                  <th className={thClass}>Start</th>
                  <th className={thClass}>End</th>
                  <th className={thClass}>Subject Name / Code</th>
                  <th className={thClass}>Faculty Name</th>
                  <th className={thClass}>Room No.</th>
                  <th className={`${thClass} w-14 text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-black/[0.04] transition last:border-0 hover:bg-canvas/60">
                    {/* Day */}
                    <td className="px-4 py-3 align-middle">
                      <div className="relative">
                        <select
                          value={row.day}
                          onChange={(e) => updateRow(row.id, 'day', e.target.value)}
                          aria-label="Day"
                          className={`${cellInputClass} appearance-none pr-7 font-semibold`}
                        >
                          {DAYS.map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.label}
                            </option>
                          ))}
                        </select>
                        <CaretDownIcon className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                      </div>
                    </td>

                    {/* Start / End */}
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="time"
                        value={row.start_time}
                        onChange={(e) => updateRow(row.id, 'start_time', e.target.value)}
                        aria-label="Start time"
                        className={`${cellInputClass} w-28`}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="time"
                        value={row.end_time}
                        onChange={(e) => updateRow(row.id, 'end_time', e.target.value)}
                        aria-label="End time"
                        className={`${cellInputClass} w-28`}
                      />
                    </td>

                    {/* Subject */}
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="text"
                        value={row.subject}
                        onChange={(e) => updateRow(row.id, 'subject', e.target.value)}
                        placeholder="e.g. CSE-2101 Data Structures"
                        aria-label="Subject code and name"
                        className={cellInputClass}
                      />
                    </td>

                    {/* Faculty */}
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="text"
                        list="routine-faculty-list"
                        value={row.faculty}
                        onChange={(e) => updateRow(row.id, 'faculty', e.target.value)}
                        placeholder="Faculty name"
                        aria-label="Faculty name"
                        className={cellInputClass}
                      />
                    </td>

                    {/* Room */}
                    <td className="px-4 py-3 align-middle">
                      <input
                        type="text"
                        value={row.room}
                        onChange={(e) => updateRow(row.id, 'room', e.target.value)}
                        placeholder="e.g. C-201"
                        aria-label="Room number"
                        className={cellInputClass}
                      />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right align-middle">
                      <button
                        type="button"
                        onClick={() => deleteRow(row.id)}
                        disabled={rows.length <= 1}
                        title={rows.length <= 1 ? 'Keep at least one row' : 'Delete row'}
                        className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-gray-300 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {!loading && !loadError && (
          <div className="border-t border-black/[0.05] p-4">
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-lime-deep/40 bg-lime/10 px-4 py-2.5 text-[12.5px] font-bold text-lime-deep transition hover:-translate-y-0.5 hover:bg-lime/25 hover:shadow-md"
            >
              <PlusIcon className="h-4 w-4" />
              Add Slot
            </button>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => saveRoutine(false)}
          disabled={saving}
          className="rounded-xl border border-black/[0.06] bg-white px-6 py-3 text-[13px] font-bold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save Routine'}
        </button>
        <button
          type="button"
          onClick={() => saveRoutine(true)}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-lime px-6 py-3 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RoutinesIcon className="h-4 w-4" />
          {saving ? 'Saving…' : 'Save & View Routine'}
        </button>
      </div>

      {/* Faculty datalist */}
      {facultyOptions.length > 0 && (
        <datalist id="routine-faculty-list">
          {facultyOptions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}

      <p className="mt-4 flex items-center gap-2 text-[11.5px] text-gray-400">
        <ClockIcon className="h-3.5 w-3.5" />
        Day sequence: Sunday → Monday → Tuesday → Wednesday → Thursday → Saturday · “Save &amp; View” opens the timetable.
      </p>
    </div>
  );
}
