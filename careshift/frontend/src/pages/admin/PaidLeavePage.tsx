import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { getPaidLeaveSummary, grantPaidLeave } from '../../api/paidLeave';
import { staffApi } from '../../api/staff';
import { toast } from '../../stores/toastStore';
import type { PaidLeaveSummaryRow, User } from '../../types';

function complianceBadge(row: PaidLeaveSummaryRow): { label: string; cls: string } {
  const c = row.compliance;
  if (!c.required) return { label: '対象外', cls: 'bg-gray-100 text-subtext' };
  if (c.remainingRequired <= 0) return { label: '✅達成済', cls: 'bg-green-100 text-success' };
  if (c.riskLevel === 'CRITICAL') return { label: '🔴未達成', cls: 'bg-red-100 text-danger' };
  if (c.riskLevel === 'WARNING') return { label: '🟡要注意', cls: 'bg-yellow-100 text-warning' };
  return { label: `あと${c.remainingRequired}日`, cls: 'bg-blue-100 text-primary' };
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP') : '—');

export default function PaidLeavePage() {
  const [rows, setRows] = useState<PaidLeaveSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [staff, setStaff] = useState<User[]>([]);
  const [grantModal, setGrantModal] = useState(false);
  const [grantForm, setGrantForm] = useState({ userId: '', days: 10 });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPaidLeaveSummary();
      setRows(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { staffApi.list({ is_active: 'true', per_page: 200 }).then(r => setStaff(r.data.data.filter((u: User) => u.role !== 'ADMIN'))); }, []);

  const handleAutoGrant = async () => {
    if (!confirm('入社6ヶ月以上・当年度未付与のスタッフに法定日数を自動付与しますか？')) return;
    setBusy(true);
    try {
      const res = await grantPaidLeave({ auto: true });
      const count = (res.data as { grantedCount?: number }).grantedCount ?? 0;
      toast.success(`${count}名に付与しました`);
      load();
    } catch { toast.error('付与に失敗しました'); }
    finally { setBusy(false); }
  };

  const handleManualGrant = async () => {
    if (!grantForm.userId || grantForm.days <= 0) { toast.error('スタッフと日数を入力してください'); return; }
    setBusy(true);
    try {
      await grantPaidLeave({ userId: grantForm.userId, days: grantForm.days });
      toast.success('付与しました');
      setGrantModal(false);
      load();
    } catch { toast.error('付与に失敗しました'); }
    finally { setBusy(false); }
  };

  const exportCsv = () => {
    const header = '氏名,付与日数,取得済,残日数,年5日消化,期限';
    const lines = rows.map(r => [r.name, r.grantedDays, r.usedDays, r.remainingDays, complianceBadge(r).label.replace(/[🔴🟡✅]/g, ''), fmtDate(r.expiryDate)].join(','));
    const csv = '﻿' + [header, ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'paid_leave.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">有給休暇管理</h1>
          <p className="text-sub text-subtext mt-1">年5日取得義務の達成状況（🔴未達成 / 🟡要注意 / ✅達成済）</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCsv} className="btn-secondary">CSV出力</button>
          <button onClick={handleAutoGrant} disabled={busy} className="btn-secondary">自動付与（一括）</button>
          <button onClick={() => { setGrantForm({ userId: staff[0]?.id ?? '', days: 10 }); setGrantModal(true); }} className="btn-primary">有給を手動付与</button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="py-16"><LoadingSpinner /></div>
          : rows.length === 0 ? <EmptyState icon="🏖" title="有給付与データがありません" description="「自動付与」で法定日数を付与できます" />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sub">
                <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                  <tr>
                    <th className="px-6 py-3">氏名</th>
                    <th className="px-6 py-3 text-right">付与日数</th>
                    <th className="px-6 py-3 text-right">取得済</th>
                    <th className="px-6 py-3 text-right">残日数</th>
                    <th className="px-6 py-3">年5日消化</th>
                    <th className="px-6 py-3">期限</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(r => {
                    const b = complianceBadge(r);
                    return (
                      <tr key={r.userId} className={`hover:bg-gray-50 ${b.label === '🔴未達成' ? 'bg-red-50' : ''}`}>
                        <td className="px-6 py-3 font-medium text-text">{r.name}</td>
                        <td className="px-6 py-3 text-right">{r.grantedDays}日</td>
                        <td className="px-6 py-3 text-right">{r.usedDays}日</td>
                        <td className="px-6 py-3 text-right font-semibold text-text">{r.remainingDays}日</td>
                        <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.cls}`}>{b.label}</span></td>
                        <td className="px-6 py-3 text-subtext">{fmtDate(r.expiryDate)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
      </div>

      <Modal isOpen={grantModal} onClose={() => setGrantModal(false)} title="有給を手動付与">
        <div className="space-y-4">
          <div>
            <label className="form-label">スタッフ</label>
            <select value={grantForm.userId} onChange={e => setGrantForm(f => ({ ...f, userId: e.target.value }))} className="form-input">
              <option value="">選択してください</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">付与日数</label>
            <input type="number" min={0.5} step={0.5} value={grantForm.days} onChange={e => setGrantForm(f => ({ ...f, days: parseFloat(e.target.value) || 0 }))} className="form-input w-32" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setGrantModal(false)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={handleManualGrant} className="btn-primary" disabled={busy}>{busy ? '付与中...' : '付与する'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
