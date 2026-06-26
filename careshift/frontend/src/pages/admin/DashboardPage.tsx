import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');

const quickLinks = [
  { label: 'スタッフ管理', icon: '👥', to: '/admin/staff', color: 'bg-blue-50 text-primary border-blue-200' },
  { label: 'シフト管理', icon: '📅', to: `/admin/shifts/${year}/${month}`, color: 'bg-green-50 text-success border-green-200' },
  { label: '勤怠管理', icon: '⏰', to: `/admin/attendance/${year}/${month}`, color: 'bg-yellow-50 text-warning border-yellow-200' },
  { label: '給与管理', icon: '💴', to: `/admin/salary/${year}/${month}`, color: 'bg-purple-50 text-purple-600 border-purple-200' },
];

const statCards = [
  { label: '本日の出勤', value: '—', sub: '人', color: 'text-success' },
  { label: '本日の欠勤', value: '—', sub: '人', color: 'text-danger' },
  { label: '夜勤', value: '—', sub: '人', color: 'text-primary' },
  { label: 'シフト変更申請', value: '—', sub: '件', color: 'text-warning' },
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-heading font-bold text-text">ダッシュボード</h1>
        <p className="text-sub text-subtext mt-1">{today}</p>
      </div>

      <div className="mb-6">
        <p className="text-body text-text">
          おはようございます、<span className="font-bold">{user?.lastName} {user?.firstName}</span> 様
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map(card => (
          <div key={card.label} className="card text-center">
            <p className="text-sub text-subtext mb-2">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color}`}>
              {card.value}
              <span className="text-base font-normal text-subtext ml-1">{card.sub}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Quick Access */}
      <div className="mb-8">
        <h2 className="text-card-title font-bold text-text mb-4">クイックアクセス</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {quickLinks.map(link => (
            <button
              key={link.to}
              onClick={() => navigate(link.to)}
              className={`card text-center cursor-pointer hover:shadow-md transition-shadow border ${link.color}`}
            >
              <p className="text-3xl mb-2">{link.icon}</p>
              <p className="font-bold text-sub">{link.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Notice */}
      <div className="card">
        <h2 className="text-card-title font-bold text-text mb-4">お知らせ</h2>
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <span className="text-primary text-lg mt-0.5">ℹ️</span>
            <div>
              <p className="text-sub font-medium text-text">CareShift Phase 1 が稼働しました</p>
              <p className="text-xs text-subtext mt-0.5">{today}</p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-border">
            <span className="text-subtext text-lg mt-0.5">📋</span>
            <div>
              <p className="text-sub text-subtext">現在、シフト管理・勤怠管理機能は Phase 2 で実装予定です</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
