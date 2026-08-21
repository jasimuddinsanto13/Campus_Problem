import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import Avatar from '../components/Avatar';
import { getCsrfToken } from '../lib/csrf';
import {
  BackArrowIcon,
  PencilIcon,
  CircleCheckIcon,
  XIcon,
  ShieldIcon,
  ClockIcon,
  GraduationIcon,
  KeyIcon,
  BanIcon,
  CheckIcon,
} from '../components/Icons';
import {
  BATCHES,
  DEPARTMENTS,
  DEPT_SECTIONS,
} from '../lib/routines';

const inputClass =
  'w-full rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-charcoal placeholder:text-gray-300 outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';
const selectClass =
  'w-full appearance-none rounded-xl border border-black/[0.08] bg-white px-3.5 py-2.5 pr-8 text-[13px] font-semibold text-charcoal outline-none transition focus:border-lime-deep/50 focus:ring-2 focus:ring-lime/40';

const ROLE_META = {
  student: { label: 'Student', badge: 'bg-sky-100 text-sky-700' },
  teacher: { label: 'Faculty', badge: 'bg-violet-100 text-violet-700' },
  admin: { label: 'Admin', badge: 'bg-lime/25 text-lime-deep' },
};

const STATUS_META = {
  active: { label: 'Active', pill: 'bg-emerald-50 text-emerald-700 ring-emerald-600/10' },
  pending: { label: 'Pending Review', pill: 'bg-amber-50 text-amber-700 ring-amber-600/10' },
  inactive: { label: 'Inactive', pill: 'bg-rose-50 text-rose-600 ring-rose-600/10' },
};

