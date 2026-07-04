import { useState, useEffect, useCallback } from 'react';
import { getShiftRequests, reviewShiftRequest } from '../../api/shiftRequests';
import { getShiftTypes } from '../../api/shiftTypes';
import type { ShiftRequest, ShiftRequestStatus, ShiftType } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';

const REQUEST_TYPE_LABELS: Record<string, string> = {
  VACATION: '休暇希望',
  PREFERRED: '希望シフト',
  CHANGE: 'シフト変更申請',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: '審査中',
  APPROVED: '承認済',
  REJECTED: '却下',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-warning',
  APPROVED: 'bg-green-100 text-success',
  REJECTED: 'bg-red-100 text-danger',
};

type StatusFilter = 'ALL' | ShiftRequestStatus;

export default function ShiftRequestsPage() {
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('PENDING');
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  // Extra filters (shown for non-審査中 views)
  const [nameSearch, setNameSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'VACATION' | 'PREFERRED' | 'CHANGE'>('ALL');
  const [monthFilter, setMonthFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [reqRes, typesRes] = await Promise.all([
        getShiftRequests(statusFilter === 'ALL' ? undefined : { status: statusFilter }),
        getShiftTypes(),
      ]);
      setRequests(reqRes.data);
      setShiftTypes(typesRes.data);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const shiftTypeMap = new Map(shiftTypes.map(t => [t.id, t]));

  const handleReview = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setReviewingId(id);
    try {
      await reviewShiftRequest(id, { status });
      load();
    } catch {
      alert('処理に失敗しました');
    } finally {
      setReviewingId(null);
    }
  };

  const formatDate = (dt?: string | null) => {
    if (!dt) return '—';
    const d = new Date(dt);
    return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  };

  const pad2 = (n: number) => String(n).padStart(2, '0');
  const ym = (dt: string) => { const d = new Date(dt); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`; };
  const ymd = (dt: string) => { const d = new Date(dt); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

  // 審査中タブは全件表示、それ以外は氏名・種別・月・日付で絞り込み可能
  const showFilters = statusFilter !== 'PENDING';
  const displayRequests = requests.filter(r => {
    if (!showFilters) return true;
    if (nameSearch.trim()) {
      const nm = r.user ? `${r.user.lastName} ${r.user.firstName}` : '';
      if (!nm.includes(nameSearch.trim())) return false;
    }
    if (typeFilter !== 'ALL' && r.requestType !== typeFilter) return false;
    if (dateFilter) {
      if (!r.targetDate || ymd(r.targetDate) !== dateFilter) return false;
    } else if (monthFilter) {
      const basis = r.targetDate ?? r.createdAt;
      if (ym(basis) !== monthFilter) return false;
    }
    return true;
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-heading font-bold text-text">シフト申請一覧</h1>
          <p className="text-sub text-subtext mt-1">{showFilters ? `${displayRequests.length} 件` : `全 ${requests.length} 件`}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: 'PENDING', label: '審査中' },
          { key: 'APPROVED', label: '承認済' },
          { key: 'REJECTED', label: '却下' },
          { key: 'ALL', label: 'すべて' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`px-5 py-2.5 text-sub font-medium border-b-2 transition-colors ${
              statusFilter === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-subtext hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Extra filters for 承認済 / 却下 / すべて */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            type="text"
            value={nameSearch}
            onChange={e => setNameSearch(e.target.value)}
            placeholder="スタッフ名で検索"
            className="input py-2 text-sub w-40"
          />
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className="input py-2 text-sub w-auto">
            <option value="ALL">種別 : すべて</option>
            <option value="VACATION">休暇希望</option>
            <option value="PREFERRED">希望シフト</option>
            <option value="CHANGE">シフト変更申請</option>
          </select>
          <input type="month" value={monthFilter} onChange={e => setMonthFilter(e.target.value)} className="input py-2 text-sub w-auto" title="希望日の月で絞り込み" />
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="input py-2 text-sub w-auto" title="希望日で絞り込み" />
          {(nameSearch || typeFilter !== 'ALL' || monthFilter || dateFilter) && (
            <button
              onClick={() => { setNameSearch(''); setTypeFilter('ALL'); setMonthFilter(''); setDateFilter(''); }}
              className="text-subtext hover:text-text text-sub px-1"
            >
              クリア
            </button>
          )}
        </div>
      )}

      <div className="card p-0 overflow-hidden">
        {loading ? (
          <div className="py-16"><LoadingSpinner /></div>
        ) : displayRequests.length === 0 ? (
          <div className="py-16 text-center text-subtext">{requests.length === 0 ? '申請がありません' : '該当する申請がありません'}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">申請者</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">種別</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">希望日</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">希望シフト</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">理由・詳細</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">申請日</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">状態</th>
                  <th className="text-left px-6 py-3 text-sub font-medium text-subtext">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {displayRequests.map(r => {
                  const shiftType = r.shiftTypeId ? shiftTypeMap.get(r.shiftTypeId) : null;
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-text">
                        {r.user ? `${r.user.lastName} ${r.user.firstName}` : '—'}
                      </td>
                      <td className="px-6 py-4 text-sub text-text">
                        {REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType}
                      </td>
                      <td className="px-6 py-4 text-sub text-subtext">{formatDate(r.targetDate)}</td>
                      <td className="px-6 py-4 text-sub">
                        {shiftType ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium text-white" style={{ backgroundColor: shiftType.color ?? '#94A3B8' }}>
                            {shiftType.name}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-6 py-4 text-sub text-subtext max-w-xs truncate">{r.reason || '—'}</td>
                      <td className="px-6 py-4 text-sub text-subtext">{formatDate(r.createdAt)}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? 'bg-gray-100 text-subtext'}`}>
                          {STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {r.status === 'PENDING' ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleReview(r.id, 'APPROVED')}
                              disabled={reviewingId === r.id}
                              className="text-success text-sub hover:underline disabled:opacity-50"
                            >
                              承認
                            </button>
                            <button
                              onClick={() => handleReview(r.id, 'REJECTED')}
                              disabled={reviewingId === r.id}
                              className="text-danger text-sub hover:underline disabled:opacity-50"
                            >
                              却下
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-subtext">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
