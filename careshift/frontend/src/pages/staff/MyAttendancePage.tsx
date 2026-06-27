import { useState, useEffect, useCallback } from 'react';
import { getMyAttendances } from '../../api/attendance';
import type { Attendance } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  PUNCHED_IN: '出勤中',
  ON_BREAK: '休憩中',
  PUNCHED_OUT: '退勤済',
  ABSENT: '欠勤',
  PAID_LEAVE: '有給',
  HOLIDAY_WORK: '休日出勤',
};

const STATUS_COLORS: Record<string, string> = {
  PUNCHED_IN: 'bg-green-100 text-success',
  ON_BREAK: 'bg-yellow-100 text-warning',
  PUNCHED_OUT: 'bg-gray-100 text-subtext',
  ABSENT: 'bg-red-100 text-danger',
  PAID_LEAVE: 'bg-blue-100 text-primary',
  HOLIDAY_WORK: 'bg-purple-100 text-purple-600',
};

function pad(n: number) { return String(n).padStart(2, '0'); }

function formatTime(dt: string | null | undefined): string {
  if (!dt) return '—';
  const d = new Date(dt);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function minutesToHM(min: number | null | undefined): string {
  if (min == null || min === 0) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}m` : ''}`;
}

export default function MyAttendancePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [records, setRecords] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyAttendances({ year, month });
      setRecords(res.data);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const totalWork = records.reduce((acc, r) => acc + (r.workMinutes ?? 0), 0);
  const totalOvertime = records.reduce((acc, r) => acc + (r.overtimeMinutes ?? 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={prevMonth} className="p-2 text-subtext hover:text-text">←</button>
          <h1 className="text-card-title font-bold text-text">{year}年{month}月 勤怠履歴</h1>
          <button onClick={nextMonth} className="p-2 text-subtext hover:text-text">→</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-border p-4 text-center">
            <p className="text-sub text-subtext mb-1">実労働時間</p>
            <p className="text-xl font-bold text-text">{minutesToHM(totalWork)}</p>
          </div>
          <div className="bg-white rounded-xl border border-border p-4 text-center">
            <p className="text-sub text-subtext mb-1">残業時間</p>
            <p className="text-xl font-bold text-warning">{minutesToHM(totalOvertime)}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-subtext py-12">読み込み中...</p>
        ) : records.length === 0 ? (
          <p className="text-center text-subtext py-12">記録がありません</p>
        ) : (
          <div className="space-y-2">
            {records.map(r => {
              const d = new Date(r.workDate);
              const dateLabel = `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
              return (
                <div key={r.id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center gap-4">
                  <div className="w-10 text-center">
                    <p className="text-body font-bold text-text">{dateLabel}</p>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sub font-medium text-text">
                        {formatTime(r.punchIn)} 〜 {formatTime(r.punchOut)}
                      </span>
                      {r.status && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-subtext'}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-subtext">
                      {r.workMinutes != null && <span>実働 {minutesToHM(r.workMinutes)}</span>}
                      {(r.overtimeMinutes ?? 0) > 0 && <span className="text-warning">残業 {minutesToHM(r.overtimeMinutes)}</span>}
                      {r.breakStart && r.breakEnd && (
                        <span>休憩 {formatTime(r.breakStart)}〜{formatTime(r.breakEnd)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
