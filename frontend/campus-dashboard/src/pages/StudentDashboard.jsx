import { useNavigate } from 'react-router-dom';
import { useUser, capitalizeName } from '../context/UserContext';
import CancellationBanner from '../components/CancellationBanner';
import NoticeBoard from '../components/NoticeBoard';
import {
  RoutinesIcon,
  RoomBookingIcon,
  HomeIcon,
  GearIcon,
  ArrowRightIcon,
  GraduationIcon,
} from '../components/Icons';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { fullName, department, batch } = useUser();

  const context =
    [department, batch ? `Batch ${batch}` : ''].filter(Boolean).join(' · ') || 'Student';

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Sub-header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Student dashboard
      </p>

      {/* High-priority class cancellation alerts — top of the dashboard */}
      <div className="mt-5">
        <CancellationBanner />
      </div>

      {/* Greeting */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[34px]">
            Hi {capitalizeName(fullName) || 'there'} 👋
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-gray-500">
            {context} — check your weekly routine, find free classrooms, and
            report anything that needs fixing on campus.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/student/settings')}
          className="group flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
        >
          <GearIcon className="h-4 w-4 transition group-hover:rotate-90" />
          Settings
          <ArrowRightIcon className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </button>
      </div>

      {/* Quick access cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          { to: '/student/routines', icon: GraduationIcon, title: 'Weekly routine', sub: 'Browse your department & batch schedule.' },
          { to: '/student/room-booking', icon: RoomBookingIcon, title: 'Find a room', sub: 'Check free classrooms and availability.' },
          { to: '/student/issue-desk', icon: HomeIcon, title: 'Report an issue', sub: 'Flag campus problems for the admin team.' },
        ].map(({ to, icon: Icon, title, sub }) => (
          <button
            key={to}
            type="button"
            onClick={() => navigate(to)}
            className="group flex items-center gap-4 rounded-2xl border border-black/[0.05] bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-1 hover:border-lime-deep/30 hover:shadow-lg"
          >
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-lime/25 text-lime-deep transition group-hover:bg-lime">
              <Icon className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-extrabold tracking-tight text-charcoal">{title}</span>
              <span className="mt-0.5 block text-[12px] leading-snug text-gray-500">{sub}</span>
            </span>
            <ArrowRightIcon className="h-4 w-4 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
          </button>
        ))}
      </div>

      {/* Routine shortcut */}
      <button
        type="button"
        onClick={() => navigate('/student/routines')}
        className="group mt-6 flex w-full items-center justify-between gap-4 rounded-2xl border border-black/[0.05] bg-white p-5 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-lime-deep/30 hover:shadow-lg"
      >
        <span className="flex items-center gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-lime/25 text-lime-deep transition group-hover:bg-lime">
            <RoutinesIcon className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-[15px] font-extrabold tracking-tight text-charcoal">View the weekly timetable</span>
            <span className="mt-0.5 block text-[12px] text-gray-500">Pick a department, batch and section to see the schedule.</span>
          </span>
        </span>
        <ArrowRightIcon className="h-5 w-5 shrink-0 text-gray-300 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
      </button>

      {/* Notice board — role + department filtered announcements */}
      <div className="mt-10">
        <NoticeBoard variant="student" limit={4} />
      </div>
    </div>
  );
}
