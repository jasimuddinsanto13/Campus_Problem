import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser, capitalizeName } from '../context/UserContext';
import CancelClassModal from '../components/CancelClassModal';
import NoticeBoard from '../components/NoticeBoard';
import WeeklyScheduleGrid from '../components/WeeklyScheduleGrid';
import { fmtDate } from '../lib/roomBooking';
import { slotLabel } from '../lib/routines';
import {
  ArrowRightIcon,
  ClockIcon,
  GraduationIcon,
  HomeIcon,
  MegaphoneIcon,
  RoomBookingIcon,
  RoutinesIcon,
} from '../components/Icons';

const DAY_INDEX = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };

/** Next calendar date that falls on the given weekday code ('SUN'..'SAT'). */
function nextDateForDay(dayCode) {
  const today = new Date();
  const diff = (DAY_INDEX[dayCode] - today.getDay() + 7) % 7;
  const next = new Date(today);
  next.setDate(today.getDate() + diff);
  return next.toISOString().slice(0, 10);
}

export default function FacultyDashboard() {
  const navigate = useNavigate();
  const { fullName } = useUser();

  // ---- Personal weekly schedule (routine slots matched by this teacher) ----
  const [mine, setMine] = useState({ loading: true, error: false, slots: [] });
  const loadMine = useCallback(() => {
    setMine((prev) => ({ ...prev, loading: true, error: false }));
    fetch('/api/routines/?mine=1', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setMine({ loading: false, error: false, slots: data?.slots || [] });
      })
      .catch(() => setMine({ loading: false, error: true, slots: [] }));
  }, []);
  useEffect(() => {
    loadMine();
  }, [loadMine]);

  // ---- Classes displaced by an admin exam override — need a replacement ----
  const [displaced, setDisplaced] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/room-booking/displaced/', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setDisplaced(data.displaced || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- Cancel-class modal (pre-filled from a schedule chip) ----
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

  const cards = [
    {
      label: 'Assigned classes',
      value: mine.loading ? '…' : mine.error ? '—' : String(mine.slots.length),
      sub: 'Your classes this week',
      icon: ClockIcon,
      to: '/faculty/routines',
    },
    {
      label: 'Weekly routine',
      value: mine.loading
        ? '…'
        : mine.error
          ? '—'
          : mine.slots.length
            ? `${mine.slots.length} slot${mine.slots.length > 1 ? 's' : ''}`
            : 'Empty',
      sub: 'View department & batch schedules',
      icon: GraduationIcon,
      to: '/faculty/routines',
    },
    {
      label: 'Room booking',
      value: 'Live',
      sub: 'Book classrooms for extra classes & exams',
      icon: RoomBookingIcon,
      to: '/faculty/room-booking',
    },
    {
      label: 'Issue desk',
      value: 'Open',
      sub: 'Report campus & classroom problems',
      icon: HomeIcon,
      to: '/faculty/issue-desk',
    },
  ];

  return (
    <div className="animate-[fadeIn_.35s_ease] flex flex-col gap-6">
      {/* Sub-header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Faculty dashboard
      </p>

      {/* Greeting — flows straight into the summary cards (no action clutter) */}
      <div>
        <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[34px]">
          Good to see you, {capitalizeName(fullName) || 'there'}.
        </h1>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-gray-500">
          Track your assigned classes, check the weekly routine for your
          department, and book rooms when you need extra time.
        </p>
      </div>

      {/* Displaced class alert — admin exam override needs a replacement room */}
      {displaced.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-rose-200 bg-rose-50 shadow-sm animate-[fadeIn_.35s_ease]">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-100 text-rose-600">
              <MegaphoneIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-rose-800">
                {displaced.length > 1
                  ? `${displaced.length} of your classes were displaced by exams`
                  : `Your class ${displaced[0].subject} was displaced`}
              </p>
              <p className="text-[12px] text-rose-700/80">
                The room is reallocated for an exam. Pick a replacement free room to keep the class on schedule.
              </p>
            </div>
          </div>
          <div className="border-t border-rose-200/70 bg-white/60">
            {displaced.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center gap-3 border-b border-rose-100 px-5 py-3 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-bold text-charcoal">
                    {d.subject} · {d.department} Batch {d.batch} Sec {d.section}
                  </p>
                  <p className="text-[11.5px] text-gray-500">
                    {d.day_label} {fmtDate(d.date)} · {slotLabel(d.start_time, d.end_time)} · Room {d.room_number}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    navigate(
                      `/faculty/room-booking?displaced=${d.id}&day=${d.day}&start=${d.start_time}&end=${d.end_time}`,
                    )
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3.5 py-2 text-[11.5px] font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-rose-700 hover:shadow-md"
                >
                  <RoomBookingIcon className="h-3.5 w-3.5" />
                  Pick a replacement room
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary metric cards — one aligned responsive row */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((stat) => {
          const Icon = stat.icon;
          return (
            <button
              key={stat.label}
              type="button"
              onClick={() => navigate(stat.to)}
              className="flex h-full items-start justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-lime-deep/30 hover:shadow-lg"
            >
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                  {stat.label}
                </span>
                <span className="mt-2 block text-[30px] font-extrabold leading-none tracking-tight text-charcoal">
                  {stat.value}
                </span>
                <span className="mt-2 block text-[12px] leading-snug text-gray-500">{stat.sub}</span>
              </span>
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep">
                <Icon className="h-5 w-5" />
              </span>
            </button>
          );
        })}
      </div>

      {/* My Class Schedule — personal weekly teaching grid */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 p-5">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep">
              <RoutinesIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[16px] font-extrabold tracking-tight text-charcoal">My Class Schedule</h2>
              <p className="mt-0.5 text-[12px] text-gray-500">
                Your weekly teaching timetable · Sun – Thu, 8:00 AM – 4:00 PM
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/faculty/routines')}
            className="group inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Browse All Department Routines
            <ArrowRightIcon className="h-4 w-4 transition group-hover:translate-x-0.5" />
          </button>
        </div>

        <WeeklyScheduleGrid
          slots={mine.slots}
          loading={mine.loading}
          error={mine.error}
          onRetry={loadMine}
          onCancelSlot={openCancelForSlot}
          emptyTitle="No classes assigned yet"
          emptySub="Once an admin publishes routines for your classes, they'll appear here as a weekly timetable."
        />
      </div>

      {/* Notice board — role + department filtered announcements */}
      <NoticeBoard variant="faculty" limit={4} />

      {/* Cancel-class modal — pre-filled from a schedule chip */}
      <CancelClassModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        defaultDepartment={cancelDefaults?.department || ''}
        defaultBatch={cancelDefaults?.batch ?? ''}
        defaultSection={cancelDefaults?.section || ''}
        defaultDate={cancelDefaults?.date}
        defaultCourseCode={cancelDefaults?.course_code}
        defaultStartTime={cancelDefaults?.start_time}
        defaultEndTime={cancelDefaults?.end_time}
      />
    </div>
  );
}
