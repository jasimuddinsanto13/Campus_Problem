import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { apiUrl } from '../lib/api';
import Avatar from './Avatar';
import ConfirmDialog from './ConfirmDialog';
import {
  DashboardIcon,
  RadioActiveIcon,
  UsersIcon,
  RoutinesIcon,
  HomeIcon,
  RoomBookingIcon,
  MegaphoneIcon,
  GearIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  LogoutIcon,
  CalendarXIcon,
  AlertOctagonIcon,
  MealIcon,
  BusIcon,
} from './Icons';

function clearClientAuth() {
  window.localStorage.clear();
  window.sessionStorage.clear();
}

// Navigation per portal. Each item is a real link — the address bar updates
// on click and the active item is derived from the URL, not internal state.
const PORTALS = {
  admin: {
    section: 'Admin portal',
    roleText: 'Admin',
    nav: [
      { id: 'dashboard', path: '/admin/dashboard', label: 'My dashboard', icon: DashboardIcon },
      { id: 'users', path: '/admin/users', label: 'Users', icon: UsersIcon },
      { id: 'routines', path: '/admin/routines', label: 'Routines', icon: RoutinesIcon, prefix: '/admin/routines' },
      { id: 'issue-desk', path: '/admin/issue-desk', label: 'Issue desk', icon: HomeIcon },
      { id: 'room-booking', path: '/admin/room-booking', label: 'Room booking', icon: RoomBookingIcon },
      { id: 'notices', path: '/admin/notices', label: 'Notice board', icon: MegaphoneIcon },
      { id: 'settings', path: '/admin/settings', label: 'Settings', icon: GearIcon },
    ],
  },
  faculty: {
    section: 'Faculty portal',
    roleText: 'Faculty',
    nav: [
      { id: 'dashboard', path: '/faculty/dashboard', label: 'My dashboard', icon: DashboardIcon },
      { id: 'routines', path: '/faculty/routines', label: 'Routines', icon: RoutinesIcon },
      { id: 'cancellations', path: '/faculty/cancellations', label: 'Class cancellations', icon: CalendarXIcon },
      { id: 'room-booking', path: '/faculty/room-booking', label: 'Room booking', icon: RoomBookingIcon },
      { id: 'issue-desk', path: '/faculty/issue-desk', label: 'Issue desk', icon: HomeIcon },
      { id: 'settings', path: '/faculty/settings', label: 'Settings', icon: GearIcon },
    ],
  },
  student: {
    section: 'Student portal',
    roleText: 'Student',
    nav: [
      { id: 'dashboard', path: '/student/dashboard', label: 'My dashboard', icon: DashboardIcon },
      { id: 'routines', path: '/student/routines', label: 'Routines', icon: RoutinesIcon },
      { id: 'cancellations', path: '/student/cancellations', label: 'Cancellations', icon: AlertOctagonIcon },
      { id: 'room-booking', path: '/student/room-booking', label: 'Room booking', icon: RoomBookingIcon },
      { id: 'issue-desk', path: '/student/issue-desk', label: 'Issue desk', icon: HomeIcon },
      { id: 'meal-query', path: '/student/meal-query', label: 'Meal query', icon: MealIcon },
      { id: 'bus-navigate', path: '/student/bus-navigate', label: 'Bus navigate', icon: BusIcon },
      { id: 'settings', path: '/student/settings', label: 'Settings', icon: GearIcon },
    ],
  },
};

