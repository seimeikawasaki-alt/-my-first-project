import { useState, useEffect, useCallback } from 'react';
import { getShiftTypes } from '../../api/shiftTypes';
import { getShiftRequirements, bulkUpsertShiftRequirements } from '../../api/shiftRequirements';
import { getShiftRules, bulkUpdateShiftRules } from '../../api/shiftRules';
import type { ShiftType, ShiftRule } from '../../types';

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

const RULE_LABELS: Record<string, string> = {
  MAX_CONSECUTIVE_WORK_DAYS: '連続勤務上限日数',
  MAX_NIGHT_SHIFTS_PER_MONTH: '月の夜勤上限回数',
  MIN_REST_AFTER_NIGHT: '夜勤後の最低休息時間（時間）',
  MIN_DAYS_OFF_PER_MONTH: '月の最低公休日数',
  MAX_CONSECUTIVE_NIGHT: '連続夜勤の上限回数',
  MIN_SKILLED_PER_SHIFT: '各シフト最低有資格者数',
  MAX_WORK_HOURS_PER_WEEK: '週の最大労働時間',
};

// Key: "shiftTypeId|all" or "shiftTypeId|0" ... "shiftTypeId|6"
function makeKey(shiftTypeId: string, day: number | 'all') {
  return `${shiftTypeId}|${day}`;
}

type Tab = 'requirements' | 'rules';

