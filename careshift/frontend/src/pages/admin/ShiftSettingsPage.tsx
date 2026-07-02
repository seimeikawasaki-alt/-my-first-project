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
      // Only the global defaults (groupId=null); per-group overrides are edited
      // on each group's detail page.
      reqsRes.data.filter(r => r.groupId == null).forEach(r => {
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
    <div className="p-6 max-w-6xl">
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
          <p className="text-sub text-subtext mb-1">各シフト種別・曜日ごとの<span className="font-semibold text-text">必要人数</span>を設定します。</p>
          <p className="text-xs text-subtext mb-5">「全日」は曜日ごとの指定がない場合の既定値です。曜日欄を設定するとその曜日だけ上書きされます。空欄はその区分の要件なし。</p>

          {shiftTypes.length === 0 ? (
            <p className="text-center text-subtext py-8">アクティブなシフト種別がありません。先にシフト種別を登録してください。</p>
          ) : (
            <table className="w-full table-fixed border-collapse bg-white border border-border rounded-xl overflow-hidden">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-border px-3 py-3 text-left text-sub text-subtext font-semibold" style={{ width: '16%' }}>シフト種別</th>
                  <th className="border border-border px-1 py-3 text-center text-sub font-semibold text-text bg-blue-50" style={{ width: '12%' }}>全日</th>
                  {DAYS_JA.map((d, i) => (
                    <th key={i} className={`border border-border px-1 py-3 text-center text-sub font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-subtext'}`}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftTypes.map(st => (
                  <tr key={st.id} className="hover:bg-gray-50/50">
                    <td className="border border-border px-3 py-3 font-semibold text-text">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: st.color ?? '#94A3B8' }} />
                        <span className="text-base">{st.name}</span>
                      </span>
                    </td>
                    {(['all', 0, 1, 2, 3, 4, 5, 6] as const).map(day => {
                      const req = getReq(st.id, day);
                      const isAll = day === 'all';
                      return (
                        <td key={String(day)} className={`border border-border p-1.5 text-center align-middle ${isAll ? 'bg-blue-50/40' : ''}`}>
                          <input
                            type="number"
                            min={0}
                            max={20}
                            value={req ?? ''}
                            placeholder="—"
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw === '') clearReq(st.id, day);
                              else setReq(st.id, day, parseInt(raw) || 0);
                            }}
                            className="w-full h-10 border border-border rounded-md text-center text-lg font-semibold text-text placeholder:text-gray-300 placeholder:font-normal focus:border-primary focus:ring-1 focus:ring-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-6 flex items-center gap-3">
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
