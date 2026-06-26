import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const now = new Date();

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-primary">CareShift</h1>
        <div className="flex items-center gap-4">
          <span className="text-sub text-text">{user?.lastName} {user?.firstName}</span>
          <button onClick={handleLogout} className="text-sub text-subtext hover:text-danger transition-colors">
            ログアウト
          </button>
        </div>
      </header>

      <main className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-heading font-bold text-text">マイページ</h2>
          <p className="text-sub text-subtext mt-1">{today}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: '打刻', icon: '⏱️', to: '/staff/punch' },
            { label: 'シフト確認', icon: '📅', to: '/staff/shifts' },
            { label: '勤怠履歴', icon: '📋', to: '/staff/attendance' },
            { label: '給与明細', icon: '💴', to: '/staff/payslips' },
          ].map(item => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="card text-center cursor-pointer hover:shadow-md transition-shadow py-8"
            >
              <p className="text-4xl mb-2">{item.icon}</p>
              <p className="font-bold text-text">{item.label}</p>
            </button>
          ))}
        </div>

        <div className="card">
          <p className="text-sub font-medium text-subtext mb-1">現在の状況</p>
          <p className="text-body text-text">勤怠管理機能は Phase 2 で実装予定です</p>
        </div>
      </main>
    </div>
  );
}
