import { useState, useEffect, useCallback } from 'react';
import { getMyShifts } from '../../api/shifts';
import { getShiftTypes } from '../../api/shiftTypes';
import { createShiftSwap } from '../../api/shiftSwap';
import { toast } from '../../stores/toastStore';
import Modal from '../../components/common/Modal';
import type { Shift, ShiftType } from '../../types';

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

function pad(n: number) { return String(n).padStart(2, '0'); }

export default function MyShiftsPage() {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState<string>(() => {
    const d = new Date(now);
    d.setDate(d.getDate() - d.getDay()); // start of current week (Sun)
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [swapShiftId, setSwapShiftId] = useState<string | null>(null);
  const [swapForm, setSwapForm] = useState({ reason: '体調不良', urgency: 'URGENT' as 'URGENT' | 'PLANNED' });
  const [swapBusy, setSwapBusy] = useState(false);

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

  const submitSwap = async () => {
    if (!swapShiftId) return;
    if (!swapForm.reason.trim()) { toast.error('理由を入力してください'); return; }
    setSwapBusy(true);
    try {
      await createShiftSwap({ shiftId: swapShiftId, reason: swapForm.reason, urgency: swapForm.urgency });
      toast.success('交代を申請しました。同グループのスタッフに通知されます');
      setSwapShiftId(null);
      setSwapForm({ reason: '体調不良', urgency: 'URGENT' });
    } catch {
      toast.error('申請に失敗しました');
    } finally {
      setSwapBusy(false);
    }
  };

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const prevWeek = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() - 7);
    setWeekStart(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };
  const nextWeek = () => {
    const d = new Date(weekStart + 'T00:00:00');
    d.setDate(d.getDate() + 7);
    setWeekStart(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));
  const shiftByDate = new Map(shifts.map(s => {
    const d = new Date(s.shiftDate);
    return [`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, s];
  }));

  // --- Month view ---
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // --- Week view ---
  const weekDays: string[] = [];
  const ws = new Date(weekStart + 'T00:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(ws);
    d.setDate(d.getDate() + i);
    weekDays.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  }
  const weekTitle = (() => {
    const end = new Date(ws);
    end.setDate(end.getDate() + 6);
    return `${ws.getMonth() + 1}月${ws.getDate()}日〜${end.getMonth() + 1}月${end.getDate()}日`;
  })();

  // Weekly work hours
  const weekShifts = weekDays.map(dk => shiftByDate.get(dk)).filter(Boolean) as Shift[];
  const weekMinutes = weekShifts.reduce((acc, s) => {
    const t = s.shiftTypeId ? typeMap.get(s.shiftTypeId) : null;
    if (!t) return acc;
    const [sh, sm] = t.startTime.split(':').map(Number);
    const [eh, em] = t.endTime.split(':').map(Number);
    let mins = (eh * 60 + em) - (sh * 60 + sm);
    if (t.isOvernight) mins += 24 * 60;
    return acc + Math.max(0, mins - (t.breakMinutes ?? 0));
  }, 0);
  const weekHours = Math.floor(weekMinutes / 60);
  const weekRemMin = weekMinutes % 60;

  const selectedShift = selectedDate ? shiftByDate.get(selectedDate) ?? null : null;
  const selectedType = selectedShift?.shiftTypeId ? typeMap.get(selectedShift.shiftTypeId) : null;

  // Monthly summary
  const workDays = shifts.length;
  const nightDays = shifts.filter(s => {
    const t = s.shiftTypeId ? typeMap.get(s.shiftTypeId) : null;
    return t?.isNightShift;
  }).length;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          {view === 'month'
            ? <button onClick={prevMonth} className="p-2 text-subtext hover:text-text text-lg">←</button>
            : <button onClick={prevWeek} className="p-2 text-subtext hover:text-text text-lg">←</button>
          }
          <div className="text-center">
            <h1 className="text-card-title font-bold text-text">
              {view === 'month' ? `${year}年${month}月 シフト` : weekTitle}
            </h1>
          </div>
          {view === 'month'
            ? <button onClick={nextMonth} className="p-2 text-subtext hover:text-text text-lg">→</button>
            : <button onClick={nextWeek} className="p-2 text-subtext hover:text-text text-lg">→</button>
          }
        </div>
        {/* View toggle */}
        <div className="flex justify-center mt-2">
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => setView('month')}
              className={`px-4 py-1 rounded-md text-xs font-medium transition-colors ${view === 'month' ? 'bg-white text-primary shadow-sm' : 'text-subtext'}`}
            >
              月
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-4 py-1 rounded-md text-xs font-medium transition-colors ${view === 'week' ? 'bg-white text-primary shadow-sm' : 'text-subtext'}`}
            >
              週
            </button>
          </div>
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
        ) : view === 'month' ? (
          <>
            {/* Month calendar grid */}
            <div className="bg-white rounded-xl border border-border overflow-hidden mb-4">
              <div className="grid grid-cols-7 border-b border-border">
                {WEEKDAY_JA.map((d, i) => (
                  <div key={i} className={`py-2 text-center text-xs font-medium ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-subtext'}`}>
                    {d}
                  </div>
                ))}
              </div>

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
                      className={`h-16 border-b border-r border-border last:border-r-0 p-1 flex flex-col items-center transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-medium mb-0.5 ${isToday ? 'bg-primary text-white' : isSun ? 'text-danger' : isSat ? 'text-primary' : 'text-text'}`}>
                        {day}
                      </span>
                      {type ? (
                        <span className="w-full text-center text-white rounded text-xs px-0.5 py-0.5 leading-tight font-medium truncate" style={{ backgroundColor: type.color ?? '#94A3B8', fontSize: '10px' }}>
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
                      <p className="text-sub font-bold text-text mb-2">{sm}月{sd}日（{WEEKDAY_JA[wd]}）</p>
                      {selectedType ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="px-3 py-1.5 rounded-full text-white text-sub font-medium" style={{ backgroundColor: selectedType.color ?? '#94A3B8' }}>
                            {selectedType.name}
                          </span>
                          <span className="text-sub text-subtext">{selectedType.startTime}〜{selectedType.endTime}</span>
                          {selectedShift?.notes && <span className="text-xs text-subtext">{selectedShift.notes}</span>}
                        </div>
                      ) : selectedShift ? (
                        <p className="text-sub text-subtext">{selectedShift.startTime ? `${selectedShift.startTime}〜${selectedShift.endTime}` : 'シフトあり'}</p>
                      ) : (
                        <p className="text-sub text-subtext">シフトなし（休日）</p>
                      )}
                      {selectedShift && (
                        <button onClick={() => setSwapShiftId(selectedShift.id)} className="btn-secondary mt-3 text-sub py-2">
                          欠勤・交代を申請
                        </button>
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
        ) : (
          <>
            {/* Week view */}
            <div className="bg-white rounded-xl border border-border overflow-hidden mb-4">
              {weekDays.map((dk, i) => {
                const shift = shiftByDate.get(dk);
                const type = shift?.shiftTypeId ? typeMap.get(shift.shiftTypeId) : null;
                const isToday = dk === todayStr;
                const [, , dayNum] = dk.split('-').map(Number);
                const isSun = i === 0;
                const isSat = i === 6;
                return (
                  <div key={dk} className={`flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 ${isToday ? 'bg-blue-50' : ''}`}>
                    <div className="flex flex-col items-center w-10 flex-shrink-0">
                      <span className={`text-xs ${isSun ? 'text-danger' : isSat ? 'text-primary' : 'text-subtext'}`}>{WEEKDAY_JA[i]}</span>
                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold ${isToday ? 'bg-primary text-white' : 'text-text'}`}>
                        {dayNum}
                      </span>
                    </div>
                    <div className="flex-1">
                      {type ? (
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-full text-white text-xs font-medium" style={{ backgroundColor: type.color ?? '#94A3B8' }}>
                            {type.name}
                          </span>
                          <span className="text-xs text-subtext">{type.startTime}〜{type.endTime}</span>
                        </div>
                      ) : shift ? (
                        <span className="text-xs text-subtext">シフトあり</span>
                      ) : (
                        <span className="text-xs text-subtext">休日</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Weekly summary */}
            <div className="bg-white rounded-xl border border-border px-4 py-3">
              <p className="text-xs font-medium text-subtext mb-2">今週のサマリー</p>
              <div className="flex gap-6">
                <div className="text-center">
                  <p className="text-xl font-bold text-primary">{weekShifts.length}</p>
                  <p className="text-xs text-subtext">勤務日数</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-text">{7 - weekShifts.length}</p>
                  <p className="text-xs text-subtext">休日</p>
                </div>
                {weekMinutes > 0 && (
                  <div className="text-center">
                    <p className="text-xl font-bold text-primary">{weekHours}h{weekRemMin > 0 ? `${weekRemMin}m` : ''}</p>
                    <p className="text-xs text-subtext">総勤務時間</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <Modal isOpen={!!swapShiftId} onClose={() => setSwapShiftId(null)} title="欠勤・交代を申請">
        <div className="space-y-4">
          <div>
            <label className="block text-sub font-medium text-text mb-2">理由</label>
            <div className="grid grid-cols-2 gap-2 mb-2">
              {['体調不良', '家庭の事情'].map(r => (
                <button key={r} onClick={() => setSwapForm(f => ({ ...f, reason: r }))}
                  className={`py-2 rounded-lg border text-xs ${swapForm.reason === r ? 'border-primary bg-blue-50 text-primary font-medium' : 'border-border text-subtext'}`}>
                  {r}
                </button>
              ))}
            </div>
            <input type="text" value={swapForm.reason} onChange={e => setSwapForm(f => ({ ...f, reason: e.target.value }))}
              className="input w-full" placeholder="理由を入力" />
          </div>
          <div>
            <label className="block text-sub font-medium text-text mb-2">緊急度</label>
            <div className="flex gap-2">
              {([['URGENT', '当日（今すぐ代わりが必要）'], ['PLANNED', '数日前（余裕あり）']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setSwapForm(f => ({ ...f, urgency: v }))}
                  className={`flex-1 py-2 rounded-lg border text-xs ${swapForm.urgency === v ? 'border-primary bg-blue-50 text-primary font-medium' : 'border-border text-subtext'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <button onClick={submitSwap} disabled={swapBusy} className="w-full btn-primary py-3">
            {swapBusy ? '申請中...' : '申請する'}
          </button>
        </div>
      </Modal>
    </div>
  );
}
