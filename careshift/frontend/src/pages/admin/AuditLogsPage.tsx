import { useState, useEffect, useCallback } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { getAuditLogs } from '../../api/auditLogs';
import type { AuditLog } from '../../types';

const ACTION_LABELS: Record<string, string> = {
  LOGIN_SUCCESS: 'ログイン', LOGIN_FAILED: 'ログイン失敗', LOGOUT: 'ログアウト',
  STAFF_CREATE: 'スタッフ登録', STAFF_UPDATE: 'スタッフ更新', STAFF_DEACTIVATE: 'スタッフ無効化',
  ATTENDANCE_MODIFY: '勤怠データ修正',
  PAYROLL_CALCULATE: '給与計算', PAYROLL_CONFIRM: '給与確定',
  SHIFT_PUBLISH: 'シフト公開', SHIFT_AUTO_GENERATE: 'シフト自動生成',
  PERMISSION_DENIED: '権限エラー',
};

const ACTION_OPTIONS = Object.keys(ACTION_LABELS);

const fmt = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [nameSearch, setNameSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs({ action: action || undefined, from: from || undefined, to: to || undefined, per_page: 200 });
      setLogs(res.data);
    } finally {
      setLoading(false);
    }
  }, [action, from, to]);

  useEffect(() => { load(); }, [load]);

  const display = logs.filter(l => {
    if (!nameSearch.trim()) return true;
    const nm = l.user ? `${l.user.lastName} ${l.user.firstName} ${l.user.userCode}` : '';
    return nm.includes(nameSearch.trim());
  });

  const targetText = (l: AuditLog) => {
    if (!l.targetType && !l.targetId) return '—';
    return `${l.targetType ?? ''}${l.targetId ? `: ${l.targetId}` : ''}`;
  };

  const exportCsv = () => {
    const header = '日時,ユーザー,操作,対象,IP';
    const lines = display.map(l => [
      fmt(l.createdAt),
      l.user ? `${l.user.lastName} ${l.user.firstName}` : l.userId,
      ACTION_LABELS[l.action] ?? l.action,
      `"${targetText(l).replace(/"/g, '""')}"`,
      l.ipAddress ?? '',
    ].join(','));
    const csv = '﻿' + [header, ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = 'audit_logs.csv'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h1 className="text-heading font-bold text-text">監査ログ</h1>
        <button onClick={exportCsv} className="btn-secondary">CSV出力</button>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select value={action} onChange={e => setAction(e.target.value)} className="input py-2 text-sub w-auto">
          <option value="">操作 : すべて</option>
          {ACTION_OPTIONS.map(a => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
        </select>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="input py-2 text-sub w-auto" title="開始日" />
        <span className="text-subtext">〜</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="input py-2 text-sub w-auto" title="終了日" />
        <input type="text" value={nameSearch} onChange={e => setNameSearch(e.target.value)} placeholder="ユーザー検索" className="input py-2 text-sub w-36" />
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="py-16"><LoadingSpinner /></div>
          : display.length === 0 ? <EmptyState icon="📋" title="ログがありません" />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sub">
                <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                  <tr>
                    <th className="px-6 py-3">日時</th>
                    <th className="px-6 py-3">ユーザー</th>
                    <th className="px-6 py-3">操作</th>
                    <th className="px-6 py-3">対象</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {display.map(l => (
                    <tr key={l.id} className="hover:bg-gray-50">
                      <td className="px-6 py-2.5 text-subtext whitespace-nowrap">{fmt(l.createdAt)}</td>
                      <td className="px-6 py-2.5 font-medium text-text">{l.user ? `${l.user.lastName} ${l.user.firstName}` : l.userId}</td>
                      <td className="px-6 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${l.action === 'PERMISSION_DENIED' || l.action === 'LOGIN_FAILED' ? 'bg-red-100 text-danger' : 'bg-gray-100 text-text'}`}>
                          {ACTION_LABELS[l.action] ?? l.action}
                        </span>
                      </td>
                      <td className="px-6 py-2.5 text-subtext max-w-xs truncate">{targetText(l)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </div>
    </div>
  );
}
