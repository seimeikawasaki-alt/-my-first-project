import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import { getMyPaidLeave, usePaidLeave } from '../../api/paidLeave';
import { toast } from '../../stores/toastStore';
import type { PaidLeaveBalance } from '../../types';

const STATUS_LABELS: Record<string, string> = { PENDING: '申請中', APPROVED: '承認済み', REJECTED: '却下' };
const STATUS_CLS: Record<string, string> = { PENDING: 'bg-yellow-100 text-warning', APPROVED: 'bg-green-100 text-success', REJECTED: 'bg-red-100 text-danger' };

export default function PaidLeavePage() {
  const [data, setData] = useState<PaidLeaveBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ usedDate: '', days: 1, reason: '' });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await getMyPaidLeave(); setData(res.data); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!form.usedDate) { toast.error('日付を選択してください'); return; }
    setBusy(true);
    try {
      await usePaidLeave({ usedDate: form.usedDate, days: form.days, reason: form.reason || null });
      toast.success('有給を申請しました');
      setShowForm(false);
      setForm({ usedDate: '', days: 1, reason: '' });
      load();
    } catch (e) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      toast.error(msg ?? '申請に失敗しました');
    } finally { setBusy(false); }
  };

  const fmt = (iso: string) => { const d = new Date(iso); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`; };
  const c = data?.compliance;

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-card-title font-bold text-text">有給休暇</h1>
          <button onClick={() => setShowForm(true)} className="btn-primary text-sub py-2">+ 有給を申請</button>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? <p className="text-center text-subtext py-12">読み込み中...</p> : (
          <>
            {/* Balance */}
            <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white p-6 mb-4 text-center shadow-sm">
              <p className="text-xs opacity-90">現在の有給残日数</p>
              <p className="text-4xl font-bold mt-1">{data?.remainingDays ?? 0}<span className="text-lg font-normal ml-1">日</span></p>
            </div>

            {/* Compliance notice */}
            {c?.required && c.remainingRequired > 0 && (
              <div className={`rounded-xl px-4 py-3 mb-4 text-sub ${c.riskLevel === 'CRITICAL' ? 'bg-red-50 border border-red-200 text-danger' : c.riskLevel === 'WARNING' ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-blue-50 border border-blue-100 text-primary'}`}>
                年5日の取得義務まであと <span className="font-bold">{c.remainingRequired}日</span>（期限まで{c.daysUntilDeadline}日）
              </div>
            )}

            {/* History */}
            <h2 className="text-sub font-bold text-subtext mb-2">取得履歴</h2>
            {(data?.usages.length ?? 0) === 0 ? (
              <p className="text-center text-subtext text-sub py-8">取得履歴がありません</p>
            ) : (
              <div className="space-y-2">
                {data!.usages.map(u => (
                  <div key={u.id} className="bg-white rounded-xl border border-border px-4 py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sub font-medium text-text">{fmt(u.usedDate)}　{u.days === 0.5 ? '半休' : '全日'}</p>
                      {u.reason && <p className="text-xs text-subtext">{u.reason}</p>}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLS[u.status]}`}>{STATUS_LABELS[u.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title="有給を申請">
        <div className="space-y-4">
          <div>
            <label className="form-label">取得日 <span className="text-danger">*</span></label>
            <input type="date" value={form.usedDate} onChange={e => setForm(f => ({ ...f, usedDate: e.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">区分</label>
            <div className="flex gap-2">
              {[{ v: 1, l: '全休（1日）' }, { v: 0.5, l: '半休（0.5日）' }].map(o => (
                <button key={o.v} onClick={() => setForm(f => ({ ...f, days: o.v }))}
                  className={`flex-1 py-2 rounded-lg border text-sub ${form.days === o.v ? 'border-primary bg-blue-50 text-primary font-medium' : 'border-border text-subtext'}`}>
                  {o.l}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="form-label">理由（任意）</label>
            <input type="text" value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} className="form-input" placeholder="私用のため 等" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={submit} className="btn-primary" disabled={busy}>{busy ? '申請中...' : '申請する'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