export default function ShiftSettingsPage() {
  const [tab, setTab] = useState<Tab>('requirements');
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [rules, setRules] = useState<ShiftRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [reqGrid, setReqGrid] = useState<Map<string, number>>(new Map());
  const [ruleValues, setRuleValues] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, reqsRes, rulesRes] = await Promise.all([
        getShiftTypes(),
        getShiftRequirements(),
        getShiftRules(),
      ]);
      setShiftTypes(typesRes.data.filter(t => t.isActive));
      setRules(rulesRes.data);

      const grid = new Map<string, number>();
      reqsRes.data.forEach(r => {
        const key = makeKey(r.shiftTypeId, r.dayOfWeek ?? 'all');
        grid.set(key, r.requiredStaff);
      });
      setReqGrid(grid);

      const rv: Record<string, number> = {};
      rulesRes.data.forEach(r => { rv[r.ruleType] = r.value; });
      setRuleValues(rv);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const getReq = (shiftTypeId: string, day: number | 'all'): number | null => {
    const v = reqGrid.get(makeKey(shiftTypeId, day));
    return v == null ? null : v;
  };

  const setReq = (shiftTypeId: string, day: number | 'all', value: number) => {
    setReqGrid(prev => {
      const updated = new Map(prev);
      updated.set(makeKey(shiftTypeId, day), Math.max(0, value));
      return updated;
    });
  };

  const addReq = (shiftTypeId: string, day: number | 'all') => {
    setReqGrid(prev => {
      const key = makeKey(shiftTypeId, day);
      if (prev.has(key)) return prev;
      const updated = new Map(prev);
      updated.set(key, 1);
      return updated;
    });
  };

  const clearReq = (shiftTypeId: string, day: number | 'all') => {
    setReqGrid(prev => {
      const updated = new Map(prev);
      updated.delete(makeKey(shiftTypeId, day));
      return updated;
    });
  };

  const saveRequirements = async () => {
    setSaving(true);
    try {
      const data: Array<{
        shiftTypeId: string;
        dayOfWeek: number | null;
        requiredStaff: number;
        isActive: boolean;
      }> = [];

      reqGrid.forEach((val, key) => {
        if (val <= 0) return;
        const pipeIdx = key.indexOf('|');
        const shiftTypeId = key.slice(0, pipeIdx);
        const dayPart = key.slice(pipeIdx + 1);
        const dayOfWeek = dayPart === 'all' ? null : parseInt(dayPart);
        data.push({ shiftTypeId, dayOfWeek, requiredStaff: val, isActive: true });
      });

      if (data.length > 0) {
        await bulkUpsertShiftRequirements(data);
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      const data = Object.entries(ruleValues).map(([ruleType, value]) => ({ ruleType, value }));
      await bulkUpdateShiftRules(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      alert('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-subtext">読み込み中...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="text-heading font-bold text-text mb-6">シフト設定</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {([
          { key: 'requirements', label: 'シフト要件' },
          { key: 'rules', label: '生成ルール' },
        ] as const).map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2.5 text-sub font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-subtext hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Requirements Tab */}
      {tab === 'requirements' && (
        <div>
          <p className="text-sub text-subtext mb-4">各シフト種別・曜日ごとの必要人数を設定します。「全日」は曜日指定がない場合のデフォルトです。</p>

          {shiftTypes.length === 0 ? (
            <p className="text-center text-subtext py-8">アクティブなシフト種別がありません。先にシフト種別を登録してください。</p>
          ) : (
            <div className="overflow-auto">
              <table className="text-xs border-collapse bg-white border border-border rounded-lg" style={{ minWidth: '600px' }}>
                <thead>
                  <tr className="bg-gray-50">
                    <th className="border border-border px-3 py-2 text-left text-subtext font-medium min-w-28">シフト種別</th>
                    <th className="border border-border px-2 py-2 text-center text-subtext font-medium w-20">全日</th>
                    {DAYS_JA.map((d, i) => (
                      <th key={i} className={`border border-border px-2 py-2 text-center font-medium w-20 ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-subtext'}`}>
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shiftTypes.map(st => (
                    <tr key={st.id} className="hover:bg-gray-50">
                      <td className="border border-border px-3 py-2 font-medium text-text">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: st.color ?? '#94A3B8' }} />
                          {st.name}
                        </span>
                      </td>
                      {(['all', 0, 1, 2, 3, 4, 5, 6] as const).map(day => {
                        const req = getReq(st.id, day);
                        return (
                          <td key={String(day)} className="border border-border p-1 text-center align-top">
                            {req != null ? (
                              <div className="flex flex-col gap-0.5 items-center py-1">
                                <div className="flex items-center gap-0.5">
                                  <span className="text-subtext" style={{ fontSize: '10px' }}>必要</span>
                                  <input
                                    type="number"
                                    value={req}
                                    min={0}
                                    max={20}
                                    onChange={e => setReq(st.id, day, parseInt(e.target.value) || 0)}
                                    className="w-10 border border-border rounded px-1 py-0.5 text-center"
                                    style={{ fontSize: '11px' }}
                                  />
                                </div>
                                <button
                                  onClick={() => clearReq(st.id, day)}
                                  className="text-danger hover:underline mt-0.5"
                                  style={{ fontSize: '10px' }}
                                >
                                  削除
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => addReq(st.id, day)}
                                className="text-primary hover:underline px-2 py-2"
                                style={{ fontSize: '11px' }}
                              >
                                + 設定
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <button onClick={saveRequirements} disabled={saving} className="btn-primary">
              {saving ? '保存中...' : '要件を保存'}
            </button>
            {saved && <span className="text-success text-sub">保存しました</span>}
          </div>
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="max-w-lg">
          <p className="text-sub text-subtext mb-4">シフト自動生成時に使用するルールを設定します。</p>
          <div className="space-y-3">
            {rules.map(rule => (
              <div key={rule.ruleType} className="card flex items-center justify-between gap-4">
                <div className="flex-1">
                  <p className="text-sub font-medium text-text">{RULE_LABELS[rule.ruleType] ?? rule.ruleType}</p>
                </div>
                <input
                  type="number"
                  value={ruleValues[rule.ruleType] ?? rule.value}
                  min={0}
                  max={999}
                  onChange={e => setRuleValues(prev => ({
                    ...prev,
                    [rule.ruleType]: Math.max(0, parseInt(e.target.value) || 0),
                  }))}
                  className="form-input w-24 text-center"
                />
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button onClick={saveRules} disabled={saving} className="btn-primary">
              {saving ? '保存中...' : 'ルールを保存'}
            </button>
            {saved && <span className="text-success text-sub">保存しました</span>}
          </div>
        </div>
      )}
    </div>
  );
}
