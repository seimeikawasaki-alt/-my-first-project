import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import LoadingSpinner from './components/common/LoadingSpinner';
import AdminLayout from './components/layout/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/admin/DashboardPage';
import StaffListPage from './pages/admin/StaffListPage';
import StaffFormPage from './pages/admin/StaffFormPage';
import GroupsPage from './pages/admin/GroupsPage';
import PlaceholderPage from './pages/admin/PlaceholderPage';
import StaffDashboardPage from './pages/staff/StaffDashboardPage';

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
          <Route
            path="shifts/:year/:month"
            element={<PlaceholderPage title="シフト管理" phase="Phase 2" />}
          />
          <Route
            path="attendance/:year/:month"
            element={<PlaceholderPage title="勤怠管理" phase="Phase 2" />}
          />
          <Route
            path="salary/:year/:month"
            element={<PlaceholderPage title="給与計算" phase="Phase 3" />}
          />
          <Route
            path="salary/settings"
            element={<PlaceholderPage title="給与項目設定" phase="Phase 3" />}
          />
          <Route
            path="salary/payslips"
            element={<PlaceholderPage title="給与明細一覧" phase="Phase 3" />}
          />
          <Route
            path="settings"
            element={<PlaceholderPage title="システム設定" phase="Phase 2" />}
          />
        </Route>

        {/* Staff routes */}
        <Route
          path="/staff/dashboard"
          element={
            <RequireAuth>
              <StaffDashboardPage />
            </RequireAuth>
          }
        />
        <Route
          path="/staff/*"
          element={
            <RequireAuth>
              <StaffDashboardPage />
            </RequireAuth>
          }
        />

        {/* Root redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
