import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { groupsApi } from '../../api/groups';
import { staffApi } from '../../api/staff';
import { getShiftTypes } from '../../api/shiftTypes';
import { getShiftRequirements, bulkUpsertShiftRequirements } from '../../api/shiftRequirements';
import { getGroupShiftConfig, upsertGroupShiftConfig } from '../../api/groupShiftConfig';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { matchStaff, compareKana } from '../../utils/staffSort';
import type { Group, ShiftType, ShiftRequirement, GroupShiftConfig, User } from '../../types';

const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];
const PRESET_COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6B7280'];
const SKILL_LABELS: Record<string, string> = { LEADER: 'リーダー', SENIOR: 'シニア', NORMAL: '一般', TRAINEE: '研修中' };

type Tab = 'info' | 'requirements' | 'rules' | 'members';

export default function GroupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const [shiftTypes, setShiftTypes] = useState<ShiftType[]>([]);
  const [requirements, setRequirements] = useState<ShiftRequirement[]>([]);
  const [config, setConfig] = useState<GroupShiftConfig | null>(null);
  const [allStaff, setAllStaff] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('info');

  // Info tab state
  const [infoForm, setInfoForm] = useState({ name: '', color: '#2563EB', description: '' });
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoMsg, setInfoMsg] = useState('');

  // Requirements tab state (shiftTypeId|dayOfWeek → requiredStaff)
  const [reqGrid, setReqGrid] = useState<Map<string, number>>(new Map());
  const [reqSaving, setReqSaving] = useState(false);
  const [reqMsg, setReqMsg] = useState('');

  // Rules tab state
  const [ruleForm, setRuleForm] = useState({
    maxConsecutive: '' as string,
    maxNightPerMonth: '' as string,
    enableFairDistribution: true,
    fairDistributionTarget: 'ALL' as 'ALL' | 'NIGHT' | 'EARLY',
  });
  const [ruleSaving, setRuleSaving] = useState(false);
  const [ruleMsg, setRuleMsg] = useState('');

  // Members tab state
  const [addUserId, setAddUserId] = useState('');
  const [addSkill, setAddSkill] = useState('NORMAL');
  const [addIsLeader, setAddIsLeader] = useState(false);
  const [memberMsg, setMemberMsg] = useState('');
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [groupsRes, typesRes, reqRes, configRes, staffRes] = await Promise.all([
        groupsApi.list(),
        getShiftTypes(),
        getShiftRequirements({ groupId: id }),
        getGroupShiftConfig(id),
        staffApi.list({ per_page: 200 }),
      ]);
      const found = groupsRes.data.data.find((g: Group) => g.id === id) ?? null;
      setGroup(found);
      if (found) {
        setInfoForm({ name: found.name, color: found.color || '#2563EB', description: found.description || '' });
      }
      setShiftTypes(typesRes.data.filter((t: ShiftType) => t.isActive));
      setRequirements(reqRes.data);
      setConfig(configRes);
      if (configRes) {
        setRuleForm({
          maxConsecutive: configRes.maxConsecutive != null ? String(configRes.maxConsecutive) : '',
          maxNightPerMonth: configRes.maxNightPerMonth != null ? String(configRes.maxNightPerMonth) : '',
          enableFairDistribution: configRes.enableFairDistribution,
          fairDistributionTarget: configRes.fairDistributionTarget,
        });
      }

      // Build requirements grid
      const grid = new Map<string, number>();
      for (const r of reqRes.data) {
        const key = `${r.shiftTypeId}|${r.dayOfWeek ?? 'all'}`;
        grid.set(key, r.requiredStaff);
      }
      setReqGrid(grid);

      setAllStaff(staffRes.data.data.filter((u: User) => u.role !== 'ADMIN'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleInfoSave = async () => {
    if (!id || !infoForm.name.trim()) return;
    setInfoSaving(true);
    setInfoMsg('');
    try {
      await groupsApi.update(id, { name: infoForm.name, color: infoForm.color, description: infoForm.description || null });
      setInfoMsg('保存しました');
      load();
    } catch {
      setInfoMsg('保存に失敗しました');
    } finally {
      setInfoSaving(false);
    }
  };

  const handleReqSave = async () => {
    if (!id) return;
    setReqSaving(true);
    setReqMsg('');
    try {
      const entries: Array<{ shiftTypeId: string; dayOfWeek: number | null; requiredStaff: number; groupId: string; isActive: boolean }> = [];
      for (const [key, requiredStaff] of reqGrid.entries()) {
        if (requiredStaff <= 0) continue;
        const sepIdx = key.indexOf('|');
        const shiftTypeId = key.slice(0, sepIdx);
        const dayPart = key.slice(sepIdx + 1);
        const dayOfWeek = dayPart === 'all' ? null : parseInt(dayPart);
        entries.push({ shiftTypeId, dayOfWeek, requiredStaff, groupId: id, isActive: true });
      }
      // Remove existing group-specific requirements, then bulk upsert
      for (const req of requirements.filter(r => r.groupId === id)) {
        await import('../../api/shiftRequirements').then(m => m.deleteShiftRequirement(req.id));
      }
      if (entries.length > 0) {
        await bulkUpsertShiftRequirements(entries);
      }
      setReqMsg('保存しました');
      load();
    } catch {
      setReqMsg('保存に失敗しました');
    } finally {
      setReqSaving(false);
    }
  };

  const handleRuleSave = async () => {
    if (!id) return;
    setRuleSaving(true);
    setRuleMsg('');
    try {
      await upsertGroupShiftConfig(id, {
        maxConsecutive: ruleForm.maxConsecutive ? parseInt(ruleForm.maxConsecutive) : null,
        maxNightPerMonth: ruleForm.maxNightPerMonth ? parseInt(ruleForm.maxNightPerMonth) : null,
        enableFairDistribution: ruleForm.enableFairDistribution,
        fairDistributionTarget: ruleForm.fairDistributionTarget,
      });
      setRuleMsg('保存しました');
      load();
    } catch {
      setRuleMsg('保存に失敗しました');
    } finally {
      setRuleSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!id || !addUserId) return;
    setMemberMsg('');
    try {
      await groupsApi.addMember(id, { userId: addUserId, isLeader: addIsLeader });
      setAddUserId('');
      setMemberMsg('追加しました');
      load();
    } catch {
      setMemberMsg('追加に失敗しました');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!id) return;
    if (!confirm('このメンバーを削除しますか？')) return;
    await groupsApi.removeMember(id, userId);
    load();
  };

  const memberIds = new Set(group?.members?.map(m => m.id) ?? []);
  const availableStaff = allStaff
    .filter(s => !memberIds.has(s.id) && matchStaff(s, memberSearch))
    .slice()
    .sort(compareKana);

  const TABS: { key: Tab; label: string }[] = [
    { key: 'info', label: '基本情報' },
    { key: 'requirements', label: '必要人数設定' },
    { key: 'rules', label: 'ルール設定' },
    { key: 'members', label: 'メンバー' },
  ];

  if (loading) {
    return <div className="flex items-center justify-center py-24"><LoadingSpinner /></div>;
  }

  if (!group) {
    return (
      <div className="p-8 text-center text-subtext">
        グループが見つかりません
        <button onClick={() => navigate('/admin/groups')} className="block mx-auto mt-4 btn-secondary">戻る</button>
      </div>
    );
  }

  const setReqVal = (key: string, v: number) =>
    setReqGrid(prev => { const m = new Map(prev); m.set(key, Math.max(0, Math.min(20, v))); return m; });
  const clearReqVal = (key: string) =>
    setReqGrid(prev => { const m = new Map(prev); m.delete(key); return m; });

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/admin/groups')} className="text-subtext hover:text-text text-sub">← 戻る</button>
        <div className="w-8 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: group.color || '#6B7280' }} />
        <h1 className="text-heading font-bold text-text">{group.name}</h1>
        <span className="text-sub text-subtext">{group.memberCount ?? 0}名</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border mb-6">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-5 py-3 text-sub font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.key ? 'border-primary text-primary' : 'border-transparent text-subtext hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: 基本情報 */}
      {activeTab === 'info' && (
        <div className="space-y-4 max-w-md">
          <div>
            <label className="form-label">グループ名 <span className="text-danger">*</span></label>
            <input
              type="text"
              value={infoForm.name}
              onChange={e => setInfoForm(p => ({ ...p, name: e.target.value }))}
              className="form-input"
            />
          </div>
          <div>
            <label className="form-label">カラー</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PRESET_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setInfoForm(p => ({ ...p, color }))}
                  className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 ${infoForm.color === color ? 'border-text scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="form-label">説明</label>
            <textarea
              value={infoForm.description}
              onChange={e => setInfoForm(p => ({ ...p, description: e.target.value }))}
              className="form-input resize-none"
              rows={2}
            />
          </div>
          {infoMsg && <p className={`text-sub ${infoMsg.includes('失敗') ? 'text-danger' : 'text-primary'}`}>{infoMsg}</p>}
          <button onClick={handleInfoSave} disabled={infoSaving} className="btn-primary disabled:opacity-60">
            {infoSaving ? '保存中...' : '変更を保存'}
          </button>
        </div>
      )}

      {/* Tab: 必要人数設定 */}
      {activeTab === 'requirements' && (
        <div>
          <p className="text-sub text-subtext mb-1">このグループ専用の<span className="font-semibold text-text">1日あたりの必要人数</span>を設定します（任意）。</p>
          <p className="text-xs text-subtext mb-5">
            すべて空欄なら「シフト設定」の全体設定を使用します。
            <span className="text-danger">数字を入れるとこのグループはその内容だけで生成され、全体設定は使われません</span>（必要なシフト種別はすべて入力してください）。「全日」は曜日指定がない場合の既定値です。
          </p>
          <div className="overflow-x-auto pb-1">
            <table className="w-full border-collapse bg-white border border-border rounded-xl overflow-hidden" style={{ minWidth: '860px' }}>
              <thead>
                <tr className="bg-gray-50">
                  <th className="border border-border px-3 py-3 text-left text-sub text-subtext font-semibold" style={{ width: '120px' }}>シフト種別</th>
                  <th className="border border-border px-1 py-3 text-center text-sub font-semibold text-text bg-blue-50">全日</th>
                  {WEEKDAY_JA.map((d, i) => (
                    <th key={i} className={`border border-border px-1 py-3 text-center text-sub font-semibold ${i === 0 ? 'text-danger' : i === 6 ? 'text-primary' : 'text-subtext'}`}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftTypes.map(st => (
                  <tr key={st.id} className="hover:bg-gray-50/50">
                    <td className="border border-border px-3 py-3 font-semibold">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: st.color ?? '#94A3B8' }} />
                        <span className="text-base text-text">{st.name}</span>
                      </span>
                    </td>
                    {(['all', 0, 1, 2, 3, 4, 5, 6] as const).map(day => {
                      const key = `${st.id}|${day}`;
                      const raw = reqGrid.get(key);
                      const cur = raw ?? 0;
                      const isAll = day === 'all';
                      return (
                        <td key={String(day)} className={`border border-border p-1.5 align-middle ${isAll ? 'bg-blue-50/40' : ''}`}>
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => { const n = cur - 1; if (n <= 0) clearReqVal(key); else setReqVal(key, n); }}
                              className="w-7 h-8 flex-shrink-0 flex items-center justify-center rounded-md bg-gray-100 hover:bg-gray-200 active:scale-95 text-lg font-bold text-text leading-none transition"
                              aria-label="減らす"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={raw ?? ''}
                              placeholder="—"
                              onChange={e => {
                                const rawv = e.target.value;
                                if (rawv === '') clearReqVal(key);
                                else setReqVal(key, parseInt(rawv) || 0);
                              }}
                              className="w-9 h-8 border border-border rounded-md text-center text-base font-bold text-text placeholder:text-gray-300 placeholder:font-normal focus:border-primary focus:ring-1 focus:ring-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                            />
                            <button
                              type="button"
                              onClick={() => setReqVal(key, cur + 1)}
                              className="w-7 h-8 flex-shrink-0 flex items-center justify-center rounded-md bg-primary/10 hover:bg-primary/20 active:scale-95 text-lg font-bold text-primary leading-none transition"
                              aria-label="増やす"
                            >
                              ＋
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reqMsg && <p className={`text-sub mt-3 ${reqMsg.includes('失敗') ? 'text-danger' : 'text-primary'}`}>{reqMsg}</p>}
          <button onClick={handleReqSave} disabled={reqSaving} className="btn-primary mt-6 disabled:opacity-60">
            {reqSaving ? '保存中...' : '必要人数を保存'}
          </button>
        </div>
      )}

      {/* Tab: ルール設定 */}
      {activeTab === 'rules' && (
        <div className="space-y-5 max-w-md">
          <p className="text-sub text-subtext">グループ固有のルールを設定します。未設定の場合はグローバルルールを使用します。</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">最大連続勤務日数</label>
              <input
                type="number"
                min={1}
                max={14}
                value={ruleForm.maxConsecutive}
                onChange={e => setRuleForm(p => ({ ...p, maxConsecutive: e.target.value }))}
                className="form-input"
                placeholder="グローバル設定を使用"
              />
            </div>
            <div>
              <label className="form-label">最大夜勤回数/月</label>
              <input
                type="number"
                min={1}
                max={20}
                value={ruleForm.maxNightPerMonth}
                onChange={e => setRuleForm(p => ({ ...p, maxNightPerMonth: e.target.value }))}
                className="form-input"
                placeholder="グローバル設定を使用"
              />
            </div>
          </div>

          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sub font-medium text-text">均等分配</p>
                <p className="text-xs text-subtext mt-0.5">夜勤・早番の割り当てをグループ内で均等化します</p>
              </div>
              <button
                type="button"
                onClick={() => setRuleForm(p => ({ ...p, enableFairDistribution: !p.enableFairDistribution }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${ruleForm.enableFairDistribution ? 'bg-primary' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${ruleForm.enableFairDistribution ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {ruleForm.enableFairDistribution && (
              <div>
                <label className="form-label text-xs">分配対象</label>
                <div className="flex gap-2 mt-1">
                  {([['ALL', '全シフト'], ['NIGHT', '夜勤のみ'], ['EARLY', '早番のみ']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setRuleForm(p => ({ ...p, fairDistributionTarget: val }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${ruleForm.fairDistributionTarget === val ? 'bg-primary text-white border-primary' : 'border-border text-text hover:bg-gray-50'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {ruleMsg && <p className={`text-sub ${ruleMsg.includes('失敗') ? 'text-danger' : 'text-primary'}`}>{ruleMsg}</p>}
          <button onClick={handleRuleSave} disabled={ruleSaving} className="btn-primary disabled:opacity-60">
            {ruleSaving ? '保存中...' : 'ルールを保存'}
          </button>
        </div>
      )}

      {/* Tab: メンバー */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Add member */}
          <div className="p-4 bg-gray-50 border border-border rounded-lg">
            <p className="text-sub font-medium mb-3">メンバーを追加</p>
            <div className="flex gap-2 flex-wrap items-end">
              <div className="flex-1 min-w-48">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={e => setMemberSearch(e.target.value)}
                  placeholder="スタッフ検索（氏名・フリガナ・ID）"
                  className="form-input mb-2"
                />
                <select value={addUserId} onChange={e => setAddUserId(e.target.value)} className="form-input" size={memberSearch ? 5 : 1}>
                  <option value="">スタッフを選択...（{availableStaff.length}名）</option>
                  {availableStaff.map(s => (
                    <option key={s.id} value={s.id}>{s.lastName} {s.firstName} ({s.userCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <select value={addSkill} onChange={e => setAddSkill(e.target.value)} className="form-input text-xs">
                  {Object.entries(SKILL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-sub cursor-pointer">
                <input type="checkbox" checked={addIsLeader} onChange={e => setAddIsLeader(e.target.checked)} className="w-4 h-4" />
                リーダー
              </label>
              <button onClick={handleAddMember} disabled={!addUserId} className="btn-primary disabled:opacity-60">追加</button>
            </div>
            {memberMsg && <p className={`text-xs mt-2 ${memberMsg.includes('失敗') ? 'text-danger' : 'text-primary'}`}>{memberMsg}</p>}
          </div>

          {/* Member list */}
          <div>
            <p className="text-sub font-medium mb-2">現在のメンバー ({group.members?.length ?? 0}名)</p>
            {!group.members?.length ? (
              <p className="text-subtext text-sub py-6 text-center">メンバーがいません</p>
            ) : (
              <div className="space-y-2">
                {group.members.map(member => (
                  <div key={member.id} className="flex items-center justify-between p-3 bg-white border border-border rounded-lg">
                    <div className="flex items-center gap-2">
                      {member.isLeader && <span className="text-warning text-sm">★</span>}
                      <span className="font-medium text-text">{member.lastName} {member.firstName}</span>
                      <span className="text-xs text-subtext">{member.userCode}</span>
                      <span className="text-xs text-subtext bg-gray-100 px-2 py-0.5 rounded">{member.employmentType}</span>
                    </div>
                    <button onClick={() => handleRemoveMember(member.id)} className="text-danger text-xs hover:underline">削除</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
