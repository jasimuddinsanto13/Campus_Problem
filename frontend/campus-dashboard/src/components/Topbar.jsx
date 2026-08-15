import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { BellIcon, MoonIcon, PlusIcon, RefreshIcon, SunIcon } from './Icons';

const THEME_KEY = 'campus-theme';

/** "2026-08-12T09:00:00+06:00" -> "2h ago" ('' when absent). */
function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(diff) || diff < 0) return '';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Shared glass icon-button look for the control hub. */
const glassBtn =
  'relative grid h-10 w-10 place-items-center rounded-2xl border border-slate-200/80 bg-white/80 text-gray-600 shadow-sm backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:text-charcoal active:translate-y-0';

export default function Topbar({ portalLabel = 'Admin portal', pageLabel }) {
  const { role } = useUser();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // ---- Theme (Light / Dark) ----
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved) return saved === 'dark';
    } catch {
      /* storage unavailable */
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [dark]);

  // ---- Notifications (role-aware: pending account approvals / own requests) ----
  const [notifications, setNotifications] = useState([]);
  const [bellOpen, setBellOpen] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      if (role === 'admin') {
        const res = await fetch('/api/users/', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        setNotifications(
          (data.users || [])
            .filter((u) => u.status === 'pending')
            .map((u) => ({
              key: `user-${u.id}`,
              title: `${u.full_name || u.username || u.email}`,
              sub: 'Account pending approval',
              href: '/admin/users',
              time: timeAgo(u.created_at),
            })),
        );
      } else if (role === 'student') {
        // Students: class cancellations (bell badge increments on new ones)
        // + their own pending room-booking requests.
        const [cancelRes, reqRes] = await Promise.all([
          fetch('/api/student/cancellations/', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
          fetch('/api/room-booking/requests/', {
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }),
        ]);
        const cancelData = cancelRes.ok ? await cancelRes.json() : { cancellations: [] };
        const reqData = reqRes.ok ? await reqRes.json() : { requests: [] };
        const cancellations = (cancelData.cancellations || []).map((c) => ({
          key: `cancellation-${c.id}`,
          title: `🚨 Class Cancelled: ${c.course_code}`,
          sub: `${c.start_label} – ${c.end_label} · ${c.reason_label}`,
          href: '/student/cancellations',
          time: timeAgo(c.created_at),
        }));
        const requests = (reqData.requests || [])
          .filter((r) => r.status === 'pending')
          .map((r) => ({
            key: `request-${r.id}`,
            title: `${r.subject || 'Class booking'} · ${r.room_number}`,
            sub: `${r.day_label} ${r.start_time} · Batch ${r.batch}${r.section ? `-${r.section}` : ''}`,
            href: '/student/room-booking',
            time: timeAgo(r.created_at),
          }));
        setNotifications([...cancellations, ...requests]);
      } else {
        const res = await fetch('/api/room-booking/requests/', {
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const data = await res.json();
        setNotifications(
          (data.requests || [])
            .filter((r) => r.status === 'pending')
            .map((r) => ({
              key: `request-${r.id}`,
              title: `${r.subject || 'Class booking'} · ${r.room_number}`,
              sub: `${r.day_label} ${r.start_time} · Batch ${r.batch}${r.section ? `-${r.section}` : ''}`,
              href: '/faculty/room-booking',
              time: timeAgo(r.created_at),
            })),
        );
      }
    } catch {
      /* the badge simply stays hidden on network errors */
    }
  }, [role]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications, pathname]);

  // Keep the bell fresh without a page reload — poll + instant refresh when a
  // foreground FCM push arrives.
  useEffect(() => {
    const id = setInterval(loadNotifications, 60000);
    return () => clearInterval(id);
  }, [loadNotifications]);

  useEffect(() => {
    const onPush = () => loadNotifications();
    window.addEventListener('app:cancellation-push', onPush);
    return () => window.removeEventListener('app:cancellation-push', onPush);
  }, [loadNotifications]);

  // ---- Quick refresh: spin the icon + tell the current page to re-fetch ----
  const [spinKey, setSpinKey] = useState(0);
  const refresh = () => {
    setSpinKey((k) => k + 1);
    let handled = false;
    const markHandled = () => {
      handled = true;
    };
    // Pages that re-fetch in place broadcast 'app:refresh-handled' (the
    // CustomEvent dispatch is synchronous, so the flag is set immediately).
    // Any other page falls back to a full reload so data always re-fetches.
    window.addEventListener('app:refresh-handled', markHandled, { once: true });
    window.dispatchEvent(new CustomEvent('app:refresh'));
    loadNotifications();
    setTimeout(() => {
      window.removeEventListener('app:refresh-handled', markHandled);
      if (!handled) window.location.reload();
    }, 180);
  };

  // ---- Dynamic primary action (students are read-only) ----
  const action = (() => {
    if (!role || role === 'student') return null;
    if (pathname.endsWith('/notices')) return { label: '+ New Notice', kind: 'open-notices' };
    if (pathname.endsWith('/issue-desk') && role === 'teacher')
      return { label: '+ Report Issue', kind: 'open-issue-desk' };
    if (pathname.endsWith('/room-booking'))
      return {
        label: role === 'teacher' ? '+ Request Room' : '+ New Booking',
        // The admin is already on the booking page — open the create modal.
        kind: role === 'admin' ? 'open-booking' : 'go',
        to: '/faculty/room-booking',
      };
    if (role === 'admin') return { label: '+ New Notice', kind: 'go', to: '/admin/notices' };
    return { label: '+ Request Room', kind: 'go', to: '/faculty/room-booking' };
  })();

  const handleAction = () => {
    if (!action) return;
    if (action.kind === 'open-notices') {
      window.dispatchEvent(new CustomEvent('notice:open-create'));
    } else if (action.kind === 'open-issue-desk') {
      window.dispatchEvent(new CustomEvent('issue:focus-form'));
    } else if (action.kind === 'open-booking') {
      window.dispatchEvent(new CustomEvent('booking:open-create'));
    } else {
      navigate(action.to);
    }
  };

  const viewAll = () => {
    const href =
      notifications[0]?.href ||
      (role === 'admin' ? '/admin/users' : role === 'teacher' ? '/faculty/room-booking' : '/student/room-booking');
    setBellOpen(false);
    navigate(href);
  };

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-4 border-b border-black/[0.06] bg-canvas px-5 lg:px-8">
      {/* Breadcrumb — portal name + current page */}
      <nav className="flex min-w-0 items-center gap-2 text-sm" aria-label="Breadcrumb">
        <span className="hidden text-gray-500 sm:inline">{portalLabel}</span>
        <span className="hidden text-gray-300 sm:inline">/</span>
        <span className="truncate font-semibold text-charcoal">{pageLabel}</span>
      </nav>

      {/* Control hub — across from the breadcrumb */}
      <div className="flex shrink-0 items-center gap-3">
        {/* Primary action */}
        {action && (
          <button
            type="button"
            onClick={handleAction}
            className="flex h-10 items-center gap-2 rounded-2xl bg-[#C4F135] px-4 text-[13px] font-semibold text-black shadow-sm shadow-lime/30 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md active:translate-y-0"
          >
            <PlusIcon className="h-4 w-4" />
            {action.label}
          </button>
        )}

        {/* Notification bell */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((v) => !v)}
            aria-label={notifications.length ? `${notifications.length} notifications` : 'Notifications'}
            aria-expanded={bellOpen}
            className={glassBtn}
          >
            <BellIcon className="h-[18px] w-[18px]" />
            {notifications.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-canvas" />
            )}
          </button>

          {bellOpen && (
            <>
              {/* Click-away backdrop */}
              <div className="fixed inset-0 z-30" onClick={() => setBellOpen(false)} />
              <div className="absolute right-0 top-[calc(100%+10px)] z-40 w-[320px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-black/10 animate-[popIn_.18s_ease]">
                <div className="flex items-center justify-between border-b border-black/[0.05] bg-panel/60 px-4 py-3">
                  <p className="text-[12px] font-extrabold tracking-tight text-charcoal">
                    Notifications
                  </p>
                  {notifications.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-lime/20 px-2 py-0.5 text-[10.5px] font-bold text-lime-deep">
                      <span className="h-1.5 w-1.5 rounded-full bg-lime-deep" />
                      {notifications.length} new
                    </span>
                  )}
                </div>

                <div className="max-h-[300px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="grid place-items-center px-4 py-8 text-center">
                      <span className="grid h-11 w-11 place-items-center rounded-2xl bg-lime/15 text-lime-deep">
                        <BellIcon className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-[13px] font-bold text-charcoal">You're all caught up</p>
                      <p className="mt-0.5 text-[11.5px] text-gray-400">No pending items right now.</p>
                    </div>
                  ) : (
                    <ul>
                      {notifications.slice(0, 6).map((n) => (
                        <li key={n.key} className="border-b border-black/[0.04] last:border-0">
                          <button
                            type="button"
                            onClick={() => {
                              setBellOpen(false);
                              navigate(n.href);
                            }}
                            className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-canvas/80"
                          >
                            <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-600">
                              <BellIcon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12.5px] font-bold text-charcoal">
                                {n.title}
                              </span>
                              <span className="block truncate text-[11px] text-gray-500">{n.sub}</span>
                            </span>
                            {n.time && (
                              <span className="shrink-0 pt-0.5 text-[10.5px] font-semibold text-gray-400">
                                {n.time}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <button
                  type="button"
                  onClick={viewAll}
                  className="flex w-full items-center justify-center gap-1.5 border-t border-black/[0.05] bg-panel/40 px-4 py-2.5 text-[12px] font-bold text-lime-deep transition hover:bg-panel"
                >
                  View all notifications
                </button>
              </div>
            </>
          )}
        </div>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={() => setDark((v) => !v)}
          aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={dark ? 'Light mode' : 'Dark mode'}
          className={glassBtn}
        >
          {dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
        </button>

        {/* Quick refresh */}
        <button
          type="button"
          onClick={refresh}
          aria-label="Refresh data"
          title="Refresh data"
          className={glassBtn}
        >
          <span
            key={spinKey}
            className="grid place-items-center"
            style={spinKey ? { animation: 'spinOnce .6s ease' } : undefined}
          >
            <RefreshIcon className="h-[18px] w-[18px]" />
          </span>
        </button>
      </div>
    </header>
  );
}
