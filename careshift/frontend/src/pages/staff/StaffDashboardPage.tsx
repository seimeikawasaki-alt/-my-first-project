import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const now = new Date();

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="bg-background">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-xl font-bold text-primary">CareShift</h1>
          <span className="text-sub text-subtext">{user?.lastName} {user?.firstName}</span>
        </div>
      </header>

      <main className="px-4 py-6 max-w-lg mx-auto">
        <div className="mb-6">
          <h2 className="text-heading font-bold text-text">ホーム</h2>
          <p className="text-sub text-subtext mt-1">{today}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {[
            { label: '打刻', icon: '⏱️', to: '/staff/punch' },
            { label: 'シフト確認', icon: '📅', to: '/staff/shifts' },
            { label: '勤怠履歴', icon: '📋', to: '/staff/attendance' },
            { label: 'シフト申請', icon: '✉️', to: '/staff/shift-request' },
          ].map(item => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="bg-white rounded-xl border border-border text-center cursor-pointer hover:shadow-md transition-shadow py-8"
            >
              <p className="text-4xl mb-2">{item.icon}</p>
              <p className="font-bold text-text">{item.label}</p>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