export default function Sidebar({ variant = 'admin', collapsed, mobileOpen = false, onToggle, onExpand, onMobileClose }) {
  // Live profile from GET /api/profile/ — avatar + name persist across reloads.
  const { fullName, profilePicture } = useUser();
  const portal = PORTALS[variant] || PORTALS.admin;

  // Active tab is derived from the real URL. Prefix matches keep sub-pages
  // (e.g. /admin/routines/edit) on their parent menu item.
  const { pathname } = useLocation();
  const active =
    portal.nav.find((item) =>
      item.prefix ? pathname.startsWith(item.prefix) : item.path === pathname,
    )?.id ?? 'dashboard';

  const handleNavClick = () => {
    // On desktop: expand the collapsed sidebar when a nav item is clicked.
    // On mobile: close the overlay sidebar.
    if (mobileOpen) onMobileClose?.();
    else if (collapsed) onExpand();
  };

  // Logout confirmation — an accidental click no longer ends the session.
  // The styled ConfirmDialog asks first; only "Yes, Logout" navigates to
  // /accounts/logout/. The <a> keeps its href as a no-JS fallback.
  const navigate = useNavigate();
  const [logoutOpen, setLogoutOpen] = useState(false);
  const handleLogout = (e) => {
    e.preventDefault();
    setLogoutOpen(true);
  };
  const confirmLogout = async () => {
    clearClientAuth();
    try {
      await fetch(apiUrl('/api/auth/logout/'), {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Ignore network errors — clear local state regardless.
    }
    navigate('/login', { replace: true });
  };

  const ArrowIcon = collapsed ? ChevronRightIcon : ChevronLeftIcon;

  return (
    <>
      {/* Mobile backdrop overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-black/[0.06] bg-canvas transition-[width] duration-300 ease-in-out
          max-md:-translate-x-full max-md:transition-transform max-md:duration-300
          ${mobileOpen ? 'max-md:translate-x-0' : ''}
          ${collapsed ? 'w-[84px]' : 'w-[272px]'}
        `}
      >
      {/* Brand */}
      <div
        className={`flex h-[72px] shrink-0 items-center gap-3 transition-[padding] duration-300 ${
          collapsed ? 'justify-center px-3' : 'px-5'
        }`}
      >
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-lime text-[15px] font-extrabold tracking-tight text-charcoal shadow-sm shadow-lime/40">
          CP
        </span>
        {!collapsed && (
          <span className="text-[17px] font-bold tracking-tight text-charcoal">
            Campus Problem
          </span>
        )}
      </div>

      {/* User card — avatar, name and role */}
      <div
        className={`mx-3 mt-2 rounded-2xl border border-black/[0.05] bg-panel p-3 transition-all duration-300 ${
          collapsed ? 'flex justify-center' : ''
        }`}
      >
        <div className={collapsed ? '' : 'flex min-w-0 items-center gap-3'}>
          <Avatar name={fullName} src={profilePicture} className="h-10 w-10 text-[13px]" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-charcoal">
                {fullName || 'Santo'}
              </p>
              <p className="mt-0.5 text-[10.5px] font-bold uppercase tracking-wider text-lime-deep">
                {portal.roleText}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Section label */}
      {!collapsed && (
        <p className="mt-6 px-6 text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">
          {portal.section}
        </p>
      )}

      {/* Clean nav list — real links, URL bar updates on click */}
      <nav className="mt-2 flex-1 overflow-y-auto px-3 pb-4">
        <ul className="space-y-1.5">
          {portal.nav.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === active;
            return (
              <li key={item.id}>
                <Link
                  to={item.path}
                  onClick={handleNavClick}
                  aria-current={isActive ? 'page' : undefined}
                  className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
                    collapsed ? 'justify-center px-0' : ''
                  } ${
                    isActive
                      ? 'bg-white text-charcoal shadow-lg shadow-black/[0.08] ring-1 ring-black/[0.04]'
                      : 'text-gray-600 hover:bg-white/60 hover:text-charcoal hover:shadow-sm'
                  }`}
                >
                  {/* Active lime badge */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-lime" />
                  )}
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition ${
                      isActive ? 'text-lime-deep' : 'text-gray-400 group-hover:text-lime-deep'
                    }`}
                  />
                  {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
                  {isActive && !collapsed && (
                    <RadioActiveIcon className="h-4 w-4 text-lime-deep" />
                  )}
                  {isActive && collapsed && (
                    <span className="absolute right-2 h-1.5 w-1.5 rounded-full bg-lime" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Log out — pinned to the bottom of the menu bar */}
      <div
        className={`shrink-0 border-t border-black/[0.05] px-3 pb-5 pt-3 ${
          collapsed ? 'flex justify-center' : ''
        }`}
      >
        <a
          href="/login"
          title="Log out"
          onClick={handleLogout}
          className={`group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-gray-500 transition-all duration-200 hover:bg-rose-50 hover:text-rose-600 ${
            collapsed ? 'justify-center px-0' : ''
          }`}
        >
          <LogoutIcon className="h-[18px] w-[18px] shrink-0 text-gray-400 transition group-hover:text-rose-500" />
          {!collapsed && <span className="text-left">Log out</span>}
        </a>
      </div>

      {/* Floating collapse arrow — desktop only */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        title={collapsed ? 'Expand menu' : 'Collapse menu'}
        className="absolute right-[-13px] top-1/2 z-40 hidden h-8 w-8 -translate-y-1/2 grid place-items-center rounded-full border border-black/[0.06] bg-white text-gray-500 shadow-lg shadow-black/10 transition hover:scale-105 hover:text-charcoal hover:shadow-xl md:grid"
      >
        <ArrowIcon className="h-4 w-4" />
      </button>

      {/* Logout confirmation modal — shared across every portal */}
      <ConfirmDialog
        open={logoutOpen}
        tone="success"
        title="Are you sure you want to logout?"
        message="Your session will be ended and you'll need to sign in again to access the dashboard."
        confirmLabel="Yes, Logout"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutOpen(false)}
      />
    </aside>
    </>
  );
}
