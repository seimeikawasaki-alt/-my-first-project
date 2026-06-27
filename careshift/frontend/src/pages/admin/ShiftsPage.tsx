import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import { getShifts, createShift, updateShift, deleteShift, publishShifts, bulkCopyShifts } from '../../api/shifts';
import { getShiftTypes } from '../../api/shiftTypes';
import { staffApi } from '../../api/staff';
import { groupsApi } from '../../api/groups';
import type { Shift, ShiftType, User, Group } from '../../types';

type CellShift = Shift & { user?: { lastName: string; firstName: string } | null };

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

export default function ShiftsPage() {
  const { year: yearStr, month: monthStr } = useParams<{ year: string; month: string }>();
  const navigate = useNavigate();

  const year = parseInt(yearStr ?? '');
  const month = parseInt(monthStr ?? '');

  const [shifts, setShifts] = useState<CellShift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);

  // Cell modal
  const [cellModal, setCellModal] = useState<{ userId: string; date: string } | null>(null);
  const [cellShift, setCellShift] = useState<CellShift | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [cellSaving, setCellSaving] = useState(false);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const filteredStaff = selectedGroup
    ? staff.filter(u => u.groups?.some(g => g.id === selectedGroup))
    : staff;

  const shiftMap = new Map<string, CellShift>();
  shifts.forEach(s => {
    const d = new Date(s.shiftDate);
    const key = `${s.userId}-${d.getUTCDate()}`;
    shiftMap.set(key, s);
  });

  const load = useCallback(async () => {
    if (isNaN(year) || isNaN(month)) return;
    setLoading(true);
    try {
      const [shiftsRes, typesRes, staffRes, groupsRes] = await Promise.all([
        getShifts({ year, month, groupId: selectedGroup || undefined }),
        getShiftTypes(),
        staffApi.list({ is_active: true }),
        groupsApi.list(),
      ]);
      setShifts(shiftsRes.data);
      setShiftTypes(typesRes.data);
      setStaff(staffRes.data.data.filter(u => u.role !== 'ADMIN'));
      setGroups(groupsRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [year, month, selectedGroup]);

  useEffect(() => { load(); }, [load]);

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    navigate(`/admin/shifts/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    navigate(`/admin/shifts/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const openCell = (userId: string, day: number) => {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const existing = shiftMap.get(`${userId}-${day}`);
    setCellShift(existing ?? null);
    setSelectedTypeId(existing?.shiftTypeId ?? '');
    setCellModal({ userId, date: dateStr });
  };

  const handleCellSave = async () => {
    if (!cellModal) return;
    setCellSaving(true);
    try {
      if (cellShift) {
        if (!selectedTypeId) {
          await deleteShift(cellShift.id);
        } else {
          await updateShift(cellShift.id, { shiftTypeId: selectedTypeId });
        }
      } else if (selectedTypeId) {
        await createShift({ userId: cellModal.userId, shiftTypeId: selectedTypeId, shiftDate: cellModal.date });
      }
      setCellModal(null);
      load();
    } finally {
      setCellSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!confirm('このページのシフトを公開しますか？')) return;
    setPublishing(true);
    try {
      const res = await publishShifts({ year, month, groupId: selectedGroup || undefined });
      alert(`${res.data.publishedCount}件のシフトを公開しました`);
      load();
    } catch {
      alert('公開に失敗しました');
    } finally {
      setPublishing(false);
    }
  };

  const handleCopy = async () => {
    const prev = month === 1 ? `${year - 1}年12月` : `${year}年${month - 1}月`;
    if (!confirm(`${prev}のシフトをコピーしますか？`)) return;
    setCopying(true);
    try {
      const res = await bulkCopyShifts({ year, month, groupId: selectedGroup || undefined });
      alert(`${res.data.copiedCount}件のシフトをコピーしました`);
      load();
    } catch {
      alert('コピーに失敗しました');
    } finally {
      setCopying(false);
    }
  };

  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="btn-secondary px-3">←</button>
          <h1 className="text-heading font-bold text-text">
            {year}年{month}月 シフト管理
          </h1>
          <button onClick={nextMonth} className="btn-secondary px-3">→</button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value)}
            className="input py-2 text-sub"
          >
            <option value="">全グループ</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={handleCopy} disabled={copying} className="btn-secondary">
            {copying ? 'コピー中...' : '前月からコピー'}
          </button>
          <button onClick={handlePublish} disabled={publishing} className="btn-primary">
            {publishing ? '公開中...' : 'シフトを公開'}
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {shiftTypes.filter(t => t.isActive).map(t => (
          <span key={t.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white font-medium"
            style={{ backgroundColor: t.color ?? '#94A3B8' }}>
            {t.name}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-200 text-subtext">未設定</span>
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-center text-subtext py-12">読み込み中...</p>
      ) : (
        <div className="overflow-auto border border-border rounded-lg bg-white">
          <table className="text-xs border-collapse" style={{ minWidth: `${64 + daysInMonth * 44}px` }}>
            <thead>
              <tr className="bg-gray-50 border-b border-border">
                <th className="sticky left-0 bg-gray-50 px-3 py-2 text-left font-medium text-subtext border-r border-border w-16 min-w-16">
                  スタッフ
                </th>
                {days.map(d => {
                  const date = new Date(year, month - 1, d);
                  const wd = date.getDay();
                  const isSun = wd === 0;
                  const isSat = wd === 6;
                  return (
                    <th key={d} className={`px-1 py-2 text-center font-medium w-11 ${isSun ? 'text-danger' : isSat ? 'text-primary' : 'text-text'}`}>
                      <div>{d}</div>
                      <div className="text-xs font-normal">{WEEKDAY_JA[wd]}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredStaff.map(user => (
                <tr key={user.id} className="border-b border-border hover:bg-gray-50">
                  <td className="sticky left-0 bg-white border-r border-border px-3 py-2 font-medium text-text whitespace-nowrap">
                    {user.lastName} {user.firstName}
                  </td>
                  {days.map(d => {
                    const shift = shiftMap.get(`${user.id}-${d}`);
                    const type = shift?.shiftTypeId ? typeMap.get(shift.shiftTypeId) : null;
                    const isDraft = shift?.status === 'DRAFT';
                    return (
                      <td key={d} className="p-0.5 text-center border-r border-border last:border-r-0">
                        <button
                          onClick={() => openCell(user.id, d)}
                          className={`w-full h-8 rounded text-xs font-medium transition-opacity ${shift ? 'text-white' : 'text-gray-300 hover:bg-gray-100'} ${isDraft ? 'opacity-60' : ''}`}
                          style={type ? { backgroundColor: type.color ?? '#94A3B8' } : undefined}
                        >
                          {type ? type.name.slice(0, 2) : '+'}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Cell Modal */}
      <Modal
        isOpen={!!cellModal}
        onClose={() => setCellModal(null)}
        title="シフト設定"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sub font-medium text-text mb-2">シフト種別</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setSelectedTypeId('')}
                className={`p-3 rounded-lg border text-sub text-center transition-all ${selectedTypeId === '' ? 'border-primary bg-blue-50 font-medium' : 'border-border hover:bg-gray-50'}`}
              >
                未設定 / 削除
              </button>
              {shiftTypes.filter(t => t.isActive).map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTypeId(t.id)}
                  className={`p-3 rounded-lg border text-sub text-center font-medium transition-all text-white`}
                  style={{
                    backgroundColor: selectedTypeId === t.id ? (t.color ?? '#94A3B8') : 'transparent',
                    borderColor: t.color ?? '#94A3B8',
                    color: selectedTypeId === t.id ? '#fff' : (t.color ?? '#94A3B8'),
                  }}
                >
                  {t.name}
                  <div className="text-xs font-normal opacity-90">{t.startTime}〜{t.endTime}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setCellModal(null)} className="btn-secondary" disabled={cellSaving}>キャンセル</button>
            <button onClick={handleCellSave} className="btn-primary" disabled={cellSaving}>
              {cellSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