export default function UserProfile() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { id: currentUserId } = useUser();

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // ---- Edit mode ----
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);

  // ---- Password reset ----
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);

  // ---- Toast ----
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const showToast = (message, error = false) => {
    clearTimeout(toastTimer.current);
    setToast({ message, error });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/users/${userId}/`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load this user profile.');
      setUser(data.user);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Populate draft when entering edit mode
  const startEdit = () => {
    setDraft({
      full_name: user.full_name || '',
      email: user.email || '',
      department: user.department || '',
      batch: user.batch || '',
      section: user.section || '',
      campus_id: user.campus_id || '',
      phone_number: user.phone_number || '',
      role: user.role || 'student',
      is_cr: user.is_cr || false,
    });
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft({});
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}/`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not save changes.');
      setUser(data.user);
      setEditing(false);
      setDraft({});
      showToast('Profile updated successfully.');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setSaving(false);
    }
  };

  const forcePasswordReset = async () => {
    if (!window.confirm(`Send a password reset link to ${user.full_name} (${user.email})?`)) return;
    setResetting(true);
    setResetResult(null);
    try {
      const res = await fetch(`/api/users/${userId}/force-reset/`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken(),
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Password reset failed.');
      setResetResult(data);
      showToast(data.message || 'Password reset link generated.');
    } catch (err) {
      showToast(err.message, true);
    } finally {
      setResetting(false);
    }
  };

  // ---- Loading / error states ----
  if (loading) {
    return (
      <div className="animate-[fadeIn_.35s_ease]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
          User profile
        </p>
        <div className="mt-6 space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-black/[0.05] bg-white p-6 shadow-sm">
              <div className="flex items-center gap-4">
                <div className="h-16 w-16 animate-pulse rounded-full bg-black/[0.06]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 animate-pulse rounded bg-black/[0.06]" />
                  <div className="h-3 w-32 animate-pulse rounded bg-black/[0.04]" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="animate-[fadeIn_.35s_ease]">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-lime-deep">
          User profile
        </p>
        <div className="mt-6 grid min-h-[300px] place-items-center rounded-2xl border border-black/[0.05] bg-white p-8 text-center shadow-sm">
          <div className="max-w-sm">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-500">
              <BanIcon className="h-6 w-6" />
            </span>
            <h3 className="mt-4 text-[15px] font-bold text-charcoal">Couldn't load profile</h3>
            <p className="mt-1 text-[12.5px] text-gray-500">{loadError}</p>
            <button
              type="button"
              onClick={() => navigate('/admin/users')}
              className="mt-4 rounded-xl bg-ink px-4 py-2 text-[12px] font-bold text-white transition hover:bg-black"
            >
              Back to Users
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const role = ROLE_META[user.role] || ROLE_META.student;
  const status = STATUS_META[user.status] || STATUS_META.inactive;
  const deptSections = DEPT_SECTIONS[user.department] || [];
  const deptName = (DEPARTMENTS.find((d) => d.code === user.department) || {}).name || user.department;
  const isSelf = user.id === currentUserId;

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
          <p className="max-w-[420px] text-[13px] font-semibold text-charcoal">{toast.message}</p>
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

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-[12px]">
        <button
          type="button"
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-1.5 text-gray-400 transition hover:text-lime-deep"
        >
          <BackArrowIcon className="h-3.5 w-3.5" />
          Users
        </button>
        <span className="text-gray-300">/</span>
        <span className="font-bold text-charcoal">{user.full_name}</span>
      </nav>

      {/* ============ Profile Header Card ============ */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <Avatar
            name={user.full_name}
            src={user.profile_picture}
            className="h-16 w-16 text-[18px]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] font-extrabold tracking-tight text-charcoal">
                {user.full_name}
              </h1>
              {isSelf && (
                <span className="rounded-full bg-lime/40 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-lime-deep">
                  you
                </span>
              )}
              {user.is_cr && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-700">
                  ★ Class Representative
                </span>
              )}
            </div>
            <p className="mt-1 text-[13px] text-gray-500">{user.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${role.badge}`}>
                {role.label}
              </span>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${status.pill}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {status.label}
              </span>
              {user.campus_id && (
                <span className="rounded-full bg-panel px-2.5 py-1 text-[11px] font-bold text-gray-500">
                  ID: {user.campus_id}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!editing && (
              <button
                type="button"
                onClick={startEdit}
                className="inline-flex items-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12.5px] font-bold text-charcoal shadow-md shadow-lime/40 transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <PencilIcon className="h-4 w-4" />
                Edit Profile
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-3">
        {/* ============ Information & Edit Form ============ */}
        <div className="xl:col-span-2 overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/[0.05] p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-lime/25 text-lime-deep">
                <GraduationIcon className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-[15px] font-bold tracking-tight text-charcoal">
                  {editing ? 'Edit Profile' : 'Profile Information'}
                </h2>
                <p className="mt-0.5 text-[11.5px] text-gray-400">
                  {editing ? 'Update the user\'s account details below.' : 'User details and academic information.'}
                </p>
              </div>
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl border border-black/[0.06] bg-white px-4 py-2 text-[12px] font-semibold text-gray-500 transition hover:bg-canvas"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-lime px-4 py-2 text-[12px] font-bold text-charcoal shadow-sm shadow-lime/30 transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}
          </div>

          <div className="p-5">
            {editing ? (
              /* ---- Editable form ---- */
              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={draft.full_name}
                    onChange={(e) => setDraft((d) => ({ ...d, full_name: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Email
                  </label>
                  <input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
                    className={inputClass}
                  />
                </div>

                {/* Role + CR toggle */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Role
                    </label>
                    <div className="relative">
                      <select
                        value={draft.role}
                        onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="student">Student</option>
                        <option value="teacher">Faculty</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Class Representative
                    </label>
                    <button
                      type="button"
                      onClick={() => setDraft((d) => ({ ...d, is_cr: !d.is_cr }))}
                      className={`mt-1 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[12px] font-bold transition ${
                        draft.is_cr
                          ? 'border-amber-200 bg-amber-50 text-amber-700'
                          : 'border-black/[0.08] bg-white text-gray-500 hover:border-amber-200 hover:bg-amber-50'
                      }`}
                    >
                      {draft.is_cr ? '★ CR Active' : '☆ Make CR'}
                    </button>
                  </div>
                </div>

                {/* Campus ID */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Campus / Student ID
                  </label>
                  <input
                    type="text"
                    value={draft.campus_id}
                    onChange={(e) => setDraft((d) => ({ ...d, campus_id: e.target.value }))}
                    className={inputClass}
                    placeholder="e.g. 20XX-XXX-XXX"
                  />
                </div>

                {/* Department + Batch + Section */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Department
                    </label>
                    <div className="relative">
                      <select
                        value={draft.department}
                        onChange={(e) => setDraft((d) => ({ ...d, department: e.target.value, section: '' }))}
                        className={selectClass}
                      >
                        <option value="">— None —</option>
                        {DEPARTMENTS.map((d) => (
                          <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Batch
                    </label>
                    <div className="relative">
                      <select
                        value={draft.batch}
                        onChange={(e) => setDraft((d) => ({ ...d, batch: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="">— None —</option>
                        {BATCHES.map((b) => (
                          <option key={b} value={b}>Batch {b}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      Section
                    </label>
                    <div className="relative">
                      <select
                        value={draft.section}
                        onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))}
                        className={selectClass}
                      >
                        <option value="">— None —</option>
                        {(DEPT_SECTIONS[draft.department] || []).map((s) => (
                          <option key={s} value={s}>Section {s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={draft.phone_number}
                    onChange={(e) => setDraft((d) => ({ ...d, phone_number: e.target.value }))}
                    className={inputClass}
                    placeholder="+880 ..."
                  />
                </div>
              </div>
            ) : (
              /* ---- Read-only details ---- */
              <div className="space-y-4">
                {[
                  { label: 'Full Name', value: user.full_name },
                  { label: 'Email', value: user.email },
                  { label: 'Campus ID', value: user.campus_id || '—' },
                  { label: 'Phone', value: user.phone_number || '—' },
                  { label: 'Department', value: user.department ? `${user.department} — ${deptName}` : '—' },
                  { label: 'Batch', value: user.batch || '—' },
                  { label: 'Section', value: user.section || '—' },
                ].map((field) => (
                  <div key={field.label} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                    <span className="w-36 shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                      {field.label}
                    </span>
                    <span className="text-[13px] font-semibold text-charcoal">{field.value}</span>
                  </div>
                ))}
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                  <span className="w-36 shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-gray-400">
                    Joined
                  </span>
                  <span className="flex items-center gap-1.5 text-[13px] font-semibold text-charcoal">
                    <ClockIcon className="h-3.5 w-3.5 text-lime-deep" />
                    {new Date(user.date_joined).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ============ Account Security Card ============ */}
        <div className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-sm">
          <div className="flex items-center gap-3 border-b border-black/[0.05] p-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 text-rose-500">
              <ShieldIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-[15px] font-bold tracking-tight text-charcoal">Account Security</h2>
              <p className="mt-0.5 text-[11.5px] text-gray-400">Password management</p>
            </div>
          </div>
          <div className="p-5">
            <p className="text-[12.5px] leading-relaxed text-gray-500">
              Passwords are securely hashed and cannot be viewed. Use the button
              below to generate a password reset link for this user.
            </p>

            <button
              type="button"
              onClick={forcePasswordReset}
              disabled={resetting}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] font-bold text-amber-700 transition hover:-translate-y-0.5 hover:bg-amber-100 hover:shadow-md disabled:cursor-wait disabled:opacity-60"
            >
              <KeyIcon className="h-4 w-4" />
              {resetting ? 'Generating…' : 'Force Password Reset'}
            </button>

            {resetResult && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                    <CheckIcon className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-bold text-emerald-800">
                      {resetResult.email_sent
                        ? 'Reset email sent!'
                        : 'Reset link generated'}
                    </p>
                    {resetResult.reset_url && (
                      <p className="mt-1 break-all text-[11px] text-emerald-700/80">
                        {resetResult.reset_url}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="border-t border-black/[0.05] p-5">
            <h3 className="text-[12px] font-bold uppercase tracking-[0.12em] text-gray-400">
              Quick Actions
            </h3>
            <div className="mt-3 space-y-2">
              {user.status === 'active' && (
                <button
                  type="button"
                  onClick={async () => {
                    if (!window.confirm(`Deactivate ${user.full_name}?`)) return;
                    try {
                      const res = await fetch(`/api/users/${userId}/deactivate/`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'X-CSRFToken': getCsrfToken() },
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || 'Action failed.');
                      setUser(data.user);
                      showToast(`${user.full_name} deactivated.`);
                    } catch (err) {
                      showToast(err.message, true);
                    }
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-[12px] font-bold text-rose-600 transition hover:bg-rose-100"
                >
                  <BanIcon className="h-3.5 w-3.5" />
                  Deactivate Account
                </button>
              )}
              {user.status !== 'active' && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await fetch(`/api/users/${userId}/approve/`, {
                        method: 'POST',
                        credentials: 'same-origin',
                        headers: { 'X-CSRFToken': getCsrfToken() },
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || 'Action failed.');
                      setUser(data.user);
                      showToast(`${user.full_name} approved.`);
                    } catch (err) {
                      showToast(err.message, true);
                    }
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-lime px-4 py-2.5 text-[12px] font-bold text-charcoal shadow-sm shadow-lime/30 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <CheckIcon className="h-3.5 w-3.5" />
                  {user.status === 'pending' ? 'Approve Registration' : 'Activate Account'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
