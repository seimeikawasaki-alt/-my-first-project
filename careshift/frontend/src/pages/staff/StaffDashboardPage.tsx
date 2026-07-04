import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const now = new Date();

const actions = [
  { label: 'シフト確認', icon: '📅', to: '/staff/shifts', tint: 'bg-blue-50 text-primary' },
  { label: '勤怠履歴', icon: '📋', to: '/staff/attendance', tint: 'bg-amber-50 text-warning' },
  { label: 'シフト申請', icon: '✉️', to: '/staff/shift-request', tint: 'bg-violet-50 text-purple-600' },
  { label: '給与明細', icon: '🧾', to: '/staff/payslips', tint: 'bg-emerald-50 text-success' },
];

export default function StaffDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const hour = now.getHours();
  const greeting = hour < 11 ? 'おはようございます' : hour < 18 ? 'お疲れさまです' : 'お疲れさまです';

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-white border-b border-border px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-primary">CareShift</h1>
          <span className="text-sub text-subtext">{user?.lastName} {user?.firstName} さん</span>
        </div>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto">
        {/* Greeting hero */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-white p-5 mb-5 shadow-sm">
          <p className="text-xs opacity-90">{today}</p>
          <p className="text-xl font-bold mt-1">{greeting}、{user?.lastName}さん</p>
        </div>

        {/* Primary punch CTA */}
        <button
          onClick={() => navigate('/staff/punch')}
          className="w-full rounded-2xl bg-primary text-white py-4 mb-5 flex items-center justify-center gap-2 text-lg font-bold shadow-sm active:scale-[0.99] transition-transform"
        >
          <span className="text-2xl">⏱️</span> 打刻する
        </button>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          {actions.map(item => (
            <button
              key={item.to}
              onClick={() => navigate(item.to)}
              className="bg-white rounded-2xl border border-border py-6 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
            >
              <span className={`w-12 h-12 rounded-full flex items-center justify-center text-2xl ${item.tint}`}>{item.icon}</span>
              <span className="font-bold text-text text-sub">{item.label}</span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
