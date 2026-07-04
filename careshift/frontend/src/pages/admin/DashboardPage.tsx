import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getTodayDashboard, type TodayDashboard, type DashboardStaff } from '../../api/dashboard';

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');

const quickLinks = [
  { label: 'スタッフ管理', icon: '👥', to: '/admin/staff', color: 'bg-blue-50 text-primary border-blue-200' },
  { label: 'シフト管理', icon: '📅', to: `/admin/shifts/${year}/${month}`, color: 'bg-green-50 text-success border-green-200' },
  { label: '勤怠管理', icon: '⏰', to: `/admin/attendance/${year}/${month}`, color: 'bg-yellow-50 text-warning border-yellow-200' },
  { label: '給与管理', icon: '💴', to: `/admin/salary/${year}/${month}`, color: 'bg-purple-50 text-purple-600 border-purple-200' },
];

type Panel = 'working' | 'absent' | null;

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [data, setData] = useState<TodayDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [panel, setPanel] = useState<Panel>(null);

  const today = now.toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTodayDashboard();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dash = (v: number | undefined) => (loading || v == null ? '—' : String(v));
  const togglePanel = (p: Panel) => setPanel(cur => (cur === p ? null : p));

  const panelList: DashboardStaff[] =
    panel === 'working' ? data?.working ?? [] : panel === 'absent' ? data?.absent ?? [] : [];

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="text-heading font-bold text-text">ダッシュボード</h1>
        <p className="text-sub text-subtext mt-1">{today}</p>
        <p className="text-body text-text mt-3">
          おはようございます、<span className="font-bold">{user?.lastName} {user?.firstName}</span> 様
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-4">
        {/* 出勤中 */}
        <button
          onClick={() => togglePanel('working')}
          className={`card text-center cursor-pointer transition-all hover:shadow-md ${panel === 'working' ? 'ring-2 ring-success' : ''}`}
        >
          <p className="text-xs sm:text-sub text-subtext mb-1">出勤中</p>
          <p className="text-2xl sm:text-3xl font-bold text-success">
            {dash(data?.working.length)}<span className="text-sm font-normal text-subtext ml-0.5">人</span>
          </p>
          <p className="text-[10px] text-subtext mt-1">タップで一覧</p>
        </button>

        {/* 欠勤中 */}
        <button
          onClick={() => togglePanel('absent')}
          className={`card text-center cursor-pointer transition-all hover:shadow-md ${panel === 'absent' ? 'ring-2 ring-danger' : ''}`}
        >
          <p className="text-xs sm:text-sub text-subtext mb-1">欠勤中</p>
          <p className="text-2xl sm:text-3xl font-bold text-danger">
            {dash(data?.absent.length)}<span className="text-sm font-normal text-subtext ml-0.5">人</span>
          </p>
          <p className="text-[10px] text-subtext mt-1">シフトあり・未出勤</p>
        </button>

        {/* シフト申請 */}
        <button
          onClick={() => navigate('/admin/shift-requests')}
          className="card text-center cursor-pointer transition-all hover:shadow-md"
        >
          <p className="text-xs sm:text-sub text-subtext mb-1">シフト申請</p>
          <p className="text-2xl sm:text-3xl font-bold text-warning">
            {dash(data?.pendingRequests)}<span className="text-sm font-normal text-subtext ml-0.5">件</span>
          </p>
          <p className="text-[10px] text-subtext mt-1">審査中</p>
        </button>
      </div>

      {/* Expandable staff list */}
      {panel && (
        <div className="card mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-text">
              {panel === 'working' ? '出勤中のスタッフ' : '欠勤中のスタッフ（シフトあり・未出勤）'}
            </h2>
            <button onClick={() => setPanel(null)} className="text-subtext hover:text-text text-sub">閉じる</button>
          </div>
          {panelList.length === 0 ? (
            <p className="text-center text-subtext text-sub py-6">該当するスタッフはいません</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {panelList.map(s => (
                <span
                  key={s.userId}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sub font-medium ${
                    panel === 'working' ? 'bg-green-50 text-success' : 'bg-red-50 text-danger'
                  }`}
                >
                  {s.name}
                  {s.onBreak && <span className="text-[10px] bg-yellow-100 text-warning px-1.5 py-0.5 rounded-full">休憩中</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
    </div>
  );
}
