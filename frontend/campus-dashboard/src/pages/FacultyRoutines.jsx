import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUser } from '../context/UserContext';
import CancelClassModal from '../components/CancelClassModal';
import WeeklyScheduleGrid from '../components/WeeklyScheduleGrid';
import {
  BackArrowIcon,
  BanIcon,
  ChevronRightIcon,
  DownloadIcon,
  GraduationIcon,
  RoutinesIcon,
} from '../components/Icons';
import {
  BATCHES,
  DAYS,
  DEPARTMENTS,
  DEPT_SECTIONS,
  buildPeriods,
  exportRoutinePdf,
} from '../lib/routines';

const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/** Next calendar date that falls on the given weekday code ('SUN'..'SAT'). */
function nextDateForDay(dayCode) {
  const today = new Date();
  const diff = (DAY_INDEX[dayCode] - today.getDay() + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toISOString().slice(0, 10);
}

/**
 * Faculty Routines — a two-tab view:
 *  - "My Routine": the signed-in user's own weekly schedule (faculty fetch
 *    /api/routines/my-schedule/, students their department section), rendered
 *    as a Sun–Thu hourly grid with export.
 *  - "All Routines": the department -> batch -> section browse wizard, using
 *    /api/routines/department/ so any published section can be inspected.
 */
export default function FacultyRoutines() {
  const user = useUser();
  const [activeTab, setActiveTab] = useState('my-routine');

  // ---- My Routine: personal weekly schedule -------------------------------
  const [mine, setMine] = useState({ loading: true, error: false, slots: [] });
  const myScheduleUrl =
    user.role === 'teacher'
      ? '/api/routines/my-schedule/'
      : user.department && user.batch != null
        ? `/api/routines/department/?dept=${user.department}&batch=${user.batch}&section=${user.section || 'A'}`
        : null;

  const loadMine = useCallback(() => {
    if (!myScheduleUrl) {
      setMine({ loading: false, error: false, slots: [] });
      return;
    }
    setMine((prev) => ({ ...prev, loading: true, error: false }));
    fetch(myScheduleUrl, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMine({ loading: false, error: false, slots: data?.slots || [] }))
      .catch(() => setMine({ loading: false, error: true, slots: [] }));
  }, [myScheduleUrl]);
  useEffect(() => {
    loadMine();
  }, [loadMine]);

  // ---- Cancel-class modal (shared by both tabs) ---------------------------
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelDefaults, setCancelDefaults] = useState(null);
  const openCancelForSlot = (slot) => {
    setCancelDefaults({
      department: slot.department,
      batch: slot.batch,
      section: slot.section,
      date: nextDateForDay(slot.day),
      course_code: slot.subject,
      start_time: slot.start_time,
      end_time: slot.end_time,
    });
    setCancelOpen(true);
  };

  // ---- Export / print the personal schedule -------------------------------
  const [exporting, setExporting] = useState(false);
  const downloadMyPdf = () => {
    const periods = buildPeriods(mine.slots);
    if (!periods.length) return;
    setExporting(true);
    setTimeout(() => {
      try {
        exportRoutinePdf(periods, {
          department: 'My Schedule',
          batch: '',
          section: '',
          title: 'My Teaching Schedule',
          subtitle:
            user.role === 'teacher'
              ? 'Faculty weekly timetable'
              : `${user.department} · Batch ${user.batch} · Section ${user.section}`,
          filename: 'My_Teaching_Schedule.pdf',
        });
      } finally {
        setExporting(false);
      }
    }, 60);
  };

  // ---- All Routines: department -> batch -> section wizard ----------------
  const [step, setStep] = useState('departments');
  const [department, setDepartment] = useState(null);
  const [batch, setBatch] = useState(null);
  const [section, setSection] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const deptSections = useMemo(() => DEPT_SECTIONS[department] || [], [department]);
  const deptName = useMemo(
    () => (DEPARTMENTS.find((d) => d.code === department) || {}).name || department,
    [department],
  );

  const loadRoutine = async (dept, b, sec) => {
    setLoading(true);
    setLoadError(null);
    setSlots([]);
    try {
      const res = await fetch(`/api/routines/department/?dept=${dept}&batch=${b}&section=${sec}`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load this routine.');
      setSlots(data.slots || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Grid window follows the loaded classes (so late/Saturday classes stay
  // visible), falling back to the standard 8:00 AM – 4:00 PM band.
  const hourBounds = useMemo(() => {
    if (!slots.length) return { hourStart: 8, hourEnd: 16 };
    let lo = 8;
    let hi = 16;
    for (const s of slots) {
      lo = Math.min(lo, Math.floor(Number(String(s.start_time).slice(0, 2))));
      const endHour = Number(String(s.end_time).slice(0, 2));
      const endMin = Number(String(s.end_time).slice(3, 5));
      hi = Math.max(hi, endMin ? endHour + 1 : endHour);
    }
    return { hourStart: lo, hourEnd: Math.min(hi, 23) };
  }, [slots]);

  const downloadSectionPdf = () => {
    const periods = buildPeriods(slots);
    if (!periods.length) return;
    setExporting(true);
    setTimeout(() => {
      try {
        exportRoutinePdf(periods, { department, batch, section });
      } finally {
        setExporting(false);
      }
    }, 60);
  };

  // ---- Student cancellation markings (their own section only) -------------
  const [cancellations, setCancellations] = useState([]);
  useEffect(() => {
    let cancelled = false;
    if (user.role !== 'student') {
      setCancellations([]);
      return () => {};
    }
    fetch('/api/student/cancellations/', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setCancellations(data.cancellations || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user.role]);

  const isOwnRoutine =
    user.role === 'student' &&
    department === user.department &&
    String(batch) === String(user.batch) &&
    section === user.section;

  // Cancellation markings apply on the My Routine tab only when the student is
  // viewing their own published section.
  const isMyRoutineOwn = user.role === 'student' && !!user.department && user.batch != null;

  const TABS = [
    { key: 'my-routine', label: 'My Routine' },
    { key: 'all-routines', label: 'All Routines' },
  ];

  return (
    <div className="animate-[fadeIn_.35s_ease] flex flex-col gap-6">
      {/* Header + pill tab switcher */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">Routines</p>

        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
              {activeTab === 'my-routine'
                ? 'My Teaching Schedule'
                : 'Browse Master Routines by Department & Batch'}
            </h1>
            <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-gray-500">
              {activeTab === 'my-routine'
                ? 'Your personal weekly timetable · Sun – Thu, 8:00 AM – 4:00 PM.'
                : 'Select a department and batch to view published weekly class routines across campus.'}
            </p>
          </div>

          {activeTab === 'my-routine' && (
            <button
              type="button"
              onClick={downloadMyPdf}
              disabled={exporting || mine.loading || !mine.slots.length}
              className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <DownloadIcon className="h-4 w-4" />
              {exporting ? 'Preparing…' : 'Export / Print My Schedule'}
            </button>
          )}
        </div>

        {/* Pill-style tab switcher */}
        <div
          role="tablist"
          aria-label="Routine views"
          className="mt-5 inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-black/[0.06] bg-white p-1.5 shadow-sm"
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12.5px] font-bold transition duration-150 ${
                  active
                    ? 'bg-ink text-white shadow-md shadow-black/15'
                    : 'text-gray-500 hover:bg-canvas hover:text-charcoal'
                }`}
              >
                {tab.key === 'my-routine' ? (
                  <RoutinesIcon className={`h-4 w-4 ${active ? 'text-lime' : 'text-gray-400'}`} />
                ) : (
                  <GraduationIcon className={`h-4 w-4 ${active ? 'text-lime' : 'text-gray-400'}`} />
                )}
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ================= TAB 1 — My Routine ================= */}
      {activeTab === 'my-routine' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-200/80 p-5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep">
              <RoutinesIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold tracking-tight text-charcoal">
                {user.role === 'teacher' ? 'My Teaching Schedule' : 'My Class Schedule'}
              </h2>
              <p className="mt-0.5 text-[12px] text-gray-500">
                {user.role === 'teacher'
                  ? 'Classes assigned to you · Sun – Thu, 8:00 AM – 4:00 PM'
                  : `${user.department} · Batch ${user.batch} · Section ${user.section || 'A'} — your published section routine`}
              </p>
            </div>
          </div>

          <WeeklyScheduleGrid
            slots={mine.slots}
            loading={mine.loading}
            error={mine.error}
            onRetry={loadMine}
            onCancelSlot={user.role === 'teacher' ? openCancelForSlot : undefined}
            cancellations={cancellations}
            isOwnRoutine={isMyRoutineOwn}
            emptyTitle={
              user.role === 'teacher'
                ? 'No classes assigned yet'
                : 'No routine published for your section'
            }
            emptySub={
              user.role === 'teacher'
                ? "Once an admin publishes routines for your classes, they'll appear here as a weekly timetable."
                : `${user.department} · Batch ${user.batch} · Section ${user.section || 'A'} has no schedule on file yet.`
            }
          />
        </div>
      )}

      {/* ================= TAB 2 — All Routines ================= */}
      {activeTab === 'all-routines' && (
        <>
          {/* STEP 1 — Departments */}
          {step === 'departments' && (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {DEPARTMENTS.map((dept) => (
                <button
                  key={dept.code}
                  type="button"
                  onClick={() => {
                    setDepartment(dept.code);
                    setBatch(null);
                    setSection(null);
                    setSlots([]);
                    setStep('batches');
                  }}
                  className="group flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-lime-deep/30 hover:shadow-lg"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep transition group-hover:bg-lime">
                    <GraduationIcon className="h-6 w-6" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[16px] font-extrabold tracking-tight text-charcoal">
                      {dept.code}
                    </span>
                    <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">
                      {dept.name}
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
                </button>
              ))}
            </div>
          )}

          {/* STEP 2 — Batches */}
          {step === 'batches' && (
            <div>
              <button
                type="button"
                onClick={() => setStep('departments')}
                className="mb-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
              >
                <BackArrowIcon className="h-4 w-4" />
                Back to Departments
              </button>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
                    <GraduationIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-bold text-charcoal">{department}</p>
                    <p className="text-[11.5px] text-gray-400">{deptName}</p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-9">
                  {BATCHES.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => {
                        setBatch(b);
                        setSection(null);
                        setSlots([]);
                        setStep('sections');
                      }}
                      className="rounded-xl border border-black/[0.06] bg-canvas/70 px-3 py-3 text-[13px] font-bold text-charcoal transition duration-150 hover:-translate-y-0.5 hover:border-lime-deep/40 hover:bg-lime hover:shadow-md"
                    >
                      Batch {b}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 3 — Sections */}
          {step === 'sections' && (
            <div>
              <button
                type="button"
                onClick={() => setStep('batches')}
                className="mb-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
              >
                <BackArrowIcon className="h-4 w-4" />
                Back to Batches
              </button>
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
                    <GraduationIcon className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-bold text-charcoal">
                      {department} · Batch {batch}
                    </p>
                    <p className="text-[11.5px] text-gray-400">{deptName}</p>
                  </div>
                </div>
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {deptSections.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSection(s);
                        setStep('view');
                        loadRoutine(department, batch, s);
                      }}
                      className="group flex items-center justify-between rounded-2xl border border-black/[0.06] bg-canvas/70 px-5 py-5 text-left transition duration-150 hover:-translate-y-0.5 hover:border-lime-deep/40 hover:bg-lime hover:shadow-md"
                    >
                      <span className="block text-[16px] font-extrabold tracking-tight text-charcoal">
                        Section {s}
                      </span>
                      <ChevronRightIcon className="h-4 w-4 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4 — Published weekly timetable */}
          {step === 'view' && (
            <div>
              <button
                type="button"
                onClick={() => setStep('sections')}
                className="mb-5 inline-flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm transition hover:border-lime-deep/40 hover:text-lime-deep hover:shadow-md"
              >
                <BackArrowIcon className="h-4 w-4" />
                Change Section
              </button>

              <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    {[department, `Batch ${batch}`, `Section ${section}`].map((chip) => (
                      <span
                        key={chip}
                        className="inline-flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[11.5px] font-bold text-white shadow-sm shadow-black/15"
                      >
                        <RoutinesIcon className="h-3.5 w-3.5 text-lime" />
                        {chip}
                      </span>
                    ))}
                    {!loading && !loadError && (
                      <span className="text-[11.5px] text-gray-400">
                        {slots.length} class{slots.length === 1 ? '' : 'es'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {user.role === 'teacher' && (
                      <button
                        type="button"
                        onClick={() => {
                          setCancelDefaults(null);
                          setCancelOpen(true);
                        }}
                        className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12.5px] font-bold text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:shadow-md"
                      >
                        <BanIcon className="h-4 w-4 text-rose-500" />
                        Cancel class
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={downloadSectionPdf}
                      disabled={exporting || !slots.length}
                      className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <DownloadIcon className="h-4 w-4" />
                      {exporting ? 'Preparing…' : 'Download PDF'}
                    </button>
                  </div>
                </div>

                <WeeklyScheduleGrid
                  slots={slots}
                  days={DAYS}
                  hourStart={hourBounds.hourStart}
                  hourEnd={hourBounds.hourEnd}
                  loading={loading}
                  error={!!loadError}
                  onRetry={() => loadRoutine(department, batch, section)}
                  cancellations={cancellations}
                  isOwnRoutine={isOwnRoutine}
                  showFaculty
                  emptyTitle="No routine published yet"
                  emptySub={`${department} · Batch ${batch} · Section ${section} has no schedule on file yet.`}
                />
              </div>
            </div>
          )}
        </>
      )}

      {/* Cancel-class modal — pre-filled from a schedule chip or the section view */}
      <CancelClassModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        defaultDepartment={cancelDefaults?.department ?? department ?? ''}
        defaultBatch={cancelDefaults?.batch ?? batch ?? ''}
        defaultSection={cancelDefaults?.section ?? section ?? ''}
        defaultDate={cancelDefaults?.date}
        defaultCourseCode={cancelDefaults?.course_code}
        defaultStartTime={cancelDefaults?.start_time}
        defaultEndTime={cancelDefaults?.end_time}
      />
    </div>
  );
}
