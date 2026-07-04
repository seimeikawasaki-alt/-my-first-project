import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { getMyDashboard, type MyDashboard } from '../../api/dashboard';
import { Skeleton } from '../../components/common/Skeleton';

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

  const [data, setData] = useState<MyDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissAlert, setDismissAlert] = useState(false);

  const today = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const hour = now.getHours();
  const greeting = hour < 11 ? 'おはようございます' : 'お疲れさまです';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyDashboard();
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const missing = data?.missingPunchOut;
  const missingLabel = missing ? (() => {
    const d = new Date(missing.date);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
  })() : '';

  const s = data?.monthSummary;

  return (
    <div className="bg-background min-h-screen">
      <header className="bg-white border-b border-border px-4 py-3 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-lg font-bold text-primary">CareShift</h1>
          <span className="text-sub text-subtext">{user?.lastName} {user?.firstName} さん</span>
        </div>
      </header>

      <main className="px-4 py-5 max-w-lg mx-auto">
        {/* Punch-forgot alert */}
        {missing && !dismissAlert && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 mb-4">
            <span className="text-lg">⚠️</span>
            <p className="flex-1 text-sub text-amber-800">
              {missingLabel} の退勤打刻がありません。管理者に連絡してください。
            </p>
            <button onClick={() => setDismissAlert(true)} className="text-amber-700 font-bold px-1">×</button>
          </div>
        )}

        {/* Greeting hero */}
        <div className="rounded-2xl bg-gradient-to-br from-primary to-blue-500 text-white p-5 mb-5 shadow-sm">
          <p className="text-xs opacity-90">{today}</p>
          <p className="text-xl font-bold mt-1">{greeting}、{user?.lastName}さん</p>
        </div>

        {/* Today's shift */}
        <section className="mb-5">
          <h2 className="text-sub font-bold text-subtext mb-2">今日のシフト</h2>
          {loading ? (
            <Skeleton className="h-24 w-full rounded-2xl" />
          ) : data?.todayShift ? (
            <div className="bg-white rounded-2xl border border-border p-4">
              <div className="flex items-center gap-3">
                <span className="w-3 h-10 rounded-full" style={{ backgroundColor: data.todayShift.color ?? '#94A3B8' }} />
                <div className="flex-1">
                  <p className="text-lg font-bold text-text">
                    {data.todayShift.name}
                    {data.todayShift.isNightShift && <span className="ml-2 text-xs bg-purple-100 text-purple-600 px-2 py-0.5 rounded-full">夜勤</span>}
                  </p>
                  <p className="text-sub text-subtext">
                    {data.todayShift.startTime}〜{data.todayShift.endTime} ・ 休憩{data.todayShift.breakMinutes}分
                  </p>
                </div>
              </div>
              <button onClick={() => navigate('/staff/punch')} className="w-full btn-primary mt-3">
                打刻画面へ →
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-border p-5 text-center">
              <p className="text-3xl mb-1">🌿</p>
              <p className="text-sub text-subtext">今日はシフトがありません（公休）</p>
            </div>
          )}
        </section>

        {/* Month summary */}
        <section className="mb-5">
          <h2 className="text-sub font-bold text-subtext mb-2">今月のサマリー</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: '勤務', value: s?.workDays, unit: '日', color: 'text-primary' },
              { label: '夜勤', value: s?.nightCount, unit: '回', color: 'text-purple-600' },
              { label: '公休', value: s?.offDays, unit: '日', color: 'text-text' },
            ].map((item) => (
              <div key={item.label} className="bg-white rounded-2xl border border-border py-4 text-center">
                <p className="text-xs text-subtext mb-1">{item.label}</p>
                {loading ? <Skeleton className="h-7 w-10 mx-auto" /> : (
                  <p className={`text-2xl font-bold ${item.color}`}>{item.value ?? 0}<span className="text-xs font-normal text-subtext ml-0.5">{item.unit}</span></p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Quick actions */}
        <section className="mb-5">
          <h2 className="text-sub font-bold text-subtext mb-2">メニュー</h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => navigate('/staff/punch')}
              className="col-span-2 rounded-2xl bg-primary text-white py-4 flex items-center justify-center gap-2 text-lg font-bold shadow-sm active:scale-[0.99] transition-transform"
            >
              <span className="text-2xl">⏱️</span> 打刻する
            </button>
            {actions.map((item) => (
              <button
                key={item.to}
                onClick={() => navigate(item.to)}
                className="bg-white rounded-2xl border border-border py-5 flex flex-col items-center gap-2 active:scale-[0.98] transition-transform"
              >
                <span className={`w-11 h-11 rounded-full flex items-center justify-center text-xl ${item.tint}`}>{item.icon}</span>
                <span className="font-bold text-text text-sub">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Notices */}
        {(data?.notices.length ?? 0) > 0 && (
          <section>
            <h2 className="text-sub font-bold text-subtext mb-2">お知らせ</h2>
            <div className="space-y-2">
              {data!.notices.map((n, i) => (
                <div key={i} className="flex items-start gap-2 bg-white rounded-xl border border-border px-4 py-3">
                  <span className="text-primary">ℹ️</span>
                  <p className="text-sub text-text">{n.text}</p>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
