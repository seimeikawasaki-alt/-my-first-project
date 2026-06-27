import { useState, useEffect, useCallback } from 'react';
import { getMyShifts } from '../../api/shifts';
import { getShiftTypes } from '../../api/shiftTypes';
import type { Shift, ShiftType } from '../../types';

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function MyShiftsPage() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

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

  // Calendar grid setup
  const firstDay = new Date(year, month - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate();

  // Build calendar cells: leading empty + days
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Pad to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const selectedShift = selectedDate ? shiftByDate.get(selectedDate) ?? null : null;
  const selectedType = selectedShift?.shiftTypeId ? typeMap.get(selectedShift.shiftTypeId) : null;

  // Monthly summary
  const workDays = shifts.length;
  const nightDays = shifts.filter(s => {
    const t = s.shiftTypeId ? typeMap.get(s.shiftTypeId) : null;
    return t?.isOvernight;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <button onClick={prevMonth} className="p-2 text-subtext hover:text-text text-lg">←</button>
          <h1 className="text-card-title font-bold text-text">{year}年{month}月 シフト</h1>
          <button onClick={nextMonth} className="p-2 text-subtext hover:text-text text-lg">→</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-3 py-4">
        {/* Legend */}
        <div className="flex flex-wrap gap-2 mb-3">
          {shiftTypes.filter(t => t.isActive).map(t => (
            <span
              key={t.id}
              className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full text-white font-medium"
              style={{ backgroundColor: t.color ?? '#94A3B8' }}
            >
              {t.name}
            </span>
          ))}
        </div>

        {loading ? (
          <p className="text-center text-subtext py-12">読み込み中...</p>
        ) : (
          <>
            {/* Calendar grid */}
            <div className="bg-white rounded-xl border border-border overflow-hidden mb-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 border-b border-border">
                {WEEKDAY_JA.map((d, i) => (
                  <div
                    key={i}
                    className={`py-2 text-center text-xs font-medium ${
                      i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-subtext'
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar cells */}
              <div className="grid grid-cols-7">
                {cells.map((day, idx) => {
                  if (day === null) {
                    return <div key={`empty-${idx}`} className="h-16 border-b border-r border-border last:border-r-0 bg-gray-50" />;
                  }

                  const dateStr = `${year}-${pad(month)}-${pad(day)}`;
                  const shift = shiftByDate.get(dateStr);
                  const type = shift?.shiftTypeId ? typeMap.get(shift.shiftTypeId) : null;
                  const isToday = dateStr === todayStr;
                  const isSelected = dateStr === selectedDate;
                  const col = idx % 7;
                  const isSun = col === 0;
                  const isSat = col === 6;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                      className={`h-16 border-b border-r border-border last:border-r-0 p-1 flex flex-col items-center transition-colors ${
                        isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Date number */}
                      <span
                        className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-0.5 ${
                          isToday
                            ? 'bg-primary text-white'
                            : isSun
                            ? 'text-danger'
                            : isSat
                            ? 'text-primary'
                            : 'text-text'
                        }`}
                      >
                        {day}
                      </span>
                      {/* Shift badge */}
                      {type ? (
                        <span
                          className="w-full text-center text-white rounded text-xs px-0.5 py-0.5 leading-tight font-medium truncate"
                          style={{ backgroundColor: type.color ?? '#94A3B8', fontSize: '10px' }}
                        >
                          {type.name}
                        </span>
                      ) : shift ? (
                        <span className="w-full text-center bg-gray-200 text-subtext rounded text-xs px-0.5 py-0.5 leading-tight" style={{ fontSize: '10px' }}>
                          シフト
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected date detail */}
            {selectedDate && (
              <div className="bg-white rounded-xl border border-border px-4 py-4 mb-4">
                {(() => {
                  const [sy, sm, sd] = selectedDate.split('-').map(Number);
                  const wd = new Date(sy, sm - 1, sd).getDay();
                  return (
                    <div>
                      <p className="text-sub font-bold text-text mb-2">
                        {sm}月{sd}日（{WEEKDAY_JA[wd]}）
                      </p>
                      {selectedType ? (
                        <div className="flex items-center gap-3">
                          <span
                            className="px-3 py-1.5 rounded-full text-white text-sub font-medium"
                            style={{ backgroundColor: selectedType.color ?? '#94A3B8' }}
                          >
                            {selectedType.name}
                          </span>
                          <span className="text-sub text-subtext">
                            {selectedType.startTime}〜{selectedType.endTime}
                          </span>
                          {selectedShift?.notes && (
                            <span className="text-xs text-subtext">{selectedShift.notes}</span>
                          )}
                        </div>
                      ) : selectedShift ? (
                        <p className="text-sub text-subtext">
                          {selectedShift.startTime
                            ? `${selectedShift.startTime}〜${selectedShift.endTime}`
                            : 'シフトあり'}
                        </p>
                      ) : (
                        <p className="text-sub text-subtext">シフトなし（休日）</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Monthly summary */}
            <div className="bg-white rounded-xl border border-border px-4 py-3">
              <p className="text-xs font-medium text-subtext mb-2">今月のサマリー</p>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-xl font-bold text-primary">{workDays}</p>
                  <p className="text-xs text-subtext">勤務日数</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-text">{daysInMonth - workDays}</p>
                  <p className="text-xs text-subtext">休日</p>
                </div>
                {nightDays > 0 && (
                  <div className="text-center">
                    <p className="text-xl font-bold" style={{ color: '#7C3AED' }}>{nightDays}</p>
                    <p className="text-xs text-subtext">夜勤</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
