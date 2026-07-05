import { useState, useEffect, useCallback } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { getShiftSwaps, approveSwap, cancelSwap } from '../../api/shiftSwap';
import { getShiftTypes } from '../../api/shiftTypes';
import { staffApi } from '../../api/staff';
import { toast } from '../../stores/toastStore';
import type { ShiftSwapRequest, ShiftType, User } from '../../types';

const STATUS_META: Record<string, { label: string; cls: string }> = {
  OPEN: { label: '募集中', cls: 'bg-yellow-100 text-warning' },
  MATCHED: { label: '応募あり', cls: 'bg-blue-100 text-primary' },
  APPROVED: { label: '承認済', cls: 'bg-green-100 text-success' },
  CANCELLED: { label: '取消', cls: 'bg-gray-100 text-subtext' },
};

const REASON_URGENCY: Record<string, string> = { URGENT: '当日', PLANNED: '事前' };
const TWO_HOURS = 2 * 60 * 60 * 1000;

export default function ShiftSwapPage() {
  const [swaps, setSwaps] = useState<ShiftSwapRequest[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [manualPick, setManualPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [swapRes, typeRes] = await Promise.all([getShiftSwaps(), getShiftTypes()]);
      setSwaps(swapRes.data);
      setShiftTypes(typeRes.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { staffApi.list({ is_active: 'true', per_page: 200 }).then(r => setStaff(r.data.data.filter((u: User) => u.role !== 'ADMIN'))); }, []);

  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));

  const approve = async (id: string, userId: string) => {
    if (!userId) { toast.error('割り当てるスタッフを選択してください'); return; }
    try {
      await approveSwap(id, userId);
      toast.success('交代を承認しました');
      load();
    } catch { toast.error('承認に失敗しました'); }
  };

  const cancel = async (id: string) => {
    if (!confirm('この交代リクエストを取り消しますか？')) return;
    try { await cancelSwap(id); toast.success('取り消しました'); load(); } catch { toast.error('取消に失敗しました'); }
  };

  const shiftLabel = (s: ShiftSwapRequest) => {
    const st = s.shift?.shiftTypeId ? typeMap.get(s.shift.shiftTypeId) : null;
    const d = s.shift ? new Date(s.shift.shiftDate) : null;
    const date = d ? `${d.getUTCMonth() + 1}/${d.getUTCDate()}` : '—';
    return `${date} ${st?.name ?? 'シフト'}`;
  };

  const isStranded = (s: ShiftSwapRequest) =>
    s.status === 'OPEN' && s.urgency === 'URGENT' && (Date.now() - new Date(s.createdAt).getTime() > TWO_HOURS)
    && (s.responses?.length ?? 0) === 0;

  return (
    <div className="p-8">
      <h1 className="text-heading font-bold text-text mb-6">シフト交代</h1>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="py-16"><LoadingSpinner /></div>
          : swaps.length === 0 ? <EmptyState icon="🔄" title="交代リクエストはありません" />
          : (
            <div className="divide-y divide-border">
              {swaps.map(s => {
                const meta = STATUS_META[s.status] ?? { label: s.status, cls: 'bg-gray-100 text-subtext' };
                const stranded = isStranded(s);
                return (
                  <div key={s.id} className={`p-5 ${stranded ? 'bg-red-50' : ''}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-text">{shiftLabel(s)}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                        <span className="text-xs text-subtext">{REASON_URGENCY[s.urgency] ?? s.urgency}</span>
                        {stranded && <span className="text-xs font-bold text-danger">🔴 代理が見つかっていません</span>}
                      </div>
                      {s.status !== 'APPROVED' && s.status !== 'CANCELLED' && (
                        <button onClick={() => cancel(s.id)} className="text-danger text-sub hover:underline">取消</button>
                      )}
                    </div>
                    <p className="text-sub text-subtext mb-2">元スタッフ: <span className="text-text font-medium">{s.originalName}</span> ／ 理由: {s.reason}</p>

                    {s.status === 'APPROVED' ? (
                      <p className="text-sub text-success">承認済み（代理: {staff.find(u => u.id === s.replacementUserId) ? `${staff.find(u => u.id === s.replacementUserId)!.lastName} ${staff.find(u => u.id === s.replacementUserId)!.firstName}` : '—'}）</p>
                    ) : s.status === 'CANCELLED' ? null : (
                      <div className="space-y-2">
                        {(s.responses ?? []).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {s.responses!.map(r => (
                              <button key={r.id} onClick={() => approve(s.id, r.userId)} className="btn-primary text-xs py-1.5 px-3">
                                {r.name} を承認
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-subtext">応募者はまだいません</p>
                        )}
                        {/* 手動割当 */}
                        <div className="flex items-center gap-2">
                          <select
                            value={manualPick[s.id] ?? ''}
                            onChange={e => setManualPick(m => ({ ...m, [s.id]: e.target.value }))}
                            className="input py-1.5 text-sub w-48"
                          >
                            <option value="">手動で別スタッフを割当…</option>
                            {staff.filter(u => u.id !== s.originalUserId).map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
                          </select>
                          <button onClick={() => approve(s.id, manualPick[s.id] ?? '')} className="btn-secondary text-xs py-1.5 px-3">割当</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </div>
  );
}
