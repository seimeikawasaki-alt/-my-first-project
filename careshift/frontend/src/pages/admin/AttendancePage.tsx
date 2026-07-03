import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import { getAttendances, createAttendance, correctAttendance, exportAttendanceCsvUrl } from '../../api/attendance';
import { staffApi } from '../../api/staff';
import type { Attendance, User } from '../../types';

const STATUS_LABELS: Record<string, string> = {
  PUNCHED_IN: '出勤中',
  ON_BREAK: '休憩中',
  PUNCHED_OUT: '退勤済',
  ABSENT: '欠勤',
  PAID_LEAVE: '有給',
  HOLIDAY_WORK: '休日出勤',
};

const STATUS_COLORS: Record<string, string> = {
  PUNCHED_IN: 'bg-green-100 text-success',
  ON_BREAK: 'bg-yellow-100 text-warning',
  PUNCHED_OUT: 'bg-gray-100 text-subtext',
  ABSENT: 'bg-red-100 text-danger',
  PAID_LEAVE: 'bg-blue-100 text-primary',
  HOLIDAY_WORK: 'bg-purple-100 text-purple-600',
};

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

function toJST(dt: string | Date): Date {
  return new Date(new Date(dt).getTime() + JST_OFFSET_MS);
}

function toTimeInput(dt: string | null | undefined): string {
  if (!dt) return '';
  const jst = toJST(dt);
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDateTime(dt: string | null | undefined): string {
  if (!dt) return '—';
  const jst = toJST(dt);
  return `${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDate(dt: string): string {
  const d = new Date(dt);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function minutesToHM(min: number | null | undefined): string {
  if (min == null) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${m > 0 ? `${m}m` : ''}`;
}

export default function AttendancePage() {
  const { year: yearStr, month: monthStr } = useParams<{ year: string; month: string }>();
  const navigate = useNavigate();

  const year = parseInt(yearStr ?? '');
  const month = parseInt(monthStr ?? '');

  const [records, setRecords] = useState<(Attendance & { user?: { lastName: string; firstName: string } | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterUserId, setFilterUserId] = useState('');
  const [staffList, setStaffList] = useState<User[]>([]);

  // Create modal (manual attendance entry)
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const defaultDate = !isNaN(year) && !isNaN(month) ? `${year}-${pad2(month)}-01` : '';
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    userId: '', date: defaultDate, punchIn: '09:00', punchOut: '18:00',
    breakStart: '12:00', breakEnd: '13:00', status: 'PUNCHED_OUT', notes: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Correction modal
  const [correcting, setCorrecting] = useState<Attendance | null>(null);
  const [corrForm, setCorrForm] = useState({
    punchIn: '',
    punchOut: '',
    breakStart: '',
    breakEnd: '',
    notes: '',
    modifyReason: '',
  });
  const [corrSaving, setCorrSaving] = useState(false);
  const [corrError, setCorrError] = useState('');

  const load = useCallback(async () => {
    if (isNaN(year) || isNaN(month)) return;
    setLoading(true);
    try {
      const res = await getAttendances({ year, month, userId: filterUserId || undefined });
      setRecords(res.data);
    } finally {
      setLoading(false);
    }
  }, [year, month, filterUserId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    staffApi.list({ is_active: 'true', per_page: 200 }).then(res =>
      setStaffList(res.data.data.filter((u: User) => u.role !== 'ADMIN'))
    );
  }, []);

  const openCreate = () => {
    setCreateForm({
      userId: staffList[0]?.id ?? '', date: defaultDate,
      punchIn: '09:00', punchOut: '18:00', breakStart: '12:00', breakEnd: '13:00',
      status: 'PUNCHED_OUT', notes: '',
    });
    setCreateError('');
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!createForm.userId) { setCreateError('スタッフを選択してください'); return; }
    if (!createForm.date) { setCreateError('日付を入力してください'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const pin = createForm.punchIn ? buildDateTimeISO(createForm.date, createForm.punchIn) : null;
      let pout = createForm.punchOut ? buildDateTimeISO(createForm.date, createForm.punchOut) : null;
      // Overnight shift: if punch-out is not after punch-in, roll it to the next day
      if (pin && pout && new Date(pout) <= new Date(pin)) {
        pout = new Date(new Date(pout).getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
      await createAttendance({
        userId: createForm.userId,
        workDate: createForm.date,
        punchIn: pin,
        punchOut: pout,
        breakStart: createForm.breakStart ? buildDateTimeISO(createForm.date, createForm.breakStart) : null,
        breakEnd: createForm.breakEnd ? buildDateTimeISO(createForm.date, createForm.breakEnd) : null,
        status: createForm.status,
        notes: createForm.notes || null,
      });
      setShowCreate(false);
      load();
    } catch {
      setCreateError('登録に失敗しました');
    } finally {
      setCreating(false);
    }
  };

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    navigate(`/admin/attendance/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    navigate(`/admin/attendance/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const openCorrection = (rec: Attendance) => {
    setCorrecting(rec);
    setCorrForm({
      punchIn: toTimeInput(rec.punchIn),
      punchOut: toTimeInput(rec.punchOut),
      breakStart: toTimeInput(rec.breakStart),
      breakEnd: toTimeInput(rec.breakEnd),
      notes: rec.notes ?? '',
      modifyReason: '',
    });
    setCorrError('');
  };

  const buildDateTimeISO = (date: string, time: string): string | undefined => {
    if (!time) return undefined;
    const d = new Date(date);
    const [h, m] = time.split(':').map(Number);
    const utcMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h, m) - JST_OFFSET_MS;
    return new Date(utcMs).toISOString();
  };

  const handleCorrection = async () => {
    if (!correcting) return;
    if (!corrForm.modifyReason) {
      setCorrError('修正理由は必須です');
      return;
    }
    setCorrSaving(true);
    setCorrError('');
    try {
      await correctAttendance(correcting.id, {
        punchIn: buildDateTimeISO(correcting.workDate, corrForm.punchIn),
        punchOut: buildDateTimeISO(correcting.workDate, corrForm.punchOut),
        breakStart: corrForm.breakStart ? buildDateTimeISO(correcting.workDate, corrForm.breakStart) : null,
        breakEnd: corrForm.breakEnd ? buildDateTimeISO(correcting.workDate, corrForm.breakEnd) : null,
        notes: corrForm.notes || null,
        modifyReason: corrForm.modifyReason,
      });
      setCorrecting(null);
      load();
    } catch {
      setCorrError('修正に失敗しました');
    } finally {
      setCorrSaving(false);
    }
  };

  const userIds = [...new Set(records.map(r => r.userId))];
  const userNames = new Map<string, string>();
  records.forEach(r => {
    if (r.user) userNames.set(r.userId, `${r.user.lastName} ${r.user.firstName}`);
  });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="btn-secondary px-3">←</button>
          <h1 className="text-heading font-bold text-text">
            {year}年{month}月 勤怠管理
          </h1>
          <button onClick={nextMonth} className="btn-secondary px-3">→</button>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterUserId}
            onChange={e => setFilterUserId(e.target.value)}
            className="input py-2 text-sub"
          >
            <option value="">全スタッフ</option>
            {userIds.map(uid => (
              <option key={uid} value={uid}>{userNames.get(uid) ?? uid}</option>
            ))}
          </select>
          <a
            href={exportAttendanceCsvUrl(year, month)}
            download={`attendance_${year}_${month}.csv`}
            className="btn-secondary"
          >
            CSV出力
          </a>
          <button onClick={openCreate} className="btn-primary">＋勤怠を追加</button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-x-auto">
        {loading ? (
          <p className="text-center text-subtext py-12">読み込み中...</p>
        ) : records.length === 0 ? (
          <p className="text-center text-subtext py-12">打刻記録がありません</p>
        ) : (
          <table className="w-full text-sub">
            <thead>
              <tr className="border-b border-border text-left text-subtext">
                <th className="pb-3 pr-4">スタッフ</th>
                <th className="pb-3 pr-4">日付</th>
                <th className="pb-3 pr-4">出勤</th>
                <th className="pb-3 pr-4">退勤</th>
                <th className="pb-3 pr-4">休憩</th>
                <th className="pb-3 pr-4">実労働</th>
                <th className="pb-3 pr-4">残業</th>
                <th className="pb-3 pr-4">状態</th>
                <th className="pb-3"></th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-b border-border last:border-0 hover:bg-gray-50">
                  <td className="py-3 pr-4 font-medium text-text">
                    {r.user ? `${r.user.lastName} ${r.user.firstName}` : r.userId}
                  </td>
                  <td className="py-3 pr-4">{formatDate(r.workDate)}</td>
                  <td className="py-3 pr-4">{formatDateTime(r.punchIn)}</td>
                  <td className="py-3 pr-4">{formatDateTime(r.punchOut)}</td>
                  <td className="py-3 pr-4">
                    {r.breakStart && r.breakEnd
                      ? `${formatDateTime(r.breakStart)}〜${formatDateTime(r.breakEnd)}`
                      : '—'}
                  </td>
                  <td className="py-3 pr-4">{minutesToHM(r.workMinutes)}</td>
                  <td className="py-3 pr-4">{minutesToHM(r.overtimeMinutes)}</td>
                  <td className="py-3 pr-4">
                    {r.status ? (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-subtext'}`}>
                        {STATUS_LABELS[r.status] ?? r.status}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="py-3 text-right">
                    <button onClick={() => openCorrection(r)} className="text-primary hover:underline text-xs">
                      修正
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Correction Modal */}
      <Modal isOpen={!!correcting} onClose={() => setCorrecting(null)} title="勤怠修正">
        <div className="space-y-4">
          {corrError && <p className="text-danger text-sub">{corrError}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">出勤時刻</label>
              <input type="time" value={corrForm.punchIn} onChange={e => setCorrForm(f => ({ ...f, punchIn: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">退勤時刻</label>
              <input type="time" value={corrForm.punchOut} onChange={e => setCorrForm(f => ({ ...f, punchOut: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">休憩開始</label>
              <input type="time" value={corrForm.breakStart} onChange={e => setCorrForm(f => ({ ...f, breakStart: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">休憩終了</label>
              <input type="time" value={corrForm.breakEnd} onChange={e => setCorrForm(f => ({ ...f, breakEnd: e.target.value }))} className="input w-full" />
            </div>
          </div>

          <div>
            <label className="block text-sub font-medium text-text mb-1">備考</label>
            <input type="text" value={corrForm.notes} onChange={e => setCorrForm(f => ({ ...f, notes: e.target.value }))} className="input w-full" />
          </div>

          <div>
            <label className="block text-sub font-medium text-text mb-1">修正理由 <span className="text-danger">*</span></label>
            <input
              type="text"
              value={corrForm.modifyReason}
              onChange={e => setCorrForm(f => ({ ...f, modifyReason: e.target.value }))}
              className="input w-full"
              placeholder="例: 打刻漏れのため"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setCorrecting(null)} className="btn-secondary" disabled={corrSaving}>キャンセル</button>
            <button onClick={handleCorrection} className="btn-primary" disabled={corrSaving}>
              {corrSaving ? '修正中...' : '修正を保存'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Create Modal (manual attendance entry) */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="勤怠を追加">
        <div className="space-y-4">
          {createError && <p className="text-danger text-sub">{createError}</p>}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">スタッフ <span className="text-danger">*</span></label>
              <select value={createForm.userId} onChange={e => setCreateForm(f => ({ ...f, userId: e.target.value }))} className="input w-full">
                <option value="">選択してください</option>
                {staffList.map(u => (
                  <option key={u.id} value={u.id}>{u.lastName} {u.firstName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">日付 <span className="text-danger">*</span></label>
              <input type="date" value={createForm.date} onChange={e => setCreateForm(f => ({ ...f, date: e.target.value }))} className="input w-full" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sub font-medium text-text mb-1">出勤時刻</label>
              <input type="time" value={createForm.punchIn} onChange={e => setCreateForm(f => ({ ...f, punchIn: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">退勤時刻</label>
              <input type="time" value={createForm.punchOut} onChange={e => setCreateForm(f => ({ ...f, punchOut: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">休憩開始</label>
              <input type="time" value={createForm.breakStart} onChange={e => setCreateForm(f => ({ ...f, breakStart: e.target.value }))} className="input w-full" />
            </div>
            <div>
              <label className="block text-sub font-medium text-text mb-1">休憩終了</label>
              <input type="time" value={createForm.breakEnd} onChange={e => setCreateForm(f => ({ ...f, breakEnd: e.target.value }))} className="input w-full" />
            </div>
          </div>

          <div>
            <label className="block text-sub font-medium text-text mb-1">区分</label>
            <select value={createForm.status} onChange={e => setCreateForm(f => ({ ...f, status: e.target.value }))} className="input w-full">
              <option value="PUNCHED_OUT">通常勤務</option>
              <option value="HOLIDAY_WORK">休日出勤</option>
              <option value="PAID_LEAVE">有給</option>
              <option value="ABSENT">欠勤</option>
            </select>
          </div>

          <div>
            <label className="block text-sub font-medium text-text mb-1">備考</label>
            <input type="text" value={createForm.notes} onChange={e => setCreateForm(f => ({ ...f, notes: e.target.value }))} className="input w-full" placeholder="任意" />
          </div>

          <p className="text-xs text-subtext">※ 実労働時間・残業・深夜時間は出退勤時刻から自動計算されます。夜勤（退勤が翌日）は退勤時刻が出勤時刻以前の場合、自動で翌日として扱います。</p>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary" disabled={creating}>キャンセル</button>
            <button onClick={handleCreate} className="btn-primary" disabled={creating}>
              {creating ? '登録中...' : '登録する'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
