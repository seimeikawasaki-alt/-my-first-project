import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import LoadingSpinner from './components/common/LoadingSpinner';
import ToastContainer from './components/common/Toast';
import NotFoundPage from './pages/NotFoundPage';
import AdminLayout from './components/layout/AdminLayout';
import StaffLayout from './components/layout/StaffLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import StaffListPage from './pages/admin/StaffListPage';
import StaffFormPage from './pages/admin/StaffFormPage';
import GroupsPage from './pages/admin/GroupsPage';
import SettingsPage from './pages/admin/SettingsPage';
import ShiftsPage from './pages/admin/ShiftsPage';
import AttendancePage from './pages/admin/AttendancePage';
import ShiftSettingsPage from './pages/admin/ShiftSettingsPage';
import ShiftRequestsPage from './pages/admin/ShiftRequestsPage';
import GroupDetailPage from './pages/admin/GroupDetailPage';
import SalaryPage from './pages/admin/SalaryPage';
import SalarySettingsPage from './pages/admin/SalarySettingsPage';
import PaidLeavePage from './pages/admin/PaidLeavePage';
import OvertimePage from './pages/admin/OvertimePage';
import ShiftSwapPage from './pages/admin/ShiftSwapPage';
import AuditLogsPage from './pages/admin/AuditLogsPage';
import StaffDashboardPage from './pages/staff/StaffDashboardPage';
import PunchPage from './pages/staff/PunchPage';
import MyShiftsPage from './pages/staff/MyShiftsPage';
import MyAttendancePage from './pages/staff/MyAttendancePage';
import ShiftRequestPage from './pages/staff/ShiftRequestPage';
import ProfilePage from './pages/staff/ProfilePage';
import PayslipsPage from './pages/staff/PayslipsPage';
import StaffPaidLeavePage from './pages/staff/PaidLeavePage';

function RequireAuth({ children, requiredRole }: {
  children: React.ReactNode;
  requiredRole?: 'ADMIN' | 'GROUP_LEADER' | 'STAFF';
}) {
  const { user, isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole === 'ADMIN' && user?.role !== 'ADMIN') {
    return <Navigate to="/staff/dashboard" replace />;
  }

  return <>{children}</>;
}

const now = new Date();
const currYear = now.getFullYear();
const currMonth = String(now.getMonth() + 1).padStart(2, '0');

export default function App() {
  const { fetchMe, isLoading } = useAuthStore();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Admin routes */}
        <Route
          path="/admin"
          element={
            <RequireAuth requiredRole="ADMIN">
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="staff" element={<StaffListPage />} />
          <Route path="staff/:id" element={<StaffFormPage />} />
          <Route path="groups" element={<GroupsPage />} />
          <Route path="shifts/:year/:month" element={<ShiftsPage />} />
          <Route path="attendance/:year/:month" element={<AttendancePage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="shift-settings" element={<ShiftSettingsPage />} />
          <Route path="shift-requests" element={<ShiftRequestsPage />} />
          <Route path="groups/:id" element={<GroupDetailPage />} />
          <Route path="salary/settings" element={<SalarySettingsPage />} />
          <Route path="salary/:year/:month" element={<SalaryPage />} />
          <Route path="paid-leave" element={<PaidLeavePage />} />
          <Route path="overtime" element={<OvertimePage />} />
          <Route path="shift-swap" element={<ShiftSwapPage />} />
          <Route path="audit-logs" element={<AuditLogsPage />} />
        </Route>

        {/* Staff routes with bottom nav layout */}
        <Route
          path="/staff"
          element={
            <RequireAuth>
              <StaffLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="/staff/dashboard" replace />} />
          <Route path="dashboard" element={<StaffDashboardPage />} />
          <Route path="punch" element={<PunchPage />} />
          <Route path="shifts" element={<MyShiftsPage />} />
          <Route path="attendance" element={<MyAttendancePage />} />
          <Route path="shift-request" element={<ShiftRequestPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="payslips" element={<PayslipsPage />} />
          <Route path="paid-leave" element={<StaffPaidLeavePage />} />
        </Route>

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export { currYear, currMonth };
