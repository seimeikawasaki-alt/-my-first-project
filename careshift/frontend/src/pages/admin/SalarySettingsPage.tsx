import { useState, useEffect, useCallback } from 'react';
import Modal from '../../components/common/Modal';
import {
  getSalaryItems, createSalaryItem, updateSalaryItem, deleteSalaryItem, reorderSalaryItems,
  type SalaryItemInput,
} from '../../api/salaryItems';
import type { SalaryItem, CalcType } from '../../types';

const CALC_TYPE_LABELS: Record<CalcType, string> = {
  AUTO: '自動計算',
  MANUAL: '手動入力',
  FIXED: '固定額',
  HOURLY: '時給連動',
};

const EMPTY_FORM: SalaryItemInput = {
  code: '',
  name: '',
  itemType: 'INCOME',
  calcType: 'MANUAL',
  calcFormula: '',
  isActive: true,
};

export default function SalarySettingsPage() {
  const [items, setItems] = useState<SalaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<SalaryItem | null>(null);
  const [form, setForm] = useState<SalaryItemInput>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSalaryItems();
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setError('');
    setModalOpen(true);
  };

  const openEdit = (item: SalaryItem) => {
    setEditing(item);
    setForm({
      code: item.code ?? '',
      name: item.name,
      itemType: item.itemType,
      calcType: item.calcType,
      calcFormula: item.calcFormula ?? '',
      isActive: item.isActive,
    });
    setError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setError('項目名は必須です'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: SalaryItemInput = {
        ...form,
        code: form.code?.trim() ? form.code.trim() : null,
        calcFormula: form.calcFormula?.trim() ? form.calcFormula.trim() : null,
      };
      if (editing) await updateSalaryItem(editing.id, payload);
      else await createSalaryItem(payload);
      setModalOpen(false);
      load();
    } catch {
      setError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: SalaryItem) => {
    if (!confirm(`「${item.name}」を削除しますか？`)) return;
    try {
      await deleteSalaryItem(item.id);
      load();
    } catch {
      alert('削除に失敗しました');
    }
  };

  const persistOrder = async (ordered: SalaryItem[]) => {
    setItems(ordered);
    try {
      await reorderSalaryItems(ordered.map(i => i.id));
    } catch {
      load(); // revert to server state on failure
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = items.findIndex(i => i.id === dragId);
    const to = items.findIndex(i => i.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">給与項目設定</h1>
          <p className="text-sub text-subtext mt-1">支給・控除項目と計算方式を管理します（ドラッグで並び替え）</p>
        </div>
        <button onClick={openCreate} className="btn-primary">+ 項目を追加</button>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <p className="py-16 text-center text-subtext">読み込み中...</p>
        ) : items.length === 0 ? (
          <p className="py-16 text-center text-subtext">給与項目がありません</p>
        ) : (
          <table className="w-full text-sub">
            <thead className="bg-gray-50 border-b border-border text-left text-subtext">
              <tr>
                <th className="px-4 py-3 w-10"></th>
                <th className="px-4 py-3">区分</th>
                <th className="px-4 py-3">項目名</th>
                <th className="px-4 py-3">計算方式</th>
                <th className="px-4 py-3">設定値</th>
                <th className="px-4 py-3">状態</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, i) => (
                <tr
                  key={item.id}
                  draggable
                  onDragStart={() => setDragId(item.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(item.id)}
                  className={`hover:bg-gray-50 ${dragId === item.id ? 'opacity-40' : ''}`}
                >
                  <td className="px-4 py-3 text-gray-300 cursor-grab select-none">
                    <div className="flex flex-col leading-none">
                      <button onClick={() => move(i, -1)} className="hover:text-text text-xs" aria-label="上へ">▲</button>
                      <button onClick={() => move(i, 1)} className="hover:text-text text-xs" aria-label="下へ">▼</button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.itemType === 'INCOME' ? 'bg-green-100 text-success' : 'bg-red-100 text-danger'}`}>
                      {item.itemType === 'INCOME' ? '支給' : '控除'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-text">
                    {item.name}
                    {item.isDefault && <span className="ml-2 text-xs text-subtext">既定</span>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.calcType === 'AUTO' ? 'bg-blue-100 text-primary' : 'bg-gray-100 text-subtext'}`}>
                      {CALC_TYPE_LABELS[item.calcType]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-subtext">{item.calcFormula || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${item.isActive ? 'bg-green-100 text-success' : 'bg-gray-100 text-subtext'}`}>
                      {item.isActive ? '有効' : '無効'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(item)} className="text-primary hover:underline mr-3">編集</button>
                    <button onClick={() => handleDelete(item)} className="text-danger hover:underline">削除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-xs text-subtext mt-4">
        ※ 自動計算項目はコード（BASIC/OVERTIME/LATE_NIGHT/HOLIDAY/EMPLOYMENT_INSURANCE）で計算内容が決まります。
        雇用保険料は「設定値」に率（例: 0.006）を入力します。
      </p>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? '給与項目を編集' : '給与項目を追加'}>
        <div className="space-y-4">
          {error && <p className="text-danger text-sub">{error}</p>}

          <div>
            <label className="block text-sub font-medium text-text mb-1">項目名 <span className="text-danger">*</span></label>
            <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input w-full" placeholder="例: 通勤手当" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">区分</label>
              <select value={form.itemType} onChange={e => setForm(f => ({ ...f, itemType: e.target.value as 'INCOME' | 'DEDUCTION' }))}
                className="input w-full">
                <option value="INCOME">支給</option>
                <option value="DEDUCTION">控除</option>
              </select>
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">計算方式</label>
              <select value={form.calcType} onChange={e => setForm(f => ({ ...f, calcType: e.target.value as CalcType }))}
                className="input w-full">
                <option value="MANUAL">手動入力</option>
                <option value="AUTO">自動計算</option>
                <option value="FIXED">固定額</option>
                <option value="HOURLY">時給連動</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">コード（自動計算用・任意）</label>
              <input type="text" value={form.code ?? ''} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                className="input w-full" placeholder="例: EMPLOYMENT_INSURANCE" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">設定値（固定額/率）</label>
              <input type="text" value={form.calcFormula ?? ''} onChange={e => setForm(f => ({ ...f, calcFormula: e.target.value }))}
                className="input w-full" placeholder="例: 0.006 または 10000" />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.isActive ?? true} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4" />
            <span className="text-sub text-text">有効</span>
          </label>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary" disabled={saving}>キャンセル</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>{saving ? '保存中...' : '保存'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
