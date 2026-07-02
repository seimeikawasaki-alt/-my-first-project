import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');

const navItems = [
  { label: 'ダッシュボード', icon: '🏠', to: '/admin/dashboard' },
  { label: 'スタッフ管理', icon: '👥', to: '/admin/staff' },
  { label: 'グループ管理', icon: '👪', to: '/admin/groups' },
  { label: 'シフト管理', icon: '📅', to: `/admin/shifts/${year}/${month}` },
  { label: 'シフト設定', icon: '🔧', to: '/admin/shift-settings' },
  { label: 'シフト申請一覧', icon: '📝', to: '/admin/shift-requests' },
  { label: '勤怠管理', icon: '⏰', to: `/admin/attendance/${year}/${month}` },
  { label: '給与管理', icon: '💴', to: `/admin/salary/${year}/${month}` },
  { label: '給与項目設定', icon: '🧾', to: '/admin/salary/settings' },
  { label: '設定', icon: '⚙️', to: '/admin/settings' },
];

export default function AdminSidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-border flex flex-col">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-xl font-bold text-primary">CareShift</h1>
        <p className="text-xs text-subtext mt-0.5">介護施設管理システム</p>
      </div>

      <nav className="flex-1 py-4">
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-6 py-3 text-body transition-colors ${
                isActive
                  ? 'bg-blue-50 text-primary font-medium border-r-2 border-primary'
                  : 'text-text hover:bg-gray-50'
              }`
            }
          >
            <span className="text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-6 py-4 border-t border-border">
        <div className="mb-3">
          <p className="text-sub font-medium text-text">
            {user?.lastName} {user?.firstName}
          </p>
          <p className="text-xs text-subtext">{user?.userCode}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-sub text-subtext hover:text-danger transition-colors py-1"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
