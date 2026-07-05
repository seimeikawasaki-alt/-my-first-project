import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import {
  getQualifications, createQualification, getStaffQualifications,
  assignQualification, deleteStaffQualification,
} from '../../api/qualifications';
import { staffApi } from '../../api/staff';
import { toast } from '../../stores/toastStore';
import type { Qualification, StaffQualificationRow, User } from '../../types';

const EXPIRY_META: Record<string, { label: string; cls: string }> = {
  VALID: { label: '有効', cls: 'bg-green-100 text-success' },
  EXPIRING_SOON: { label: '🟡 期限間近', cls: 'bg-yellow-100 text-warning' },
  EXPIRED: { label: '🔴 期限切れ', cls: 'bg-red-100 text-danger' },
  NO_EXPIRY: { label: '無期限', cls: 'bg-gray-100 text-subtext' },
};

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('ja-JP') : '—');
const today = () => new Date().toISOString().slice(0, 10);

export default function QualificationsPage() {
  const [tab, setTab] = useState<'records' | 'master'>('records');
  const [masters, setMasters] = useState<Qualification[]>([]);
  const [records, setRecords] = useState<StaffQualificationRow[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const [assignModal, setAssignModal] = useState(false);
  const [assignForm, setAssignForm] = useState({ userId: '', qualificationId: '', acquiredDate: today(), expiryDate: '', certificateNo: '', notes: '' });

  const [masterModal, setMasterModal] = useState(false);
  const [masterForm, setMasterForm] = useState({ name: '', category: 'QUALIFICATION' as 'QUALIFICATION' | 'TRAINING', hasExpiry: true, validMonths: '' as string, description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([getQualifications(), getStaffQualifications()]);
      setMasters(m.data);
      setRecords(r.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { staffApi.list({ is_active: 'true', per_page: 200 }).then(r => setStaff(r.data.data.filter((u: User) => u.role !== 'ADMIN'))); }, []);

  const submitAssign = async () => {
    if (!assignForm.userId || !assignForm.qualificationId || !assignForm.acquiredDate) { toast.error('スタッフ・資格・取得日は必須です'); return; }
    setBusy(true);
    try {
      await assignQualification({
        userId: assignForm.userId,
        qualificationId: assignForm.qualificationId,
        acquiredDate: assignForm.acquiredDate,
        expiryDate: assignForm.expiryDate || null,
        certificateNo: assignForm.certificateNo || null,
        notes: assignForm.notes || null,
      });
      toast.success('登録しました');
      setAssignModal(false);
      load();
    } catch { toast.error('登録に失敗しました'); }
    finally { setBusy(false); }
  };

  const submitMaster = async () => {
    if (!masterForm.name.trim()) { toast.error('名称を入力してください'); return; }
    setBusy(true);
    try {
      await createQualification({
        name: masterForm.name.trim(),
        category: masterForm.category,
        hasExpiry: masterForm.hasExpiry,
        validMonths: masterForm.hasExpiry && masterForm.validMonths ? parseInt(masterForm.validMonths) : null,
        description: masterForm.description || null,
      });
      toast.success('マスタを追加しました');
      setMasterModal(false);
      setMasterForm({ name: '', category: 'QUALIFICATION', hasExpiry: true, validMonths: '', description: '' });
      load();
    } catch { toast.error('追加に失敗しました'); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('この取得記録を削除しますか？')) return;
    try { await deleteStaffQualification(id); toast.success('削除しました'); load(); }
    catch { toast.error('削除に失敗しました'); }
  };

  const visibleRecords = records
    .filter(r => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return `${r.userName}${r.userNameKana}${r.qualificationName}`.toLowerCase().includes(q);
    })
    .slice()
    .sort((a, b) => a.userNameKana.localeCompare(b.userNameKana, 'ja') || a.qualificationName.localeCompare(b.qualificationName, 'ja'));

  const expiringCount = records.filter(r => r.expiryStatus === 'EXPIRED' || r.expiryStatus === 'EXPIRING_SOON').length;

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">資格・研修管理</h1>
          <p className="text-sub text-subtext mt-1">
            資格・研修の取得状況と有効期限を管理します
            {expiringCount > 0 && <span className="ml-2 text-danger font-medium">期限切れ・間近: {expiringCount}件</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'records'
            ? <button onClick={() => { setAssignForm({ userId: staff[0]?.id ?? '', qualificationId: masters[0]?.id ?? '', acquiredDate: today(), expiryDate: '', certificateNo: '', notes: '' }); setAssignModal(true); }} className="btn-primary">＋資格を登録</button>
            : <button onClick={() => setMasterModal(true)} className="btn-primary">＋マスタを追加</button>}
        </div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-border">
        <button onClick={() => setTab('records')} className={`px-4 py-2 text-sub font-medium border-b-2 ${tab === 'records' ? 'border-primary text-primary' : 'border-transparent text-subtext'}`}>取得記録</button>
        <button onClick={() => setTab('master')} className={`px-4 py-2 text-sub font-medium border-b-2 ${tab === 'master' ? 'border-primary text-primary' : 'border-transparent text-subtext'}`}>資格・研修マスタ</button>
      </div>

      {tab === 'records' && (
        <>
          <div className="mb-4">
            <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="スタッフ名・資格名で検索" className="form-input w-full sm:w-96" />
          </div>
          <div className="card p-0 overflow-hidden">
            {loading ? <div className="py-16"><LoadingSpinner /></div>
              : records.length === 0 ? <EmptyState icon="🎓" title="取得記録がありません" description="「資格を登録」から追加できます" />
              : visibleRecords.length === 0 ? <EmptyState icon="🔍" title="該当する記録がありません" />
              : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sub">
                    <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                      <tr>
                        <th className="px-6 py-3">氏名</th>
                        <th className="px-6 py-3">資格・研修</th>
                        <th className="px-6 py-3">取得日</th>
                        <th className="px-6 py-3">有効期限</th>
                        <th className="px-6 py-3">状態</th>
                        <th className="px-6 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {visibleRecords.map(r => {
                        const m = EXPIRY_META[r.expiryStatus] ?? EXPIRY_META.NO_EXPIRY;
                        return (
                          <tr key={r.id} className={`hover:bg-gray-50 ${r.expiryStatus === 'EXPIRED' ? 'bg-red-50' : ''}`}>
                            <td className="px-6 py-3 font-medium text-text">{r.userName}</td>
                            <td className="px-6 py-3">{r.qualificationName} <span className="text-xs text-subtext">{r.category === 'TRAINING' ? '(研修)' : ''}</span></td>
                            <td className="px-6 py-3 text-subtext">{fmtDate(r.acquiredDate)}</td>
                            <td className="px-6 py-3 text-subtext">{fmtDate(r.expiryDate)}{r.daysUntilExpiry != null && r.daysUntilExpiry >= 0 && r.expiryStatus === 'EXPIRING_SOON' && <span className="text-warning text-xs ml-1">(あと{r.daysUntilExpiry}日)</span>}</td>
                            <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span></td>
                            <td className="px-6 py-3 text-right"><button onClick={() => handleDelete(r.id)} className="text-danger hover:underline">削除</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
          </div>
        </>
      )}

      {tab === 'master' && (
        <div className="card p-0 overflow-hidden">
          {loading ? <div className="py-16"><LoadingSpinner /></div>
            : masters.length === 0 ? <EmptyState icon="📚" title="マスタが未登録です" description="「マスタを追加」から資格・研修を登録してください" />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sub">
                  <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                    <tr>
                      <th className="px-6 py-3">名称</th>
                      <th className="px-6 py-3">区分</th>
                      <th className="px-6 py-3">有効期限</th>
                      <th className="px-6 py-3">有効期間</th>
                      <th className="px-6 py-3">状態</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {masters.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-text">{m.name}</td>
                        <td className="px-6 py-3">{m.category === 'TRAINING' ? '研修' : '資格'}</td>
                        <td className="px-6 py-3">{m.hasExpiry ? 'あり' : 'なし'}</td>
                        <td className="px-6 py-3 text-subtext">{m.validMonths ? `${m.validMonths}ヶ月` : '—'}</td>
                        <td className="px-6 py-3">{m.isActive ? '有効' : '無効'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      <Modal isOpen={assignModal} onClose={() => setAssignModal(false)} title="資格・研修を登録" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">スタッフ</label>
              <select value={assignForm.userId} onChange={e => setAssignForm(f => ({ ...f, userId: e.target.value }))} className="form-input">
                <option value="">選択してください</option>
                {staff.map(u => <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">資格・研修</label>
              <select value={assignForm.qualificationId} onChange={e => setAssignForm(f => ({ ...f, qualificationId: e.target.value }))} className="form-input">
                <option value="">選択してください</option>
                {masters.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label">取得日</label>
              <input type="date" value={assignForm.acquiredDate} onChange={e => setAssignForm(f => ({ ...f, acquiredDate: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">有効期限（任意・空欄ならマスタ設定から自動計算）</label>
              <input type="date" value={assignForm.expiryDate} onChange={e => setAssignForm(f => ({ ...f, expiryDate: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">証明書番号（任意）</label>
              <input type="text" value={assignForm.certificateNo} onChange={e => setAssignForm(f => ({ ...f, certificateNo: e.target.value }))} className="form-input" />
            </div>
            <div>
              <label className="form-label">備考（任意）</label>
              <input type="text" value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} className="form-input" />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setAssignModal(false)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={submitAssign} className="btn-primary" disabled={busy}>{busy ? '登録中...' : '登録する'}</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={masterModal} onClose={() => setMasterModal(false)} title="資格・研修マスタを追加">
        <div className="space-y-4">
          <div>
            <label className="form-label">名称</label>
            <input type="text" value={masterForm.name} onChange={e => setMasterForm(f => ({ ...f, name: e.target.value }))} className="form-input" placeholder="介護福祉士 / 認知症介護研修 など" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">区分</label>
              <select value={masterForm.category} onChange={e => setMasterForm(f => ({ ...f, category: e.target.value as 'QUALIFICATION' | 'TRAINING' }))} className="form-input">
                <option value="QUALIFICATION">資格</option>
                <option value="TRAINING">研修</option>
              </select>
            </div>
            <div>
              <label className="form-label">有効期間（月・任意）</label>
              <input type="number" min={1} value={masterForm.validMonths} onChange={e => setMasterForm(f => ({ ...f, validMonths: e.target.value }))} disabled={!masterForm.hasExpiry} className="form-input" placeholder="例: 36" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sub">
            <input type="checkbox" checked={masterForm.hasExpiry} onChange={e => setMasterForm(f => ({ ...f, hasExpiry: e.target.checked }))} />
            有効期限あり
          </label>
          <div>
            <label className="form-label">説明（任意）</label>
            <input type="text" value={masterForm.description} onChange={e => setMasterForm(f => ({ ...f, description: e.target.value }))} className="form-input" />
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => setMasterModal(false)} className="btn-secondary" disabled={busy}>キャンセル</button>
            <button onClick={submitMaster} className="btn-primary" disabled={busy}>{busy ? '追加中...' : '追加する'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
