import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import Avatar from '../components/Avatar';
import { getCsrfToken } from '../lib/csrf';
import {
  SearchIcon,
  RefreshIcon,
  CheckIcon,
  BanIcon,
  TrashIcon,
  PencilIcon,
  GraduationIcon,
  TeacherIcon,
  AccountIcon,
  HourglassIcon,
  UsersIcon,
  CaretDownIcon,
  CircleCheckIcon,
  XIcon,
} from '../components/Icons';

const TABS = [
  { id: 'all', label: 'All Users' },
  { id: 'student', label: 'Students' },
  { id: 'teacher', label: 'Faculty' },
  { id: 'admin', label: 'Admins' },
  { id: 'cr', label: 'CRs' },
];

const ROLE_META = {
  student: { label: 'Student', badge: 'bg-sky-100 text-sky-700' },
  teacher: { label: 'Faculty', badge: 'bg-violet-100 text-violet-700' },
  admin: { label: 'Admin', badge: 'bg-lime/25 text-lime-deep' },
};

const STATUS_META = {
  active: {
    label: 'Active',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10',
  },
  pending: {
    label: 'Pending Review',
    pill: 'bg-amber-50 text-amber-700 ring-amber-600/10',
  },
  inactive: {
    label: 'Inactive',
    pill: 'bg-rose-50 text-rose-600 ring-rose-600/10',
  },
};

const STATUS_OPTIONS = [
  { id: 'all', label: 'All statuses' },
  { id: 'active', label: 'Active' },
  { id: 'pending', label: 'Pending' },
  { id: 'inactive', label: 'Inactive' },
];

const thClass = 'px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400';
const tdClass = 'px-4 py-3.5 align-middle';

