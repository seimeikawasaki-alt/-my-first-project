import { useState, useEffect, useCallback } from 'react';
import { getMyShifts } from '../../api/shifts';
import { getShiftTypes } from '../../api/shiftTypes';
import type { Shift, ShiftType } from '../../types';

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function MyShiftsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [shiftsRes, typesRes] = await Promise.all([
        getMyShifts({ year, month }),
        getShiftTypes(),
      ]);
      setShifts(shiftsRes.data);
      setShiftTypes(typesRes.data);
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

  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));
  const shiftByDate = new Map(shifts.map(s => {
    const d = new Date(s.shiftDate);
    return [`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, s];
  }));

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={prevMonth} className="p-2 text-subtext hover:text-text">←</button>
          <h1 className="text-card-title font-bold text-text">{year}年{month}月 シフト</h1>
          <button onClick={nextMonth} className="p-2 text-subtext hover:text-text">→</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <p className="text-center text-subtext py-12">読み込み中...</p>
        ) : (
          <div className="space-y-2">
            {days.map(d => {
              const dateStr = `${year}-${pad(month)}-${pad(d)}`;
              const date = new Date(year, month - 1, d);
              const wd = date.getDay();
              const shift = shiftByDate.get(dateStr);
              const type = shift?.shiftTypeId ? typeMap.get(shift.shiftTypeId) : null;
              const isSun = wd === 0;
              const isSat = wd === 6;
              const isToday = dateStr === `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

              return (
                <div
                  key={d}
                  className={`flex items-center gap-4 px-4 py-3 rounded-xl bg-white border ${isToday ? 'border-primary' : 'border-border'}`}
                >
                  <div className={`w-12 text-center ${isToday ? 'font-bold text-primary' : isSun ? 'text-danger' : isSat ? 'text-primary' : 'text-text'}`}>
                    <div className="text-lg font-bold">{d}</div>
                    <div className="text-xs text-subtext">{WEEKDAY_JA[wd]}</div>
                  </div>
                  <div className="flex-1">
                    {type ? (
                      <div className="flex items-center gap-2">
                        <span
                          className="px-3 py-1.5 rounded-full text-white text-sub font-medium"
                          style={{ backgroundColor: type.color ?? '#94A3B8' }}
                        >
                          {type.name}
                        </span>
                        <span className="text-sub text-subtext">
                          {type.startTime}〜{type.endTime}
                        </span>
                      </div>
                    ) : shift ? (
                      <span className="text-sub text-subtext">
                        {shift.startTime ? `${shift.startTime}〜${shift.endTime}` : 'シフトあり'}
                      </span>
                    ) : (
                      <span className="text-sub text-subtext">—</span>
                    )}
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
