import { useState, useEffect, useCallback } from 'react';
import { punchIn, punchOut, breakStart, breakEnd, getMyAttendances } from '../../api/attendance';
import type { Attendance, AttendanceStatus } from '../../types';

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatTime(dt: string | null | undefined): string {
  if (!dt) return '—';
  const d = new Date(dt);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const STATUS_TEXT: Record<string, string> = {
  PUNCHED_IN: '出勤中',
  ON_BREAK: '休憩中',
  PUNCHED_OUT: '退勤済み',
};

const STATUS_COLOR: Record<string, string> = {
  PUNCHED_IN: 'text-success',
  ON_BREAK: 'text-warning',
  PUNCHED_OUT: 'text-subtext',
};

export default function PunchPage() {
  const [now, setNow] = useState(new Date());
  const [today, setToday] = useState<Attendance | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');

  // Live clock
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadToday = useCallback(async () => {
    const d = new Date();
    try {
      const res = await getMyAttendances({ year: d.getFullYear(), month: d.getMonth() + 1 });
      const todayStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      const rec = res.data.find(a => {
        const wd = new Date(a.workDate);
        const wdStr = `${wd.getUTCFullYear()}-${pad(wd.getUTCMonth() + 1)}-${pad(wd.getUTCDate())}`;
        return wdStr === todayStr;
      });
      setToday(rec ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadToday(); }, [loadToday]);

  const handle = async (action: 'punch-in' | 'punch-out' | 'break-start' | 'break-end') => {
    setActing(true);
    setError('');
    try {
      if (action === 'punch-in') await punchIn();
      else if (action === 'punch-out') await punchOut();
      else if (action === 'break-start') await breakStart();
      else await breakEnd();
      await loadToday();
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setError(msg ?? '操作に失敗しました');
    } finally {
      setActing(false);
    }
  };

  const status = today?.status as AttendanceStatus | undefined;
  const isPunchedIn = status === 'PUNCHED_IN';
  const isOnBreak = status === 'ON_BREAK';
  const isPunchedOut = status === 'PUNCHED_OUT';
  const hasNotStarted = !today || (today && !today.punchIn);

  const dateStr = now.toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-4 text-center">
        <h1 className="text-card-title font-bold text-primary">CareShift 打刻</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-6 py-8 gap-6">
        {/* Clock */}
        <div className="text-center">
          <p className="text-sub text-subtext mb-1">{dateStr}</p>
          <p className="text-5xl font-bold text-text tabular-nums tracking-tight">{timeStr}</p>
        </div>

        {/* Status */}
        {loading ? (
          <p className="text-subtext text-sub">確認中...</p>
        ) : (
          <div className="text-center">
            {status && STATUS_TEXT[status] ? (
              <p className={`text-xl font-bold ${STATUS_COLOR[status]}`}>{STATUS_TEXT[status]}</p>
            ) : (
              <p className="text-xl font-bold text-subtext">未出勤</p>
            )}
            {today?.punchIn && (
              <p className="text-sub text-subtext mt-1">出勤: {formatTime(today.punchIn)}</p>
            )}
            {today?.punchOut && (
              <p className="text-sub text-subtext">退勤: {formatTime(today.punchOut)}</p>
            )}
          </div>
        )}

        {error && (
          <div className="w-full max-w-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-danger text-sub text-center">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        {!loading && (
          <div className="w-full max-w-sm space-y-3">
            {/* Punch In */}
            {hasNotStarted && (
              <button
                onClick={() => handle('punch-in')}
                disabled={acting}
                className="w-full py-5 rounded-2xl bg-success text-white text-btn font-bold text-xl shadow-lg active:scale-95 transition-transform disabled:opacity-50"
              >
                {acting ? '処理中...' : '出勤'}
              </button>
            )}

            {/* Break Start */}
            {isPunchedIn && (
              <button
                onClick={() => handle('break-start')}
                disabled={acting}
                className="w-full py-4 rounded-2xl bg-warning text-white text-btn font-bold text-lg shadow active:scale-95 transition-transform disabled:opacity-50"
              >
                {acting ? '処理中...' : '休憩開始'}
              </button>
            )}

            {/* Break End */}
            {isOnBreak && (
              <button
                onClick={() => handle('break-end')}
                disabled={acting}
                className="w-full py-4 rounded-2xl bg-warning text-white text-btn font-bold text-lg shadow active:scale-95 transition-transform disabled:opacity-50"
              >
                {acting ? '処理中...' : '休憩終了'}
              </button>
            )}

            {/* Punch Out */}
            {(isPunchedIn || isOnBreak) && (
              <button
                onClick={() => handle('punch-out')}
                disabled={acting || isOnBreak}
                className="w-full py-4 rounded-2xl bg-danger text-white text-btn font-bold text-lg shadow active:scale-95 transition-transform disabled:opacity-50"
              >
                {acting ? '処理中...' : '退勤'}
              </button>
            )}

            {isPunchedOut && (
              <div className="w-full py-5 rounded-2xl bg-gray-100 text-center">
                <p className="text-subtext font-medium">本日の打刻は完了しています</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