export default function Users() {
  const navigate = useNavigate();
  const { id: currentUserId } = useUser();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'all';
  // 'pending' is a status filter, not a role tab — map it to show pending users.
  const initialStatusFromTab = initialTab === 'pending' ? 'pending' : 'all';
  const initialRoleTab = initialTab === 'pending' ? 'all' : initialTab;
  const [tab, setTab] = useState(initialRoleTab);
  const [statusFilter, setStatusFilter] = useState(initialStatusFromTab);
  const [search, setSearch] = useState('');

  const [busy, setBusy] = useState(null); // { id, action }
  const [roleEditing, setRoleEditing] = useState(null); // user id with open role select

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/users/', {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load the user directory.');
      setUsers(data.users || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = async (user, action, extra) => {
    setBusy({ id: user.id, action });
    try {
      const headers = { 'X-CSRFToken': getCsrfToken() };
      let body;
      if (extra) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(extra);
      }
      // CR assign/revoke go to dedicated /api/cr/ endpoints.
      const crActions = { 'assign-cr': '/api/cr/assign/', 'revoke-cr': '/api/cr/revoke/' };
      const url = crActions[action]
        ? crActions[action]
        : `/api/users/${user.id}/${action}/`;
      const crBody = crActions[action]
        ? JSON.stringify({ user_id: user.id })
        : body;
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: crBody,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'That action failed.');
      if (data.deleted) {
        setUsers((prev) => prev.filter((u) => u.id !== user.id));
        showToast(`${user.full_name} was deleted.`);
      } else {
        setUsers((prev) => prev.map((u) => (u.id === user.id ? data.user : u)));
        const verb =
          action === 'approve' ? 'approved'
          : action === 'deactivate' ? 'deactivated'
          : action === 'role' ? 'role updated for'
          : action === 'assign-cr' ? 'assigned as CR'
          : action === 'revoke-cr' ? 'removed from CR role'
          : 'updated';
        showToast(`${user.full_name} ${verb}.`);
      }
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setBusy(null);
      setRoleEditing(null);
    }
  };

  const changeRole = (user, role) => {
    if (role !== user.role) runAction(user, 'role', { role });
    else setRoleEditing(null);
  };

  const confirmDelete = (user) => {
    if (window.confirm(`Delete ${user.full_name} (${user.email})? This cannot be undone.`)) {
      runAction(user, 'delete');
    }
  };

  // ---- Derived data ----
  const counts = useMemo(
    () => ({
      all: users.length,
      student: users.filter((u) => u.role === 'student').length,
      teacher: users.filter((u) => u.role === 'teacher').length,
      admin: users.filter((u) => u.role === 'admin').length,
      cr: users.filter((u) => u.is_cr).length,
    }),
    [users],
  );

  const pendingUsers = useMemo(() => users.filter((u) => u.status === 'pending'), [users]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (tab === 'cr') {
        if (!u.is_cr) return false;
      } else if (tab !== 'all' && u.role !== tab) {
        return false;
      }
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (q) {
        const hay = `${u.full_name} ${u.email} ${u.username} ${u.campus_id || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [users, tab, search, statusFilter]);

  const KPIS = [
    { label: 'Total Students', value: counts.student, icon: GraduationIcon, badge: 'bg-sky-100 text-sky-700', accent: 'border-sky-300' },
    { label: 'Total Faculty', value: counts.teacher, icon: TeacherIcon, badge: 'bg-violet-100 text-violet-700', accent: 'border-violet-300' },
    { label: 'Admins', value: counts.admin, icon: AccountIcon, badge: 'bg-lime/30 text-lime-deep', accent: 'border-lime' },
  ];

  return (
    <div className="animate-[fadeIn_.35s_ease]">
      {/* Toast */}
      {toast && (
        <div className="fixed right-3 top-5 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-3 py-3 shadow-xl shadow-black/[0.08] animate-[fadeIn_.3s_ease] sm:right-5 sm:px-4">
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

      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
        Users management
      </p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[20px] font-extrabold leading-tight tracking-tight text-charcoal sm:text-[28px] lg:text-[32px]">
            User Directory &amp; Approvals
          </h1>
          <p className="mt-1.5 max-w-lg text-[13.5px] leading-relaxed text-gray-500">
            Approve new registrations, manage Class Representatives, adjust roles, and keep every campus account verified.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="group flex items-center gap-2 rounded-xl border border-black/[0.06] bg-white px-4 py-2.5 text-[13px] font-semibold text-charcoal shadow-sm transition hover:border-lime-deep/40 hover:shadow-md"
        >
          <RefreshIcon className="h-4 w-4 text-gray-400 transition group-hover:rotate-180 group-hover:text-lime-deep" />
          Refresh
        </button>
      </div>


      {/* Pending review banner */}
      {pendingUsers.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-600">
            <HourglassIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-bold text-amber-800">
              {pendingUsers.length} account{pendingUsers.length > 1 ? 's' : ''} pending review
            </p>
            <p className="text-[12px] text-amber-700/80">
              New student/faculty registration{pendingUsers.length > 1 ? 's are' : ' is'} waiting for
              admin approval — approve them from the table below.
            </p>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
        {KPIS.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <article
              key={kpi.label}
              className={`rounded-2xl border border-black/5 border-t-4 ${kpi.accent} bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-lg`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">
                    {kpi.label}
                  </p>
                  <p className="mt-2 text-[30px] font-extrabold leading-none tracking-tight text-charcoal">
                    {kpi.value}
                  </p>
                </div>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${kpi.badge}`}>
                  <Icon className="h-5 w-5" />
                </span>
              </div>
            </article>
          );
        })}
      </div>

      {/* Directory card */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
        {/* Tabs + search + filter */}
        <div className="flex flex-col gap-4 border-b border-black/[0.05] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by role">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => { setTab(t.id); setSearchParams({}, { replace: true }); }}
                className={`rounded-full px-4 py-2 text-[12.5px] font-bold transition ${
                  tab === t.id
                    ? 'bg-ink text-white shadow-md shadow-black/15'
                    : 'bg-panel text-gray-500 hover:bg-white hover:text-charcoal hover:shadow-sm'
                }`}
              >
                {t.label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                    tab === t.id ? 'bg-lime text-charcoal' : 'bg-black/[0.05] text-gray-400'
                  }`}
                >
                  {counts[t.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-gray-400 transition focus-within:border-lime-deep/50 focus-within:ring-2 focus-within:ring-lime/40">
              <SearchIcon className="h-4 w-4" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email or ID…"
                aria-label="Search users"
                className="w-44 bg-transparent text-[12.5px] text-charcoal placeholder:text-gray-300 outline-none lg:w-52"
              />
            </label>
            <label className="relative flex items-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-gray-400">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
                className="appearance-none bg-transparent pr-6 text-[12.5px] font-semibold text-charcoal outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <CaretDownIcon className="pointer-events-none absolute right-2.5 h-3.5 w-3.5" />
            </label>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-4 rounded-xl bg-panel/70 p-4">
                  <span className="h-10 w-10 animate-pulse rounded-full bg-black/[0.06]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-40 animate-pulse rounded bg-black/[0.06]" />
                    <div className="h-3 w-56 animate-pulse rounded bg-black/[0.04]" />
                  </div>
                </div>
              ))}
            </div>
          ) : loadError ? (
            <div className="grid min-h-[260px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
                  <BanIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">Couldn't load users</h3>
                <p className="mt-1 text-[12.5px] text-gray-500">{loadError}</p>
                <button
                  type="button"
                  onClick={load}
                  className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
                >
                  Try again
                </button>
              </div>
            </div>
          ) : visible.length === 0 ? (
            <div className="grid min-h-[260px] place-items-center p-8 text-center">
              <div className="max-w-sm">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-lime/20 text-lime-deep">
                  <UsersIcon className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-[15px] font-bold text-charcoal">No users found</h3>
                <p className="mt-1 text-[12.5px] text-gray-500">
                  {users.length === 0
                    ? 'No accounts have registered yet.'
                    : 'Nothing matches your search or filters.'}
                </p>
              </div>
            </div>
          ) : (
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.05] bg-panel/60">
                  <th className={thClass}>User</th>
                  <th className={thClass}>Role</th>
                  <th className={thClass}>Department / Batch</th>
                  <th className={thClass}>Status</th>
                  <th className={`${thClass} text-right`}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((user) => {
                  const role = ROLE_META[user.role] || ROLE_META.student;
                  const status = STATUS_META[user.status] || STATUS_META.inactive;
                  const isBusy = busy && busy.id === user.id;
                  const isSelf = user.id === currentUserId;
                  const isEditingRole = roleEditing === user.id;
                  return (
                    <tr
                      key={user.id}
                      className="border-b border-black/[0.04] transition last:border-0 hover:bg-canvas/70"
                    >
                      {/* User — clickable row */}
                      <td className={tdClass}>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/users/${user.id}`)}
                          className="flex items-center gap-3 cursor-pointer rounded-lg p-0 text-left transition hover:bg-lime/10 -m-2 p-2"
                        >
                          <Avatar
                            name={user.full_name}
                            src={user.profile_picture}
                            className="h-10 w-10 text-[12px]"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-bold text-charcoal hover:text-lime-deep transition">
                              {user.full_name}
                              {isSelf && (
                                <span className="ml-1.5 rounded-full bg-lime/40 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-lime-deep">
                                  you
                                </span>
                              )}
                            </p>
                            <p className="truncate text-[11.5px] text-gray-400">
                              {user.email || user.username}
                              {user.campus_id ? ` · ${user.campus_id}` : ''}
                            </p>
                          </div>
                        </button>
                      </td>

                      {/* Role */}
                      <td className={tdClass}>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${role.badge}`}
                          >
                            {role.label}
                          </span>
                          {user.is_cr && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                              ★ CR
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Department / batch */}
                      <td className={tdClass}>
                        <p className="text-[12.5px] font-semibold text-charcoal">
                          {user.department || '—'}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {user.batch ? `Batch ${user.batch}` : ''}
                          {user.batch && user.section ? ` · ` : ''}
                          {user.section ? `Section ${user.section}` : ''}
                        </p>
                      </td>

                      {/* Status */}
                      <td className={tdClass}>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${status.pill}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current" />
                          {status.label}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className={`${tdClass} text-right`}>
                        <div className="flex items-center justify-end gap-1.5">
                          {/* CR assign / revoke (students only) */}
                          {user.role === 'student' && user.status === 'active' && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() =>
                                user.is_cr
                                  ? runAction(user, 'revoke-cr')
                                  : runAction(user, 'assign-cr')
                              }
                              title={user.is_cr ? 'Remove CR status' : 'Assign as Class Representative'}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-bold transition disabled:cursor-wait disabled:opacity-50 ${
                                user.is_cr
                                  ? 'border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                  : 'border border-black/[0.07] bg-white text-gray-500 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                              }`}
                            >
                              {isBusy && busy.action === 'assign-cr'
                                ? '…'
                                : isBusy && busy.action === 'revoke-cr'
                                  ? '…'
                                  : user.is_cr
                                    ? '★ Remove CR'
                                    : '☆ Make CR'}
                            </button>
                          )}

                          {user.status !== 'active' && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => runAction(user, 'approve')}
                              title={user.status === 'pending' ? 'Approve registration' : 'Activate account'}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-lime px-3 py-1.5 text-[11.5px] font-bold text-charcoal shadow-sm shadow-lime/30 transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-50"
                            >
                              <CheckIcon className="h-3.5 w-3.5" />
                              {isBusy && busy.action === 'approve'
                                ? '…'
                                : user.status === 'pending'
                                  ? 'Approve'
                                  : 'Activate'}
                            </button>
                          )}

                          {isEditingRole ? (
                            <div className="flex items-center gap-1.5">
                              <select
                                autoFocus
                                value={user.role}
                                onChange={(e) => changeRole(user, e.target.value)}
                                aria-label="Choose role"
                                className="rounded-lg border border-lime-deep/40 bg-white px-2 py-1.5 text-[11.5px] font-bold text-charcoal outline-none ring-2 ring-lime/40"
                              >
                                <option value="student">Student</option>
                                <option value="teacher">Faculty</option>
                                <option value="admin">Admin</option>
                              </select>
                              {user.role === 'student' && (
                                <button
                                  type="button"
                                  disabled={!!busy}
                                  onClick={() =>
                                    user.is_cr
                                      ? runAction(user, 'revoke-cr')
                                      : runAction(user, 'assign-cr')
                                  }
                                  title={user.is_cr ? 'Remove CR' : 'Make CR'}
                                  className={`rounded-lg px-2 py-1.5 text-[10px] font-extrabold transition ${
                                    user.is_cr
                                      ? 'border border-amber-200 bg-amber-50 text-amber-700'
                                      : 'border border-black/[0.07] bg-white text-gray-400 hover:border-amber-200 hover:bg-amber-50 hover:text-amber-700'
                                  }`}
                                >
                                  {isBusy && (busy.action === 'assign-cr' || busy.action === 'revoke-cr')
                                    ? '…'
                                    : user.is_cr ? '★ CR' : '☆ CR'}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setRoleEditing(null)}
                                title="Done"
                                className="grid h-7 w-7 place-items-center rounded-lg text-gray-400 transition hover:bg-canvas hover:text-charcoal"
                              >
                                <XIcon className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => setRoleEditing(user.id)}
                              title="Edit role"
                              className="grid h-8 w-8 place-items-center rounded-lg border border-black/[0.07] bg-white text-gray-400 transition hover:border-lime-deep/40 hover:text-lime-deep disabled:opacity-40"
                            >
                              <PencilIcon className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {user.status === 'active' && (
                            <button
                              type="button"
                              disabled={!!busy}
                              onClick={() => runAction(user, 'deactivate')}
                              title="Deactivate account"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-[11.5px] font-bold text-rose-600 transition hover:bg-rose-100 disabled:cursor-wait disabled:opacity-50"
                            >
                              <BanIcon className="h-3.5 w-3.5" />
                              {isBusy && busy.action === 'deactivate' ? '…' : 'Deactivate'}
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={!!busy || isSelf}
                            onClick={() => confirmDelete(user)}
                            title={isSelf ? 'You cannot delete your own account' : 'Delete account'}
                            className="grid h-8 w-8 place-items-center rounded-lg border border-transparent text-gray-300 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <TrashIcon className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
