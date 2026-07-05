import { useState, useEffect } from 'react';
import Modal from '../../components/common/Modal';
import { getShiftTypes, createShiftType, updateShiftType, deleteShiftType } from '../../api/shiftTypes';
import OvertimeConfigCard from '../../components/admin/OvertimeConfigCard';
import type { ShiftType } from '../../types';

const EMPTY_FORM = {
  name: '',
  startTime: '',
  endTime: '',
  breakMinutes: 60,
  color: '#2563EB',
  isOvernight: false,
};

export default function SettingsPage() {
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftType | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const res = await getShiftTypes();
      setShiftTypes(res.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (st: ShiftType) => {
    setEditing(st);
    setForm({
      name: st.name,
      startTime: st.startTime,
      endTime: st.endTime,
      breakMinutes: st.breakMinutes,
      color: st.color ?? '#2563EB',
      isOvernight: st.isOvernight,
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.startTime || !form.endTime) {
      setError('名称・開始時刻・終了時刻は必須です');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (editing) {
        await updateShiftType(editing.id, form);
      } else {
        await createShiftType(form);
      }
      setModalOpen(false);
      load();
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (st: ShiftType) => {
    if (!confirm(`「${st.name}」を削除しますか？`)) return;
    try {
      await deleteShiftType(st.id);
      load();
    } catch {
      alert('削除に失敗しました');
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-heading font-bold text-text">システム設定</h1>
          <p className="text-sub text-subtext mt-1">シフト種別の管理</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          + シフト種別を追加
        </button>
      </div>

      <div className="card">
        <h2 className="text-card-title font-bold text-text mb-4">シフト種別一覧</h2>
        {loading ? (
          <p className="text-sub text-subtext py-8 text-center">読み込み中...</p>
        ) : shiftTypes.length === 0 ? (
          <p className="text-sub text-subtext py-8 text-center">シフト種別がありません</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sub">
              <thead>
                <tr className="border-b border-border text-left text-subtext">
                  <th className="pb-3 pr-4">カラー</th>
                  <th className="pb-3 pr-4">名称</th>
                  <th className="pb-3 pr-4">開始</th>
                  <th className="pb-3 pr-4">終了</th>
                  <th className="pb-3 pr-4">休憩(分)</th>
                  <th className="pb-3 pr-4">深夜跨ぎ</th>
                  <th className="pb-3 pr-4">状態</th>
                  <th className="pb-3"></th>
                </tr>
              </thead>
              <tbody>
                {shiftTypes.map(st => (
                  <tr key={st.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                    <td className="py-3 pr-4">
                      <span
                        className="inline-block w-5 h-5 rounded-full border border-border"
                        style={{ backgroundColor: st.color ?? '#94A3B8' }}
                      />
                    </td>
                    <td className="py-3 pr-4 font-medium text-text">{st.name}</td>
                    <td className="py-3 pr-4">{st.startTime}</td>
                    <td className="py-3 pr-4">{st.endTime}</td>
                    <td className="py-3 pr-4">{st.breakMinutes}</td>
                    <td className="py-3 pr-4">{st.isOvernight ? '✓' : '—'}</td>
                    <td className="py-3 pr-4">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${st.isActive ? 'bg-green-100 text-success' : 'bg-gray-100 text-subtext'}`}>
                        {st.isActive ? '有効' : '無効'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={() => openEdit(st)} className="text-primary hover:underline mr-3">編集</button>
                      <button onClick={() => handleDelete(st)} className="text-danger hover:underline">削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <OvertimeConfigCard />

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'シフト種別を編集' : 'シフト種別を追加'}>
        <div className="space-y-4">
          {error && <p className="text-danger text-sub">{error}</p>}

          <div>
            <label className="block text-sub font-medium text-text mb-1">名称 <span className="text-danger">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input w-full"
              placeholder="例: 日勤"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">開始時刻 <span className="text-danger">*</span></label>
              <input
                type="time"
                value={form.startTime}
                onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                className="input w-full"
              />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">終了時刻 <span className="text-danger">*</span></label>
              <input
                type="time"
                value={form.endTime}
                onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                className="input w-full"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">休憩時間(分)</label>
              <input
                type="number"
                value={form.breakMinutes}
                onChange={e => setForm(f => ({ ...f, breakMinutes: parseInt(e.target.value) || 0 }))}
                className="input w-full"
                min={0}
              />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">カラー</label>
              <input
                type="color"
                value={form.color}
                onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                className="w-full h-10 rounded-lg border border-border cursor-pointer"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isOvernight}
                onChange={e => setForm(f => ({ ...f, isOvernight: e.target.checked }))}
                className="w-4 h-4"
              />
              <span className="text-sub text-text">深夜跨ぎ（翌日終了）</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>
              キャンセル
            </button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
