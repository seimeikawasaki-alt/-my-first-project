import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import { getShifts, createShift, updateShift, deleteShift, publishShifts, bulkCopyShifts, autoGenerateShifts } from '../../api/shifts';
import { getShiftTypes } from '../../api/shiftTypes';
import { getShiftRequests } from '../../api/shiftRequests';
import { staffApi } from '../../api/staff';
import { groupsApi } from '../../api/groups';
import { toast } from '../../stores/toastStore';
import type { Shift, ShiftType, ShiftRequest, User, Group, GenerationResult, StaffShiftStats } from '../../types';

type CellShift = Shift & { user?: { lastName: string; firstName: string } | null };

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const SEVERITY_COLOR: Record<string, string> = {
  HIGH: 'bg-red-100 text-danger',
  MEDIUM: 'bg-yellow-100 text-warning',
  LOW: 'bg-gray-100 text-subtext',
};

export default function ShiftsPage() {
  const { year: yearStr, month: monthStr } = useParams<{ year: string; month: string }>();
  const navigate = useNavigate();

  const year = parseInt(yearStr ?? '');
  const month = parseInt(monthStr ?? '');

  const [shifts, setShifts] = useState<CellShift[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [staff, setStaff] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [copying, setCopying] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Cell modal
  const [cellModal, setCellModal] = useState<{ userId: string; date: string } | null>(null);
  const [cellShift, setCellShift] = useState<CellShift | null>(null);
  const [selectedTypeId, setSelectedTypeId] = useState('');
  const [cellSaving, setCellSaving] = useState(false);

  // Auto-generate result
  const [genResult, setGenResult] = useState<GenerationResult | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [staffStats, setStaffStats] = useState<StaffShiftStats[]>([]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const shiftMap = new Map<string, CellShift>();
  shifts.forEach(s => {
    const d = new Date(s.shiftDate);
    const key = `${s.userId}-${d.getUTCDate()}`;
    shiftMap.set(key, s);
  });

  // Load groups once and default to the first group (shifts are managed per group)
  useEffect(() => {
    groupsApi.list().then(res => {
      const gs = res.data.data;
      setGroups(gs);
      setSelectedGroup(prev => prev || (gs[0]?.id ?? ''));
    });
  }, []);

  const load = useCallback(async () => {
    if (isNaN(year) || isNaN(month) || !selectedGroup) return;
    setLoading(true);
    try {
      const [shiftsRes, typesRes, staffRes, reqRes] = await Promise.all([
        getShifts({ year, month, groupId: selectedGroup }),
        getShiftTypes(),
        staffApi.list({ is_active: 'true', group_id: selectedGroup, per_page: 100 }),
        getShiftRequests(),
      ]);
      setShifts(shiftsRes.data);
      setShiftTypes(typesRes.data);
      setStaff(staffRes.data.data.filter((u: User) => u.role !== 'ADMIN'));
      setRequests(reqRes.data);
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
    if (!confirm('このページのシフトを公開しますか？（AUTO状態のシフトも含まれます）')) return;
    setPublishing(true);
    try {
      const res = await publishShifts({ year, month, groupId: selectedGroup || undefined });
      toast.success(`${res.data.publishedCount}件のシフトを公開しました`);
      load();
    } catch {
      toast.error('公開に失敗しました');
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
      toast.success(`${res.data.copiedCount}件のシフトをコピーしました`);
      load();
    } catch {
      toast.error('コピーに失敗しました');
    } finally {
      setCopying(false);
    }
  };

  const handleAutoGenerate = async () => {
    setGenerating(true);
    setShowGenModal(false);
    setGenResult(null);
    try {
      const res = await autoGenerateShifts({
        year, month,
        groupId: selectedGroup || undefined,
        overwrite,
      });
      setGenResult(res.data);
      // Load staff stats after generation
      if (selectedGroup) {
        import('../../api/client').then(({ default: apiClient }) => {
          apiClient.get(`/staff-shift-stats?year=${year}&month=${month}&groupId=${selectedGroup}`)
            .then(r => setStaffStats((r.data as { data: StaffShiftStats[] }).data ?? []))
            .catch(() => {});
        });
      }
      load();
    } catch {
      toast.error('自動生成に失敗しました');
    } finally {
      setGenerating(false);
    }
  };

  const typeMap = new Map(shiftTypes.map(t => [t.id, t]));

  // Map staff requests onto grid cells (`${userId}-${day}`). Rejected requests
  // are ignored; VACATION takes visual priority over PREFERRED on the same day.
  const VACATION_COLOR = '#F97316';
  const requestMap = new Map<string, ShiftRequest[]>();
  requests.forEach(r => {
    if (!r.targetDate || r.status === 'REJECTED') return;
    const d = new Date(r.targetDate);
    if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month) return;
    const key = `${r.userId}-${d.getUTCDate()}`;
    const arr = requestMap.get(key) ?? [];
    arr.push(r);
    requestMap.set(key, arr);
  });
  const primaryRequest = (list: ShiftRequest[]): ShiftRequest =>
    list.find(r => r.requestType === 'VACATION') ?? list[0];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
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

      {/* Auto-generate panel */}
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-wrap items-center gap-3">
        <span className="text-sub font-medium text-primary">自動生成</span>
        <label className="flex items-center gap-1.5 text-sub text-subtext cursor-pointer">
          <input
            type="checkbox"
            checked={overwrite}
            onChange={e => setOverwrite(e.target.checked)}
            className="w-3.5 h-3.5"
          />
          確定済み（公開）シフトも上書き
        </label>
        <button
          onClick={() => setShowGenModal(true)}
          disabled={generating}
          className="btn-primary py-2 text-sub"
        >
          {generating ? '生成中...' : '自動生成を実行'}
        </button>
        <span className="text-xs text-subtext">※シフト要件・ルール・スタッフ制約を元に生成します</span>
      </div>

      {/* Generation result */}
      {genResult && (
        <div className={`mb-4 p-4 rounded-lg border ${genResult.unfilledSlots.length === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <div className="flex items-center gap-4 mb-3">
            <span className="text-sub font-bold text-text">生成完了: {genResult.totalShifts}件</span>
            <span className="text-sub text-text">充足率: {Math.round(genResult.fulfilledRate * 100)}%</span>
            <button onClick={() => { setGenResult(null); setStaffStats([]); }} className="ml-auto text-subtext hover:text-text text-xs">閉じる</button>
          </div>

          {/* Fair distribution bars */}
          {staffStats.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-subtext mb-2">均等分配状況（夜勤回数）</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {(() => {
                  const maxNight = Math.max(...staffStats.map(s => s.nightCount), 1);
                  return staffStats.sort((a, b) => b.nightCount - a.nightCount).map(s => {
                    const member = staff.find(u => u.id === s.userId);
                    if (!member) return null;
                    return (
                      <div key={s.userId} className="flex items-center gap-2 text-xs">
                        <span className="w-20 text-subtext truncate">{member.lastName} {member.firstName}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div className="bg-purple-500 h-2 rounded-full" style={{ width: `${(s.nightCount / maxNight) * 100}%` }} />
                        </div>
                        <span className="w-6 text-right text-subtext">{s.nightCount}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {genResult.unfilledSlots.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-medium text-warning mb-1">未充足スロット ({genResult.unfilledSlots.length}件)</p>
              <div className="flex flex-wrap gap-1">
                {genResult.unfilledSlots.slice(0, 10).map((s, i) => (
                  <span key={i} className="text-xs bg-yellow-100 text-warning px-2 py-0.5 rounded">
                    {s.date} {s.shiftTypeName} ({s.assigned}/{s.required}名)
                  </span>
                ))}
                {genResult.unfilledSlots.length > 10 && (
                  <span className="text-xs text-subtext">他 {genResult.unfilledSlots.length - 10}件</span>
                )}
              </div>
            </div>
          )}
          {genResult.warnings.length > 0 && (
            <div>
              <p className="text-xs font-medium text-subtext mb-1">警告 ({genResult.warnings.length}件)</p>
              <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                {genResult.warnings.map((w, i) => (
                  <span key={i} className={`text-xs px-2 py-0.5 rounded ${SEVERITY_COLOR[w.severity]}`}>{w.message}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {shiftTypes.filter(t => t.isActive).map(t => (
          <span key={t.id} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white font-medium"
            style={{ backgroundColor: t.color ?? '#94A3B8' }}>
            {t.name}
          </span>
        ))}
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-gray-200 text-subtext">未設定</span>
        <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-blue-100 text-primary border border-blue-200">AUTO (未確定)</span>
        {/* Request markers */}
        <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-white border border-border text-subtext">
          <span className="inline-block w-0 h-0" style={{ borderTop: '10px solid #F97316', borderLeft: '10px solid transparent' }} />
          休暇希望
        </span>
        <span className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full bg-white border border-border text-subtext">
          <span className="inline-block w-0 h-0" style={{ borderTop: '10px solid #94A3B8', borderLeft: '10px solid transparent' }} />
          希望シフト（色は希望勤務）
        </span>
        <span className="text-xs text-subtext">※ 隅マーカーが薄い＝審査中 / 濃い＝承認済</span>
      </div>

      {/* Grid */}
      {loading ? (
        <p className="text-center text-subtext py-12">読み込み中...</p>
      ) : (
        <div className="overflow-auto border border-border rounded-lg bg-white">
          <table className="text-xs border-collapse" style={{ minWidth: `${64 + daysInMonth * 44}px` }}>
            <thead>
              <tr className="bg-gray-50 border-b border-border">
                <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left font-medium text-subtext border-r border-border w-16 min-w-16">
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
              {staff.map(user => (
                <tr key={user.id} className="border-b border-border hover:bg-gray-50">
                  <td className="sticky left-0 z-10 bg-white border-r border-border px-3 py-2 font-medium text-text whitespace-nowrap">
                    {user.lastName} {user.firstName}
                  </td>
                  {days.map(d => {
                    const shift = shiftMap.get(`${user.id}-${d}`);
                    const type = shift?.shiftTypeId ? typeMap.get(shift.shiftTypeId) : null;
                    const isAuto = shift?.status === 'AUTO';
                    const isDraft = shift?.status === 'DRAFT';
                    const cellReqs = requestMap.get(`${user.id}-${d}`);
                    const req = cellReqs ? primaryRequest(cellReqs) : null;
                    const reqType = req?.shiftTypeId ? typeMap.get(req.shiftTypeId) : null;
                    const isVacation = req?.requestType === 'VACATION';
                    const markerColor = req
                      ? (isVacation ? VACATION_COLOR : (reqType?.color ?? '#94A3B8'))
                      : null;
                    const reqLabel = req
                      ? (isVacation ? '休暇希望' : reqType ? `希望シフト: ${reqType.name}` : 'シフト変更申請')
                        + (req.status === 'PENDING' ? '（審査中）' : '（承認済）')
                      : null;
                    const title = [isAuto ? '自動生成（未確定）' : null, reqLabel]
                      .filter(Boolean).join(' / ') || undefined;
                    return (
                      <td key={d} className="p-0.5 text-center border-r border-border last:border-r-0">
                        <button
                          onClick={() => openCell(user.id, d)}
                          className={`relative overflow-hidden w-full h-8 rounded text-xs font-medium transition-opacity ${shift ? 'text-white' : 'text-gray-300 hover:bg-gray-100'} ${isDraft ? 'opacity-60' : ''} ${isAuto ? 'ring-1 ring-blue-300' : ''}`}
                          style={type ? { backgroundColor: type.color ?? '#94A3B8' } : undefined}
                          title={title}
                        >
                          {type ? type.name.slice(0, 2) : '+'}
                          {markerColor && (
                            <span
                              className="absolute top-0 right-0 w-0 h-0"
                              style={{
                                borderTop: `11px solid ${markerColor}`,
                                borderLeft: '11px solid transparent',
                                opacity: req?.status === 'PENDING' ? 0.55 : 1,
                              }}
                            />
                          )}
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

      {/* Generation Confirmation Modal */}
      <Modal
        isOpen={showGenModal}
        onClose={() => setShowGenModal(false)}
        title="自動生成の確認"
      >
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sub text-text space-y-1">
            <p><span className="font-medium">対象期間:</span> {year}年{month}月</p>
            <p><span className="font-medium">対象グループ:</span> {selectedGroup ? groups.find(g => g.id === selectedGroup)?.name : '全グループ'}</p>
            <p><span className="font-medium">上書き:</span> {overwrite ? '確定済み（公開）シフトも削除して再生成' : '確定済みシフトは保持（未確定シフトのみ再生成）'}</p>
          </div>
          <div className="text-sub text-subtext space-y-1">
            <p>• シフト要件・生成ルール・スタッフ制約を元に自動生成します</p>
            <p>• 必要人数ちょうどで生成されます（超過しません）</p>
            <p>• 再生成時は既存の自動生成シフトを消してから作り直します</p>
            <p>• 夜勤翌日は夜勤または休みになるよう制御されます</p>
            <p>• 生成結果はAUTO（未確定）状態となります</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button onClick={handleAutoGenerate} className="btn-primary">実行する</button>
            <button onClick={() => setShowGenModal(false)} className="btn-secondary">キャンセル</button>
          </div>
        </div>
      </Modal>

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
                  className="p-3 rounded-lg border text-sub text-center font-medium transition-all"
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
