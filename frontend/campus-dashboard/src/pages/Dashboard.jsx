import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GearIcon,
  ArrowRightIcon,
  HourglassIcon,
  GraduationIcon,
  TeacherIcon,
  AccountIcon,
} from '../components/Icons';

// Live numbers from GET /api/users/ (admin directory). Falls back to these
// on load errors so the dashboard never shows a broken card.
const FALLBACK = { pending: 0, students: 0, faculty: 0, total: 0, rejected: 0 };

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(FALLBACK);

  // New pending registrations appear here automatically (Faculty & Student
  // self-register as pending_approval and stay in the Pending Review list).
  // Re-fetches on mount and whenever the header refresh button fires.
  const reqSeq = useRef(0);
  const load = useCallback(() => {
    const seq = ++reqSeq.current; // ignore stale in-flight responses
    fetch('/api/users/', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (seq !== reqSeq.current || !data) return;
        const users = data.users || [];
        setStats({
          pending: users.filter((u) => u.status === 'pending').length,
          students: users.filter((u) => u.role === 'student' && u.status === 'active').length,
          faculty: users.filter((u) => u.role === 'teacher' && u.status === 'active').length,
          total: users.length,
          rejected: users.filter((u) => u.status === 'inactive').length,
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => {
      load();
      window.dispatchEvent(new CustomEvent('app:refresh-handled'));
    };
    window.addEventListener('app:refresh', onRefresh);
    return () => window.removeEventListener('app:refresh', onRefresh);
  }, [load]);

  const STATS = [
    {
      label: 'Pending review',
      value: String(stats.pending),
      sub: 'awaiting a decision',
      accent: 'border-coral',
      badge: 'bg-lime text-charcoal',
      icon: HourglassIcon,
    },
    {
      label: 'Students',
      value: String(stats.students),
      sub: 'approved accounts',
      accent: 'border-lime',
      badge: 'bg-sky-100 text-sky-700',
      icon: GraduationIcon,
    },
    {
      label: 'Faculty',
      value: String(stats.faculty),
      sub: 'approved accounts',
      accent: 'border-lime',
      badge: 'bg-yellow-100 text-yellow-700',
      icon: TeacherIcon,
    },
    {
      label: 'Total accounts',
      value: String(stats.total),
      sub: `${stats.rejected} rejected`,
      accent: 'border-lime',
      badge: 'bg-violet-100 text-violet-700',
      icon: AccountIcon,
    },
  ];

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Sub-header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Administration console
      </p>

      {/* Greeting + description + actions */}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0">
          <h1 className="text-[30px] font-extrabold leading-tight tracking-tight text-charcoal lg:text-[34px]">
            Good to see you, santo.
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-gray-500">
            Moderate registrations, monitor the campus pulse, and keep every
            account verified.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
          >
            Refresh
            <ArrowRightIcon className="h-3.5 w-3.5 text-gray-400 transition group-hover:translate-x-0.5 group-hover:text-lime-deep" />
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="group flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[13px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <GearIcon className="h-4 w-4 transition group-hover:rotate-90" />
            Settings
            <ArrowRightIcon className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>

      {/* Analytics cards */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <article
              key={stat.label}
              className={`rounded-2xl border border-black/5 border-t-4 ${stat.accent} bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-[32px] font-extrabold leading-none tracking-tight text-charcoal">
                    {stat.value}
                  </p>
                  <p className="mt-2 text-[12px] text-gray-500">{stat.sub}</p>
                </div>
                <span
                  className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${stat.badge}`}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
