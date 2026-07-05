import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getTodayDashboard, type TodayDashboard, type DashboardStaff } from '../../api/dashboard';
import { getOvertimeAlerts } from '../../api/overtime';
import { Skeleton } from '../../components/common/Skeleton';
import EmptyState from '../../components/common/EmptyState';

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
  const [overtimeAlertCount, setOvertimeAlertCount] = useState(0);

  const today = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getTodayDashboard();
      setData(res.data);
    } finally {
      setLoading(false);
    }
    // 残業アラート（失敗しても致命的でない）
    try {
      const alerts = await getOvertimeAlerts({ year: now.getFullYear(), month: now.getMonth() + 1 });
      setOvertimeAlertCount(alerts.data.length);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const panelList: DashboardStaff[] =
    panel === 'working' ? data?.working ?? []
      : panel === 'absent' ? data?.absent ?? []
        : [];

  const StatCard = ({ label, value, unit, color, active, onClick, highlight }: {
    label: string; value: number | undefined; unit: string; color: string;
    active?: boolean; onClick?: () => void; highlight?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`card text-center transition-all ${onClick ? 'cursor-pointer hover:shadow-md' : 'cursor-default'} ${active ? 'ring-2 ring-primary' : ''} ${highlight && value ? 'bg-red-50 border-red-200' : ''}`}
    >
      <p className="text-xs sm:text-sub text-subtext mb-1">{label}</p>
      {loading ? (
        <Skeleton className="h-8 w-12 mx-auto" />
      ) : (
        <p className={`text-2xl sm:text-3xl font-bold ${color}`}>
          {value ?? 0}<span className="text-sm font-normal text-subtext ml-0.5">{unit}</span>
        </p>
      )}
    </button>
  );

  return (
    <div className="p-6 sm:p-8">
      <div className="mb-6">
        <h1 className="text-heading font-bold text-text">ダッシュボード</h1>
        <p className="text-sub text-subtext mt-1">{today}</p>
        <p className="text-body text-text mt-3">
          おはようございます、<span className="font-bold">{user?.lastName} {user?.firstName}</span> 様
        </p>
      </div>

      {/* Overtime alert banner */}
      {overtimeAlertCount > 0 && (
        <button onClick={() => navigate('/admin/overtime')} className="w-full flex items-center gap-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4 text-left hover:bg-amber-100 transition-colors">
          <span className="text-lg">⚠️</span>
          <span className="flex-1 text-sub text-amber-800 font-medium">残業時間が上限に近いスタッフが{overtimeAlertCount}名います</span>
          <span className="text-amber-700">›</span>
        </button>
      )}

      {/* Row 1: today's status */}
      <h2 className="text-card-title font-bold text-text mb-3">本日の状況</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
        <StatCard label="出勤中" value={data?.workingCount} unit="人" color="text-success" active={panel === 'working'} onClick={() => togglePanel('working')} />
        <StatCard label="欠勤" value={data?.absent.length} unit="人" color="text-danger" active={panel === 'absent'} onClick={() => togglePanel('absent')} highlight />
        <StatCard label="夜勤中" value={data?.nightWorkingCount} unit="人" color="text-purple-600" />
        <StatCard label="未打刻（退勤）" value={data?.notPunchedOut.length} unit="人" color="text-warning" highlight />
      </div>

      {/* Expandable staff list */}
      {panel && (
        <div className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-text">
              {panel === 'working' ? '出勤中のスタッフ' : panel === 'absent' ? '欠勤（シフトあり・未出勤）' : '夜勤中のスタッフ'}
            </h3>
            <button onClick={() => setPanel(null)} className="text-subtext hover:text-text text-sub">閉じる</button>
          </div>
          {panelList.length === 0 ? (
            <p className="text-center text-subtext text-sub py-4">該当するスタッフはいません</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {panelList.map((s) => (
                <span key={s.userId} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sub font-medium ${panel === 'absent' ? 'bg-red-50 text-danger' : 'bg-green-50 text-success'}`}>
                  {s.name}
                  {s.onBreak && <span className="text-[10px] bg-yellow-100 text-warning px-1.5 py-0.5 rounded-full">休憩中</span>}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Row 2: this month's progress */}
      <h2 className="text-card-title font-bold text-text mb-3 mt-6">今月の進捗</h2>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-6">
        <button onClick={() => navigate(`/admin/salary/${year}/${month}`)} className="card cursor-pointer hover:shadow-md transition-all text-left">
          <p className="text-sub text-subtext mb-1">給与計算 未確定</p>
          {loading ? <Skeleton className="h-8 w-12" /> : (
            <p className="text-2xl font-bold text-primary">{data?.payrollUnconfirmed ?? 0}<span className="text-sm font-normal text-subtext ml-1">名</span></p>
          )}
        </button>
        <button onClick={() => navigate('/admin/shift-requests')} className="card cursor-pointer hover:shadow-md transition-all text-left">
          <p className="text-sub text-subtext mb-1">希望休・シフト申請</p>
          {loading ? <Skeleton className="h-8 w-12" /> : (
            <p className="text-2xl font-bold text-warning">{data?.pendingRequests ?? 0}<span className="text-sm font-normal text-subtext ml-1">件承認待ち</span></p>
          )}
        </button>
      </div>

      {/* Row 3: quick access */}
      <h2 className="text-card-title font-bold text-text mb-3">クイックアクセス</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {quickLinks.map((link) => (
          <button key={link.to} onClick={() => navigate(link.to)} className={`card text-center cursor-pointer hover:shadow-md transition-shadow border ${link.color}`}>
            <p className="text-3xl mb-2">{link.icon}</p>
            <p className="font-bold text-sub">{link.label}</p>
          </button>
        ))}
      </div>

      {/* Row 4: not-punched-out list */}
      <div className="card mb-6">
        <h2 className="text-card-title font-bold text-text mb-4">未打刻スタッフ（本日・退勤未打刻）</h2>
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
        ) : (data?.notPunchedOut.length ?? 0) === 0 ? (
          <EmptyState icon="✅" title="退勤未打刻のスタッフはいません" />
        ) : (
          <div className="divide-y divide-border">
            {data!.notPunchedOut.map((s) => (
              <div key={s.userId} className="flex items-center justify-between py-2.5">
                <span className="font-medium text-text">{s.name}</span>
                <span className="text-sub text-subtext">出勤 {s.punchIn ?? '—'} / <span className="text-warning">退勤未打刻</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Notices: pending requests */}
      <div className="card">
        <h2 className="text-card-title font-bold text-text mb-4">お知らせ</h2>
        {loading ? (
          <Skeleton className="h-10 w-full" />
        ) : (data?.recentRequests.length ?? 0) === 0 ? (
          <p className="text-sub text-subtext">新しい申請はありません</p>
        ) : (
          <div className="space-y-2">
            {data!.recentRequests.map((r) => (
              <button key={r.id} onClick={() => navigate('/admin/shift-requests')} className="w-full flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100 text-left hover:bg-blue-100 transition-colors">
                <span className="text-primary text-lg mt-0.5">✉️</span>
                <p className="text-sub text-text">
                  <span className="font-medium">{r.name}</span> さんから{r.requestType}が届きました
                  {r.targetDate && `（${new Date(r.targetDate).getMonth() + 1}/${new Date(r.targetDate).getDate()}）`}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
