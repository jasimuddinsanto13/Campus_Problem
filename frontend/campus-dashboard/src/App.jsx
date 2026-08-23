import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import ChatWidget from './components/ChatWidget';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { useUser } from './context/UserContext';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import UserProfile from './pages/UserProfile';
import Routines from './pages/Routines';
import RoutineEdit from './pages/RoutineEdit';
import RoutineDownload from './pages/RoutineDownload';
import RoomBooking from './pages/RoomBooking';
import Notices from './pages/Notices';
import Settings from './pages/Settings';
import FacultyDashboard from './pages/FacultyDashboard';
import FacultyRoutines from './pages/FacultyRoutines';
import FacultyRoomBooking from './pages/FacultyRoomBooking';
import FacultyIssueDesk from './pages/FacultyIssueDesk';
import AdminIssueDesk from './pages/AdminIssueDesk';
import FacultyCancellations from './pages/FacultyCancellations';
import StudentDashboard from './pages/StudentDashboard';
import StudentCancellations from './pages/StudentCancellations';
import MealQuery from './pages/MealQuery';
import BusNavigate from './pages/BusNavigate';
import { apiUrl } from './lib/api';
import { getCsrfToken } from './lib/csrf';

const DEPARTMENTS = ['CSE', 'EEE', 'TE', 'IPE', 'FDAE'];
const SECTIONS = { CSE: ['A', 'B'], EEE: ['A'], TE: ['A', 'B', 'C', 'D'], IPE: ['A', 'B'], FDAE: ['A'] };
const BATCHES = Array.from({ length: 17 }, (_, i) => String(i));

const SIDEBAR_W = { expanded: 272, collapsed: 84 };

// Each role lands on its own portal after login (mirrors the Django
// login_view redirects): Admin -> /admin/*, Faculty -> /faculty/*,
// Student -> /student/*.
const ROLE_HOME = {
  admin: '/admin/dashboard',
  teacher: '/faculty/dashboard',
  student: '/student/dashboard',
};

const PORTAL_LABEL = {
  admin: 'Admin portal',
  faculty: 'Faculty portal',
  student: 'Student portal',
};

// Topbar breadcrumb label derived from the current URL.
const PAGE_LABELS = [
  { test: (p) => p.includes('/routines'), label: 'Routines' },
  { test: (p) => p.includes('/cancellations'), label: 'Class cancellations' },
  { test: (p) => /\/users\/\d+/.test(p), label: 'User Profile' },
  { test: (p) => p.endsWith('/users'), label: 'Users' },
  { test: (p) => p.endsWith('/issue-desk'), label: 'Issue desk' },
  { test: (p) => p.endsWith('/room-booking'), label: 'Room booking' },
  { test: (p) => p.endsWith('/notices'), label: 'Notice board' },
  { test: (p) => p.includes('/meal-query'), label: 'Meal query' },
  { test: (p) => p.includes('/bus-navigate'), label: 'Bus tracker' },
  { test: (p) => p.endsWith('/settings'), label: 'Settings' },
  { test: () => true, label: 'Dashboard' },
];

/**
 * Redirect that preserves the current URL's query string — used for
 * legacy admin routes like /routines/edit?dept=...&batch=...&sec=...
 * where the Wizard passes selection via search params.
 */
function RedirectWithSearch({ to }) {
  const [searchParams] = useSearchParams();
  const qs = searchParams.toString();
  return <Navigate to={qs ? `${to}?${qs}` : to} replace />;
}

function PortalLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-black/10 border-t-lime-deep" />
    </div>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const { updateProfile } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('student');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/login/'), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': getCsrfToken() || '',
        },
        body: JSON.stringify({ email, password, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed.');
        return;
      }
      const p = data.profile || {};
      updateProfile({
        id: p.id,
        fullName: p.full_name || '',
        username: p.username || '',
        email: p.email || '',
        role: p.role || role,
        department: p.department || '',
        batch: p.batch || '',
        section: p.section || '',
        isCr: !!p.is_cr,
        profilePicture: p.profile_picture || null,
      });
      const roleHome = { admin: '/admin/dashboard', teacher: '/faculty/dashboard', student: '/student/dashboard' };
      navigate(roleHome[p.role || role] || '/student/dashboard');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-[60vh] place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-lime text-2xl font-black text-charcoal shadow-sm shadow-lime/40">
          CP
        </div>
        <h1 className="text-center text-3xl font-black tracking-tight text-charcoal">Sign in</h1>
        <p className="mt-3 text-center text-sm text-gray-600">
          Welcome back! Please enter your credentials.
        </p>

        {error && (
          <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email or Username</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30"
              placeholder="you@example.com"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30"
              placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">I am a</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30"
            >
              <option value="student">Student</option>
              <option value="teacher">Faculty</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-lime px-4 py-3 text-sm font-semibold text-charcoal transition hover:brightness-95 disabled:opacity-50"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Don’t have an account?{' '}
          <a href="/register" className="font-semibold text-lime-deep hover:underline">
            Sign up
          </a>
        </p>
      </div>
    </div>
  );
}

function RegisterPage() {
  const navigate = useNavigate();
  const { updateProfile } = useUser();
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', confirm_password: '',
    role: 'student', campus_id: '', admin_key: '',
    department: 'CSE', batch: '0', section: 'A',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/auth/register/'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Registration failed.'); return; }
      // Admin is auto-approved and logged in; redirect to dashboard.
      if (data.ok && data.profile) {
        const p = data.profile;
        updateProfile({
          id: p.id, fullName: p.full_name || '', username: p.username || '',
          email: p.email || '', role: p.role || form.role,
          department: p.department || '', batch: p.batch || '', section: p.section || '',
          isCr: !!p.is_cr, profilePicture: p.profile_picture || null,
        });
        const roleHome = { admin: '/admin/dashboard', teacher: '/faculty/dashboard', student: '/student/dashboard' };
        navigate(roleHome[p.role || form.role] || '/student/dashboard');
        return;
      }
      // Student/faculty pending approval.
      setSuccess(data.message || 'Registration successful! Please wait for admin approval, then log in.');
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const isStudent = form.role === 'student';
  const isAdmin = form.role === 'admin';
  const validSections = SECTIONS[form.department] || ['A'];

  return (
    <div className="grid min-h-[60vh] place-items-center px-4 py-8">
      <div className="w-full max-w-md rounded-3xl border border-black/5 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full bg-lime text-2xl font-black text-charcoal shadow-sm shadow-lime/40">
          CP
        </div>
        <h1 className="text-center text-3xl font-black tracking-tight text-charcoal">Create account</h1>
        <p className="mt-3 text-center text-sm text-gray-600">Join the campus platform</p>

        {error && <div className="mt-4 rounded-lg bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {success && <div className="mt-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Full Name</label>
            <input type="text" value={form.full_name} onChange={set('full_name')}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Email</label>
            <input type="email" value={form.email} onChange={set('email')}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">I am a</label>
            <select value={form.role} onChange={set('role')}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30">
              <option value="student">Student</option>
              <option value="teacher">Faculty</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {!isAdmin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {isStudent ? 'Student ID' : 'Faculty ID'}
              </label>
              <input type="text" value={form.campus_id} onChange={set('campus_id')}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30" required />
            </div>
          )}
          {isAdmin && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Admin Security Key</label>
              <input type="password" value={form.admin_key} onChange={set('admin_key')}
                className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30" required />
            </div>
          )}
          {isStudent && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Department</label>
                <select value={form.department} onChange={set('department')}
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30">
                  {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Batch</label>
                  <select value={form.batch} onChange={set('batch')}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30">
                    {BATCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Section</label>
                  <select value={form.section} onChange={set('section')}
                    className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30">
                    {validSections.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Password</label>
            <input type="password" value={form.password} onChange={set('password')}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30"
              placeholder="Min 8 characters" required />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Confirm Password</label>
            <input type="password" value={form.confirm_password} onChange={set('confirm_password')}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm outline-none transition focus:border-lime focus:ring-2 focus:ring-lime/30" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full rounded-xl bg-lime px-4 py-3 text-sm font-semibold text-charcoal transition hover:brightness-95 disabled:opacity-50">
            {loading ? 'Creating account...' : 'Sign up'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <a href="/login" className="font-semibold text-lime-deep hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}

/**
 * Guards a portal route: waits for the profile fetch, bounces signed-out
 * users to the login page, and redirects a user who hits another role's
 * portal back to their own dashboard (a faculty can never render /admin/*).
 */
function RoleGate({ role, children }) {
  const { role: currentRole, loading } = useUser();
  if (loading) return <PortalLoader />;
  if (!currentRole) return <Navigate to="/login" replace />;
  if (currentRole !== role) return <Navigate to={ROLE_HOME[currentRole]} replace />;
  return children;
}

/** The site root resolves to whichever portal the signed-in role owns. */
function RoleHomeRedirect() {
  const { role, loading } = useUser();
  if (loading) return <PortalLoader />;
  return role ? <Navigate to={ROLE_HOME[role]} replace /> : <Navigate to="/login" replace />;
}

export default function App() {
  const [collapsed, setCollapsed] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  // Which portal shell is active is derived from the URL — the persistent
  // layout (sidebar + topbar) stays mounted across navigation.
  const variant = pathname.startsWith('/faculty')
    ? 'faculty'
    : pathname.startsWith('/student')
      ? 'student'
      : 'admin';

  const width = collapsed ? SIDEBAR_W.collapsed : SIDEBAR_W.expanded;
  const pageLabel = PAGE_LABELS.find((r) => r.test(pathname))?.label ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-canvas" style={{ '--sidebar-w': `${width}px` }}>
      {/* Persistent shared layout shell — variant follows the current portal */}
      <Sidebar
        variant={variant}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onToggle={() => setCollapsed((v) => !v)}
        onExpand={() => setCollapsed(false)}
        onMobileClose={() => setMobileOpen(false)}
      />

      <div className="transition-[margin] duration-300 ease-in-out md:ml-[var(--sidebar-w)]">
        <Topbar portalLabel={PORTAL_LABEL[variant]} pageLabel={pageLabel} onMenuToggle={() => setMobileOpen((v) => !v)} />

        <main className="px-3 pb-10 pt-4 sm:px-5 md:px-5 lg:px-8">
          <Routes>
            {/* Entry point + legacy admin URLs (bookmarks keep working) */}
            <Route path="/" element={<RoleHomeRedirect />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/users" element={<Navigate to="/admin/users" replace />} />
            <Route path="/routines" element={<Navigate to="/admin/routines" replace />} />
            <Route path="/routines/edit" element={<RedirectWithSearch to="/admin/routines/edit" />} />
            <Route path="/routines/download" element={<RedirectWithSearch to="/admin/routines/download" />} />
            <Route path="/issue-desk" element={<Navigate to="/admin/issue-desk" replace />} />
            <Route path="/room-booking" element={<Navigate to="/admin/room-booking" replace />} />
            <Route path="/notices" element={<Navigate to="/admin/notices" replace />} />
            <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

            {/* ---- Admin portal (/admin/*) ---- */}
            <Route path="/admin/dashboard" element={<RoleGate role="admin"><Dashboard /></RoleGate>} />
            <Route path="/admin/users" element={<RoleGate role="admin"><Users /></RoleGate>} />
            <Route path="/admin/users/:userId" element={<RoleGate role="admin"><UserProfile /></RoleGate>} />
            <Route path="/admin/routines" element={<RoleGate role="admin"><Routines /></RoleGate>} />
            <Route path="/admin/routines/edit" element={<RoleGate role="admin"><RoutineEdit /></RoleGate>} />
            <Route path="/admin/routines/download" element={<RoleGate role="admin"><RoutineDownload /></RoleGate>} />
            <Route
              path="/admin/issue-desk"
              element={
                <RoleGate role="admin">
                  <AdminIssueDesk />
                </RoleGate>
              }
            />
            <Route path="/admin/room-booking" element={<RoleGate role="admin"><RoomBooking /></RoleGate>} />
            <Route path="/admin/notices" element={<RoleGate role="admin"><Notices /></RoleGate>} />
            <Route path="/admin/settings" element={<RoleGate role="admin"><Settings /></RoleGate>} />

            {/* ---- Faculty portal (/faculty/*) ---- */}
            <Route path="/faculty/dashboard" element={<RoleGate role="teacher"><FacultyDashboard /></RoleGate>} />
            <Route path="/faculty/routines" element={<RoleGate role="teacher"><FacultyRoutines /></RoleGate>} />
            <Route path="/teacher/routines" element={<Navigate to="/faculty/routines" replace />} />
            <Route path="/faculty/cancellations" element={<RoleGate role="teacher"><FacultyCancellations /></RoleGate>} />
            <Route path="/teacher/cancellations" element={<Navigate to="/faculty/cancellations" replace />} />
            <Route path="/faculty/room-booking" element={<RoleGate role="teacher"><FacultyRoomBooking /></RoleGate>} />
            <Route path="/faculty/issue-desk" element={<RoleGate role="teacher"><FacultyIssueDesk /></RoleGate>} />
            <Route path="/teacher/issue-desk" element={<Navigate to="/faculty/issue-desk" replace />} />
            <Route path="/faculty/settings" element={<RoleGate role="teacher"><Settings /></RoleGate>} />

            {/* ---- Student portal (/student/*) ---- */}
            <Route path="/student/dashboard" element={<RoleGate role="student"><StudentDashboard /></RoleGate>} />
            <Route path="/student/routines" element={<RoleGate role="student"><FacultyRoutines /></RoleGate>} />
            <Route path="/student/cancellations" element={<RoleGate role="student"><StudentCancellations /></RoleGate>} />
            <Route path="/student/room-booking" element={<RoleGate role="student"><FacultyRoomBooking /></RoleGate>} />
            <Route path="/student/issue-desk" element={<RoleGate role="student"><FacultyIssueDesk /></RoleGate>} />
            <Route path="/student/meal-query" element={<RoleGate role="student"><MealQuery /></RoleGate>} />
            <Route path="/student/bus-navigate" element={<RoleGate role="student"><BusNavigate /></RoleGate>} />
            <Route path="/student/settings" element={<RoleGate role="student"><Settings /></RoleGate>} />

            <Route path="*" element={<RoleHomeRedirect />} />
          </Routes>
        </main>
      </div>

      {/* Floating Gemini assistant — visible on every portal dashboard */}
      <ChatWidget />
    </div>
  );
}
