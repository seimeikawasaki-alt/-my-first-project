import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import {
  getRetiredStaff, processOnboarding, processOffboarding,
  getOffboardingChecklist, updateChecklistItem,
} from '../../api/lifecycle';
import { staffApi } from '../../api/staff';
import { toast } from '../../stores/toastStore';
import type { RetiredStaffRow, OffboardingChecklistItem, User } from '../../types';

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP') : '—');
const today = () => new Date().toISOString().slice(0, 10);

export default function LifecyclePage() {
  const [tab, setTab] = useState<'active' | 'retired'>('active');
  const [staff, setStaff] = useState<User[]>([]);
  const [retired, setRetired] = useState<RetiredStaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');

  const [onboardModal, setOnboardModal] = useState(false);
  const [onboardForm, setOnboardForm] = useState({ userId: '', eventDate: today(), notes: '' });

  const [offboardModal, setOffboardModal] = useState(false);
  const [offboardForm, setOffboardForm] = useState({ userId: '', retirementDate: today(), notes: '' });

  const [checklistUser, setChecklistUser] = useState<RetiredStaffRow | null>(null);
  const [checklist, setChecklist] = useState<OffboardingChecklistItem[]>([]);

  const loadStaff = useCallback(async () => {
    const r = await staffApi.list({ is_active: 'true', per_page: 200 });
    setStaff(r.data.data.filter((u: User) => u.role !== 'ADMIN'));
  }, []);
  const loadRetired = useCallback(async () => {
    const r = await getRetiredStaff();
    setRetired(r.data);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadStaff(), loadRetired()]).finally(() => setLoading(false));
  }, [loadStaff, loadRetired]);

  const submitOnboard = async () => {
    if (!onboardForm.userId) { toast.error('スタッフを選択してください'); return; }
    setBusy(true);
    try {
      await processOnboarding({ userId: onboardForm.userId, eventDate: onboardForm.eventDate, notes: onboardForm.notes || null });
      toast.success('入社処理を記録しました');
      setOnboardModal(false);
      loadStaff();
    } catch { toast.error('処理に失敗しました'); }
    finally { setBusy(false); }
  };

  const submitOffboard = async () => {
    if (!offboardForm.userId) { toast.error('スタッフを選択してください'); return; }
    const u = staff.find(s => s.id === offboardForm.userId);
    if (!confirm(`${u?.lastName ?? ''} ${u?.firstName ?? ''} を退職処理します。\n\n・退職日以降の未来シフトは削除されます\n・アカウントは無効化されます（過去の勤怠・給与は5年間保存されます）\n\n実行しますか？`)) return;
    setBusy(true);
    try {
      const res = await processOffboarding({ userId: offboardForm.userId, retirementDate: offboardForm.retirementDate, notes: offboardForm.notes || null });
      const d = res.data;
      toast.success(`退職処理を完了しました（未来シフト${d.deletedFutureShifts}件を削除 / データ保存期限 ${fmtDate(d.dataRetentionUntil)}）`);
      setOffboardModal(false);
      Promise.all([loadStaff(), loadRetired()]);
      setTab('retired');
    } catch { toast.error('処理に失敗しました'); }
    finally { setBusy(false); }
  };

  const openChecklist = async (row: RetiredStaffRow) => {
    setChecklistUser(row);
    try { const r = await getOffboardingChecklist(row.userId); setChecklist(r.data); }
    catch { setChecklist([]); }
  };

  const toggleItem = async (item: OffboardingChecklistItem) => {
    try {
      const r = await updateChecklistItem(item.id, !item.isDone);
      setChecklist(cs => cs.map(c => c.id === item.id ? r.data : c));
      loadRetired();
    } catch { toast.error('更新に失敗しました'); }
  };

  const visibleStaff = staff
    .filter(u => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${u.lastName}${u.firstName}${u.lastNameKana ?? ''}${u.firstNameKana ?? ''}`.toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => `${a.lastNameKana ?? ''}${a.firstNameKana ?? ''}`.localeCompare(`${b.lastNameKana ?? ''}${b.firstNameKana ?? ''}`, 'ja'));

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">入退社管理</h1>
          <p className="text-sub text-subtext mt-1">入社・退職の手続きと退職者データの管理を行います</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setOnboardForm({ userId: staff[0]?.id ?? '', eventDate: today(), notes: '' }); setOnboardModal(true); }} className="btn-secondary">入社処理</button>
          <button onClick={() => { setOffboardForm({ userId: staff[0]?.id ?? '', retirementDate: today(), notes: '' }); setOffboardModal(true); }} className="btn-primary">退職処理</button>
        </div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-border">
        <button onClick={() => setTab('active')} className={`px-4 py-2 text-sub font-medium border-b-2 ${tab === 'active' ? 'border-primary text-primary' : 'border-transparent text-subtext'}`}>在籍スタッフ（{staff.length}）</button>
        <button onClick={() => setTab('retired')} className={`px-4 py-2 text-sub font-medium border-b-2 ${tab === 'retired' ? 'border-primary text-primary' : 'border-transparent text-subtext'}`}>退職者（{retired.length}）</button>
      </div>

      {loading ? <div className="py-16"><LoadingSpinner /></div> : tab === 'active' ? (
        <>
          <div className="mb-4"><input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="スタッフ名で検索" className="form-input w-full sm:w-80" /></div>
          <div className="card p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sub">
                <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                  <tr>
                    <th className="px-6 py-3">氏名</th>
                    <th className="px-6 py-3">スタッフコード</th>
                    <th className="px-6 py-3">雇用形態</th>
                    <th className="px-6 py-3">入社日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleStaff.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-text">{u.lastName} {u.firstName}</td>
                      <td className="px-6 py-3 text-subtext">{u.userCode}</td>
                      <td className="px-6 py-3">{u.employmentType === 'FULL_TIME' ? '正社員' : u.employmentType === 'PART_TIME' ? 'パート' : '契約'}</td>
                      <td className="px-6 py-3 text-subtext">{fmtDate(u.hireDate ?? null)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="card p-0 overflow-hidden">
          {retired.length === 0 ? <EmptyState icon="🚪" title="退職者はいません" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sub">
                  <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                    <tr>
                      <th className="px-6 py-3">氏名</th>
                      <th className="px-6 py-3">入社日</th>
                      <th className="px-6 py-3">退職日</th>
                      <th className="px-6 py-3">データ保存期限</th>
                      <th className="px-6 py-3">退職手続き</th>
                      <th className="px-6 py-3 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {retired.map(r => (
                      <tr key={r.userId} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-text">{r.name}</td>
                        <td className="px-6 py-3 text-subtext">{fmtDate(r.hireDate)}</td>
                        <td className="px-6 py-3 text-subtext">{fmtDate(r.retiredAt)}</td>
                        <td className="px-6 py-3 text-subtext">{fmtDate(r.dataRetentionUntil)}</td>
                        <td className="px-6 py-3">
                          {r.checklistTotal > 0
                            ? <span className={r.checklistDone === r.checklistTotal ? 'text-success' : 'text-warning'}>{r.checklistDone}/{r.checklistTotal} 完了</span>
                            : '—'}
                        </td>
                        <td className="px-6 py-3 text-right"><button onClick={() => openChecklist(r)} className="text-primary hover:underline">手続き確認</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          <p className="px-6 py-3 text-xs text-subtext border-t border-border">
            退職者のアカウントは無効化（論理削除）されています。過去の勤怠・給与データは労働基準法の記録保存義務のため、データ保存期限まで保持されます。
          </p>
        </div>
      )}

      <Modal isOpen={onboardModal} onClose={() => setOnboardModal(false)} title="入社処理">
        <div className="space-y-4">
          <div>
            <label className="form-label">スタッフ</label>
            <select value={onboardForm.userId} onChange={e => setOnboardForm(f => ({ ...f, userId: e.target.value }))} className="form-input">
              <option value="">選択してください</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
            </select>
          </div>
          <div><label className="form-label">入社日</label><input type="date" value={onboardForm.eventDate} onChange={e => setOnboardForm(f => ({ ...f, eventDate: e.target.value }))} className="form-input" /></div>
          <div><label className="form-label">備考（任意）</label><input type="text" value={onboardForm.notes} onChange={e => setOnboardForm(f => ({ ...f, notes: e.target.value }))} className="form-input" /></div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setOnboardModal(false)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={submitOnboard} className="btn-primary" disabled={busy}>{busy ? '処理中...' : '記録する'}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={offboardModal} onClose={() => setOffboardModal(false)} title="退職処理">
        <div className="space-y-4">
          <div className="card bg-yellow-50 border-warning/40 p-3 text-xs text-text">
            退職処理を行うと、退職日以降の未来シフトが削除され、アカウントが無効化されます。
            過去の勤怠・給与データは削除されず、退職日から5年間保存されます。
          </div>
          <div>
            <label className="form-label">スタッフ</label>
            <select value={offboardForm.userId} onChange={e => setOffboardForm(f => ({ ...f, userId: e.target.value }))} className="form-input">
              <option value="">選択してください</option>
              {staff.map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
            </select>
          </div>
          <div><label className="form-label">退職日</label><input type="date" value={offboardForm.retirementDate} onChange={e => setOffboardForm(f => ({ ...f, retirementDate: e.target.value }))} className="form-input" /></div>
          <div><label className="form-label">備考（任意）</label><input type="text" value={offboardForm.notes} onChange={e => setOffboardForm(f => ({ ...f, notes: e.target.value }))} className="form-input" /></div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setOffboardModal(false)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={submitOffboard} className="btn-primary" disabled={busy}>{busy ? '処理中...' : '退職処理を実行'}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={checklistUser !== null} onClose={() => setChecklistUser(null)} title={`退職手続きチェックリスト${checklistUser ? '：' + checklistUser.name : ''}`}>
        <div className="space-y-2">
          {checklist.length === 0 ? <p className="text-subtext text-sub py-4">チェックリスト項目がありません</p>
            : checklist.map(item => (
              <label key={item.id} className="flex items-center gap-3 py-2 px-3 rounded hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={item.isDone} onChange={() => toggleItem(item)} className="w-4 h-4" />
                <span className={item.isDone ? 'line-through text-subtext' : 'text-text'}>{item.label}</span>
                {item.isDone && item.doneAt && <span className="ml-auto text-xs text-subtext">{fmtDate(item.doneAt)}</span>}
              </label>
            ))}
          <div className="flex justify-end pt-3"><button onClick={() => setChecklistUser(null)} className="btn-secondary">閉じる</button></div>
        </div>
      </Modal>
    </div>
  );
}
