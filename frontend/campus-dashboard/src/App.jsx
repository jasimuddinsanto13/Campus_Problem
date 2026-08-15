import { useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import { useUser } from './context/UserContext';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
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
  { test: (p) => p.endsWith('/users'), label: 'Users' },
  { test: (p) => p.endsWith('/issue-desk'), label: 'Issue desk' },
  { test: (p) => p.endsWith('/room-booking'), label: 'Room booking' },
  { test: (p) => p.endsWith('/notices'), label: 'Notice board' },
  { test: (p) => p.endsWith('/settings'), label: 'Settings' },
  { test: () => true, label: 'Dashboard' },
];

function PortalLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-black/10 border-t-lime-deep" />
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
  if (!currentRole) return <Navigate to="/accounts/login/" replace />;
  if (currentRole !== role) return <Navigate to={ROLE_HOME[currentRole]} replace />;
  return children;
}

/** The site root resolves to whichever portal the signed-in role owns. */
function RoleHomeRedirect() {
  const { role, loading } = useUser();
  if (loading) return <PortalLoader />;
  return <Navigate to={ROLE_HOME[role] || '/accounts/login/'} replace />;
}

export default function App() {
  const [collapsed, setCollapsed] = useState(true);
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
    <div className="min-h-screen bg-canvas">
      {/* Persistent shared layout shell — variant follows the current portal */}
      <Sidebar
        variant={variant}
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        onExpand={() => setCollapsed(false)}
      />

      <div
        className="transition-[margin-left] duration-300 ease-in-out"
        style={{ marginLeft: width }}
      >
        <Topbar portalLabel={PORTAL_LABEL[variant]} pageLabel={pageLabel} />

        <main className="px-5 pb-10 pt-6 lg:px-8">
          <Routes>
            {/* Entry point + legacy admin URLs (bookmarks keep working) */}
            <Route path="/" element={<RoleHomeRedirect />} />
            <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/users" element={<Navigate to="/admin/users" replace />} />
            <Route path="/routines" element={<Navigate to="/admin/routines" replace />} />
            <Route path="/routines/edit" element={<Navigate to="/admin/routines/edit" replace />} />
            <Route path="/routines/download" element={<Navigate to="/admin/routines/download" replace />} />
            <Route path="/issue-desk" element={<Navigate to="/admin/issue-desk" replace />} />
            <Route path="/room-booking" element={<Navigate to="/admin/room-booking" replace />} />
            <Route path="/notices" element={<Navigate to="/admin/notices" replace />} />
            <Route path="/settings" element={<Navigate to="/admin/settings" replace />} />

            {/* ---- Admin portal (/admin/*) ---- */}
            <Route path="/admin/dashboard" element={<RoleGate role="admin"><Dashboard /></RoleGate>} />
            <Route path="/admin/users" element={<RoleGate role="admin"><Users /></RoleGate>} />
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
            <Route path="/student/settings" element={<RoleGate role="student"><Settings /></RoleGate>} />

            <Route path="*" element={<RoleHomeRedirect />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
