import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Modal from '../../components/common/Modal';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { staffApi } from '../../api/staff';
import {
  getPayrolls, getPayroll, calculatePayroll, updatePayroll, confirmPayroll,
  payslipPdfUrl, payrollExportUrl,
} from '../../api/payroll';
import { toast } from '../../stores/toastStore';
import { matchStaff, compareKana } from '../../utils/staffSort';
import type { User, Payroll, PayrollDetailRow, PayrollStatus } from '../../types';

const STATUS_META: Record<PayrollStatus | 'NONE', { label: string; cls: string }> = {
  NONE: { label: '未計算', cls: 'bg-gray-100 text-subtext' },
  DRAFT: { label: '未計算', cls: 'bg-gray-100 text-subtext' },
  CALCULATED: { label: '計算済', cls: 'bg-blue-100 text-primary' },
  CONFIRMED: { label: '確定', cls: 'bg-green-100 text-success' },
};

const yen = (n: number) => `¥${Math.floor(n).toLocaleString('ja-JP')}`;
const hours = (min: number) => `${(min / 60).toFixed(1)}h`;

export default function SalaryPage() {
  const { year: yearStr, month: monthStr } = useParams<{ year: string; month: string }>();
  const navigate = useNavigate();
  const year = parseInt(yearStr ?? '');
  const month = parseInt(monthStr ?? '');

  const [staff, setStaff] = useState<User[]>([]);
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [bulkCalculating, setBulkCalculating] = useState(false);
  const [rowCalcId, setRowCalcId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Detail modal
  const [detail, setDetail] = useState<Payroll | null>(null);
  const [editAmounts, setEditAmounts] = useState<Record<string, number>>({});
  const [modifyReason, setModifyReason] = useState('');
  const [savingDetail, setSavingDetail] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (isNaN(year) || isNaN(month)) return;
    setLoading(true);
    setLoadError('');
    try {
      const [staffRes, payrollRes] = await Promise.all([
        staffApi.list({ is_active: 'true', per_page: 200 }),
        getPayrolls({ year, month }),
      ]);
      setStaff(staffRes.data.data.filter((u: User) => u.role !== 'ADMIN'));
      setPayrolls(payrollRes.data);
    } catch {
      setLoadError('給与データの読み込みに失敗しました。バックエンドのマイグレーション（prisma migrate）が適用されているかご確認ください。');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const payrollByUser = new Map(payrolls.map(p => [p.userId, p]));

  // あいうえお順 + 名前検索
  const displayStaff = staff
    .filter(u => matchStaff(u, search))
    .slice()
    .sort(compareKana);

  const prevMonth = () => {
    const d = new Date(year, month - 2, 1);
    navigate(`/admin/salary/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };
  const nextMonth = () => {
    const d = new Date(year, month, 1);
    navigate(`/admin/salary/${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleBulk = async () => {
    if (!confirm(`${year}年${month}月の全スタッフの給与を計算しますか？（確定済みは除外されます）`)) return;
    setBulkCalculating(true);
    try {
      const res = await calculatePayroll({ year, month });
      toast.success(`${res.data.calculatedCount}件を計算しました${res.data.skippedLockedCount ? `（確定済み${res.data.skippedLockedCount}件は除外）` : ''}`);
      load();
    } catch {
      toast.error('計算に失敗しました');
    } finally {
      setBulkCalculating(false);
    }
  };

  const handleRowCalc = async (userId: string) => {
    setRowCalcId(userId);
    try {
      await calculatePayroll({ year, month, userIds: [userId] });
      load();
    } catch {
      alert('計算に失敗しました');
    } finally {
      setRowCalcId(null);
    }
  };

  const openDetail = async (payrollId: string) => {
    setDetailLoading(true);
    setDetail(null);
    setModifyReason('');
    try {
      const res = await getPayroll(payrollId);
      setDetail(res.data);
      const amts: Record<string, number> = {};
      (res.data.details ?? []).forEach(d => { amts[d.id] = d.amount; });
      setEditAmounts(amts);
    } catch {
      alert('明細の取得に失敗しました');
    } finally {
      setDetailLoading(false);
    }
  };

  const detailDirty = detail?.details?.some(d => editAmounts[d.id] !== d.amount) ?? false;

  const editTotals = (() => {
    if (!detail?.details) return { income: 0, deduction: 0, net: 0 };
    let income = 0, deduction = 0;
    for (const d of detail.details) {
      const amt = editAmounts[d.id] ?? d.amount;
      if (d.itemType === 'DEDUCTION') deduction += amt; else income += amt;
    }
    return { income, deduction, net: income - deduction };
  })();

  const handleSaveDetail = async () => {
    if (!detail) return;
    if (!modifyReason.trim()) { alert('修正理由を入力してください'); return; }
    setSavingDetail(true);
    try {
      const details = (detail.details ?? []).map(d => ({ id: d.id, amount: Math.floor(editAmounts[d.id] ?? d.amount) }));
      await updatePayroll(detail.id, { details, modifyReason: modifyReason.trim() });
      setDetail(null);
      load();
    } catch {
      alert('保存に失敗しました');
    } finally {
      setSavingDetail(false);
    }
  };

  const handleConfirm = async () => {
    if (!detail) return;
    if (!confirm('給与を確定しますか？確定後は編集できません。')) return;
    setSavingDetail(true);
    try {
      await confirmPayroll(detail.id);
      toast.success('給与を確定しました');
      setDetail(null);
      load();
    } catch {
      toast.error('確定に失敗しました');
    } finally {
      setSavingDetail(false);
    }
  };

  const renderDetailRows = (rows: PayrollDetailRow[], locked: boolean) =>
    rows.map(d => (
      <div key={d.id} className="flex items-center justify-between gap-3 py-1.5">
        <span className="text-sub text-text">
          {d.name}
          {d.calcType === 'AUTO' && <span className="ml-1.5 text-xs text-primary">自動</span>}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-subtext text-xs">¥</span>
          <input
            type="number"
            value={editAmounts[d.id] ?? d.amount}
            disabled={locked}
            onChange={e => setEditAmounts(a => ({ ...a, [d.id]: parseInt(e.target.value) || 0 }))}
            className="input w-28 text-right py-1 disabled:bg-gray-100 disabled:text-subtext"
          />
        </div>
      </div>
    ));

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="btn-secondary px-3">←</button>
          <h1 className="text-heading font-bold text-text">{year}年{month}月 給与計算</h1>
          <button onClick={nextMonth} className="btn-secondary px-3">→</button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="スタッフ検索"
            className="input py-2 text-sub w-36"
          />
          <button onClick={() => window.open(payrollExportUrl(year, month), '_blank')} className="btn-secondary">CSV出力</button>
          <button onClick={handleBulk} disabled={bulkCalculating} className="btn-primary">
            {bulkCalculating ? '計算中...' : '一括計算'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-danger text-sub">{loadError}</div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16"><LoadingSpinner /></div>
        ) : displayStaff.length === 0 ? (
          <p className="py-16 text-center text-subtext">{staff.length === 0 ? 'スタッフがいません' : '該当するスタッフがいません'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sub">
              <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                <tr>
                  <th className="px-6 py-3">氏名</th>
                  <th className="px-6 py-3 text-right">勤務日数</th>
                  <th className="px-6 py-3 text-right">総支給額</th>
                  <th className="px-6 py-3 text-right">控除合計</th>
                  <th className="px-6 py-3 text-right">差引支給額</th>
                  <th className="px-6 py-3">ステータス</th>
                  <th className="px-6 py-3 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayStaff.map(u => {
                  const p = payrollByUser.get(u.id);
                  const meta = STATUS_META[p?.status ?? 'NONE'];
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-text">{u.lastName} {u.firstName}</td>
                      <td className="px-6 py-3 text-right text-subtext">{p ? `${p.workDays}日` : '—'}</td>
                      <td className="px-6 py-3 text-right">{p ? yen(p.totalIncome) : '—'}</td>
                      <td className="px-6 py-3 text-right">{p ? yen(p.totalDeduction) : '—'}</td>
                      <td className="px-6 py-3 text-right font-semibold text-text">{p ? yen(p.netPay) : '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${meta.cls}`}>{meta.label}</span>
                      </td>
                      <td className="px-6 py-3 text-right whitespace-nowrap">
                        {p && (
                          <button onClick={() => openDetail(p.id)} className="text-primary hover:underline mr-3">明細</button>
                        )}
                        <button
                          onClick={() => handleRowCalc(u.id)}
                          disabled={rowCalcId === u.id || p?.status === 'CONFIRMED'}
                          className="text-primary hover:underline disabled:text-gray-300 disabled:no-underline"
                        >
                          {rowCalcId === u.id ? '計算中' : '計算'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      <Modal isOpen={!!detail || detailLoading} onClose={() => setDetail(null)} title="給与明細">
        {detailLoading || !detail ? (
          <div className="py-10"><LoadingSpinner /></div>
        ) : (() => {
          const locked = detail.status === 'CONFIRMED';
          const income = (detail.details ?? []).filter(d => d.itemType === 'INCOME');
          const deduction = (detail.details ?? []).filter(d => d.itemType === 'DEDUCTION');
          return (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-text">{detail.user?.lastName} {detail.user?.firstName}</p>
                  <p className="text-xs text-subtext">{detail.year}年{detail.month}月</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_META[detail.status].cls}`}>
                  {STATUS_META[detail.status].label}
                </span>
              </div>

              {/* Attendance summary */}
              <div className="grid grid-cols-4 gap-2 bg-gray-50 rounded-lg p-3 text-center">
                <div><p className="text-xs text-subtext">労働日数</p><p className="font-bold text-text">{detail.workDays}日</p></div>
                <div><p className="text-xs text-subtext">総労働</p><p className="font-bold text-text">{hours(detail.workMinutes)}</p></div>
                <div><p className="text-xs text-subtext">残業</p><p className="font-bold text-text">{hours(detail.overtimeMinutes)}</p></div>
                <div><p className="text-xs text-subtext">深夜</p><p className="font-bold text-text">{hours(detail.lateNightMinutes)}</p></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sub font-bold text-success border-b border-border pb-1 mb-1">支給</p>
                  {renderDetailRows(income, locked)}
                  <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-text text-sub">
                    <span>総支給額</span><span>{yen(editTotals.income)}</span>
                  </div>
                </div>
                <div>
                  <p className="text-sub font-bold text-danger border-b border-border pb-1 mb-1">控除</p>
                  {renderDetailRows(deduction, locked)}
                  <div className="flex justify-between border-t border-border pt-1.5 mt-1 font-bold text-text text-sub">
                    <span>総控除額</span><span>{yen(editTotals.deduction)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-center bg-blue-50 rounded-lg px-4 py-3">
                <span className="font-bold text-text">差引支給額</span>
                <span className="text-xl font-bold text-primary">{yen(editTotals.net)}</span>
              </div>

              {!locked && (
                <div>
                  <label className="block text-sub font-medium text-text mb-1">修正理由 {detailDirty && <span className="text-danger">*</span>}</label>
                  <input type="text" value={modifyReason} onChange={e => setModifyReason(e.target.value)}
                    className="input w-full" placeholder="金額を修正した場合は理由を入力" />
                </div>
              )}

              {detail.modifyReason && (
                <p className="text-xs text-subtext">前回修正理由: {detail.modifyReason}</p>
              )}

              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <button onClick={() => window.open(payslipPdfUrl(detail.id), '_blank')} className="btn-secondary">PDF / 印刷</button>
                {!locked && (
                  <>
                    <button onClick={handleSaveDetail} disabled={savingDetail || !detailDirty} className="btn-secondary disabled:opacity-50">
                      {savingDetail ? '保存中...' : '保存'}
                    </button>
                    <button onClick={handleConfirm} disabled={savingDetail} className="btn-primary">給与確定</button>
                  </>
                )}
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
