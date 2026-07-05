import { useState, useEffect, useCallback } from 'react';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import EmptyState from '../../components/common/EmptyState';
import { getOvertimeStatus } from '../../api/overtime';
import type { OvertimeStatusRow, OvertimeConfig, AlertLevel } from '../../types';

const ALERT_META: Record<AlertLevel, { label: string; cls: string; row: string }> = {
  NORMAL: { label: '✅ 正常', cls: 'bg-green-100 text-success', row: '' },
  WARNING: { label: '🟡 警告', cls: 'bg-yellow-100 text-warning', row: '' },
  EXCEEDED: { label: '🔴 超過', cls: 'bg-red-100 text-danger', row: 'bg-red-50' },
};

const now = new Date();

export default function OvertimePage() {
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rows, setRows] = useState<OvertimeStatusRow[]>([]);
  const [config, setConfig] = useState<OvertimeConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortMode, setSortMode] = useState<'kana' | 'alert'>('kana');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getOvertimeStatus({ year, month });
      setRows(res.data.rows);
      setConfig(res.data.config);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { load(); }, [load]);

  const prev = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const next = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const sorted = rows
    .filter(r => {
      const q = search.trim();
      if (!q) return true;
      return `${r.name}${r.nameKana ?? ''}`.toLowerCase().includes(q.toLowerCase());
    })
    .slice()
    .sort((a, b) => {
      if (sortMode === 'kana') return (a.nameKana ?? a.name).localeCompare(b.nameKana ?? b.name, 'ja');
      const rank = { EXCEEDED: 0, WARNING: 1, NORMAL: 2 } as const;
      return rank[a.alertLevel] - rank[b.alertLevel] || b.monthlyOvertimeHours - a.monthlyOvertimeHours;
    });

  const exportCsv = () => {
    const header = '氏名,今月残業(h),年度累計(h),状態';
    const lines = sorted.map(r => [r.name, r.monthlyOvertimeHours, r.yearlyTotalHours, ALERT_META[r.alertLevel].label.replace(/[✅🟡🔴 ]/g, '')].join(','));
    const csv = '﻿' + [header, ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `overtime_${year}_${month}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prev} className="btn-secondary px-3">←</button>
          <h1 className="text-heading font-bold text-text">{year}年{month}月 残業状況</h1>
          <button onClick={next} className="btn-secondary px-3">→</button>
        </div>
        <button onClick={exportCsv} className="btn-secondary">CSV出力</button>
      </div>

      {config && (
        <p className="text-sub text-subtext mb-4">
          36協定上限: 月 {config.monthlyLimitHours}h / 年 {config.yearlyLimitHours}h（警告閾値 {Math.round(config.warningThresholdRate * 100)}%）
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="スタッフ名で検索（氏名・カナ）"
          className="form-input w-full sm:w-80"
        />
        <div className="flex items-center gap-2 text-sub text-subtext">
          <span>並び順</span>
          <button onClick={() => setSortMode('kana')} className={sortMode === 'kana' ? 'btn-primary px-3 py-1' : 'btn-secondary px-3 py-1'}>あいうえお順</button>
          <button onClick={() => setSortMode('alert')} className={sortMode === 'alert' ? 'btn-primary px-3 py-1' : 'btn-secondary px-3 py-1'}>警告優先</button>
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        {loading ? <div className="py-16"><LoadingSpinner /></div>
          : rows.length === 0 ? <EmptyState icon="⚠️" title="残業データがありません" />
          : sorted.length === 0 ? <EmptyState icon="🔍" title="該当するスタッフがいません" description="検索条件を変更してください" />
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-sub">
                <thead className="bg-gray-50 border-b border-border text-left text-subtext">
                  <tr>
                    <th className="px-6 py-3">氏名</th>
                    <th className="px-6 py-3 text-right">今月残業</th>
                    <th className="px-6 py-3 text-right">年度累計</th>
                    <th className="px-6 py-3">状態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sorted.map(r => {
                    const m = ALERT_META[r.alertLevel];
                    return (
                      <tr key={r.userId} className={`hover:bg-gray-50 ${m.row}`}>
                        <td className="px-6 py-3 font-medium text-text">{r.name}</td>
                        <td className="px-6 py-3 text-right">{r.monthlyOvertimeHours}h</td>
                        <td className="px-6 py-3 text-right">{r.yearlyTotalHours}h</td>
                        <td className="px-6 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.cls}`}>{m.label}</span></td>
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
