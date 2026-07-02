import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { staffApi, StaffCreateRequest } from '../../api/staff';
import { groupsApi } from '../../api/groups';
import { getStaffConstraint, upsertStaffConstraint } from '../../api/staffConstraints';
import type { Group, StaffConstraint, SkillLevel } from '../../types';
import LoadingSpinner from '../../components/common/LoadingSpinner';
import { AxiosError } from 'axios';

interface FormErrors {
  [key: string]: string;
}

interface ApiErrorResponse {
  error: {
    message: string;
    details?: { field: string; message: string }[];
  };
}

const initialForm: StaffCreateRequest = {
  userCode: '',
  password: '',
  role: 'STAFF',
  lastName: '',
  firstName: '',
  lastNameKana: '',
  firstNameKana: '',
  employmentType: 'FULL_TIME',
  hourlyWage: null,
  monthlySalary: null,
  email: null,
  phone: null,
  hireDate: null,
  groupIds: [],
  isActive: true,
};

const DAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  TRAINEE: '見習い',
  NORMAL: '通常',
  SENIOR: 'シニア',
  LEADER: 'リーダー',
};

type Tab = 'info' | 'constraint';

export default function StaffFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [activeTab, setActiveTab] = useState<Tab>('info');
  const [form, setForm] = useState<StaffCreateRequest>(initialForm);
  const [groups, setGroups] = useState<Group[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState('');
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // Constraint state
  const [constraint, setConstraint] = useState<Partial<StaffConstraint>>({
    skillLevel: 'NORMAL',
    canWorkNight: true,
    requiresPairing: false,
    maxWorkDaysPerMonth: null,
    maxNightShifts: null,
    availableDays: null,
    unavailableDates: null,
    notes: null,
  });
  const [constraintSaving, setConstraintSaving] = useState(false);
  const [constraintSaved, setConstraintSaved] = useState(false);
  const [unavailableDateInput, setUnavailableDateInput] = useState('');

  useEffect(() => {
    groupsApi.list().then(res => setGroups(res.data.data));
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      setIsLoading(true);
      Promise.all([
        staffApi.get(id),
        getStaffConstraint(id),
      ]).then(([staffRes, constraintRes]) => {
        const user = staffRes.data.data;
        setForm({
          userCode: user.userCode,
          password: '',
          role: user.role,
          lastName: user.lastName,
          firstName: user.firstName,
          lastNameKana: user.lastNameKana || '',
          firstNameKana: user.firstNameKana || '',
          employmentType: user.employmentType,
          hourlyWage: user.hourlyWage ? parseFloat(user.hourlyWage) : null,
          monthlySalary: user.monthlySalary ? parseFloat(user.monthlySalary) : null,
          email: user.email || null,
          phone: user.phone || null,
          hireDate: user.hireDate ? user.hireDate.slice(0, 10) : null,
          groupIds: user.groups?.map((g: { id: string }) => g.id) || [],
          isActive: user.isActive,
        });
        const c = constraintRes.data;
        if (c) {
          setConstraint({
            skillLevel: (c as StaffConstraint).skillLevel ?? 'NORMAL',
            canWorkNight: (c as StaffConstraint).canWorkNight ?? true,
            requiresPairing: (c as StaffConstraint).requiresPairing ?? false,
            maxWorkDaysPerMonth: (c as StaffConstraint).maxWorkDaysPerMonth ?? null,
            maxNightShifts: (c as StaffConstraint).maxNightShifts ?? null,
            availableDays: (c as StaffConstraint).availableDays ?? null,
            unavailableDates: (c as StaffConstraint).unavailableDates ?? null,
            notes: (c as StaffConstraint).notes ?? null,
          });
        }
        setIsLoading(false);
      }).catch(() => setIsLoading(false));
    }
  }, [id, isNew]);

  const handleChange = (field: keyof StaffCreateRequest, value: unknown) => {
    setForm(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const toggleGroup = (groupId: string) => {
    setForm(prev => {
      const ids = prev.groupIds || [];
      return {
        ...prev,
        groupIds: ids.includes(groupId)
          ? ids.filter(id => id !== groupId)
          : [...ids, groupId],
      };
    });
  };

  const toggleAvailableDay = (day: number) => {
    setConstraint(prev => {
      const current = prev.availableDays ?? [];
      const next = current.includes(day) ? current.filter(d => d !== day) : [...current, day];
      return { ...prev, availableDays: next.length > 0 ? next.sort() : null };
    });
  };

  const addUnavailableDate = () => {
    if (!unavailableDateInput) return;
    setConstraint(prev => {
      const current = prev.unavailableDates ?? [];
      if (current.includes(unavailableDateInput)) return prev;
      return { ...prev, unavailableDates: [...current, unavailableDateInput].sort() };
    });
    setUnavailableDateInput('');
  };

  const removeUnavailableDate = (date: string) => {
    setConstraint(prev => ({
      ...prev,
      unavailableDates: (prev.unavailableDates ?? []).filter(d => d !== date),
    }));
  };

  const validate = (): boolean => {
    const newErrors: FormErrors = {};
    if (!form.userCode) newErrors.userCode = 'ユーザーIDは必須です';
    if (isNew && !form.password) newErrors.password = 'パスワードは必須です';
    if (!form.lastName) newErrors.lastName = '姓は必須です';
    if (!form.firstName) newErrors.firstName = '名は必須です';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    setGlobalError('');

    try {
      const submitData = {
        ...form,
        hourlyWage: form.hourlyWage || null,
        monthlySalary: form.monthlySalary || null,
      };

      if (isNew) {
        await staffApi.create(submitData);
      } else {
        await staffApi.update(id!, submitData);
      }
      navigate('/admin/staff');
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      const apiError = axiosError.response?.data?.error;
      if (apiError?.details) {
        const fieldErrors: FormErrors = {};
        apiError.details.forEach(d => { fieldErrors[d.field] = d.message; });
        setErrors(fieldErrors);
      }
      setGlobalError(apiError?.message || '保存に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async () => {
    if (!id || isNew) return;
    const nextActive = !form.isActive;
    const label = nextActive ? '有効化' : '無効化';
    if (!window.confirm(`${form.lastName} ${form.firstName}さんを${label}しますか？`)) return;
    setIsTogglingActive(true);
    try {
      const submitData = {
        ...form,
        hourlyWage: form.hourlyWage || null,
        monthlySalary: form.monthlySalary || null,
        isActive: nextActive,
      };
      await staffApi.update(id, submitData);
      setForm(prev => ({ ...prev, isActive: nextActive }));
    } catch {
      alert(`${label}に失敗しました`);
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleConstraintSave = async () => {
    if (!id || isNew) return;
    setConstraintSaving(true);
    try {
      await upsertStaffConstraint(id, {
        skillLevel: constraint.skillLevel ?? 'NORMAL',
        canWorkNight: constraint.canWorkNight ?? true,
        requiresPairing: constraint.requiresPairing ?? false,
        maxWorkDaysPerMonth: constraint.maxWorkDaysPerMonth ?? null,
        maxNightShifts: constraint.maxNightShifts ?? null,
        availableDays: constraint.availableDays ?? null,
        unavailableDates: constraint.unavailableDates ?? null,
        notes: constraint.notes ?? null,
      });
      setConstraintSaved(true);
      setTimeout(() => setConstraintSaved(false), 2000);
    } catch {
      alert('制約の保存に失敗しました');
    } finally {
      setConstraintSaving(false);
    }
  };

  if (isLoading) return <div className="p-8"><LoadingSpinner /></div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => navigate('/admin/staff')} className="text-subtext hover:text-text text-sub mb-2 flex items-center gap-1">
          ← スタッフ一覧に戻る
        </button>
        <div className="flex items-center justify-between">
          <h1 className="text-heading font-bold text-text">
            {isNew ? 'スタッフ登録' : 'スタッフ編集'}
          </h1>
          {!isNew && (
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${form.isActive ? 'bg-green-100 text-success' : 'bg-gray-200 text-subtext'}`}>
                {form.isActive ? '有効' : '無効化済み'}
              </span>
              <button
                type="button"
                onClick={handleToggleActive}
                disabled={isTogglingActive}
                className={`text-sub hover:underline disabled:opacity-50 ${form.isActive ? 'text-danger' : 'text-primary'}`}
              >
                {isTogglingActive ? '処理中...' : form.isActive ? '無効化する' : '有効化する'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs (edit mode only) */}
      {!isNew && (
        <div className="flex gap-1 mb-6 border-b border-border">
          {([
            { key: 'info', label: '基本情報' },
            { key: 'constraint', label: 'シフト制約' },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-5 py-2.5 text-sub font-medium border-b-2 transition-colors ${
                activeTab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-subtext hover:text-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Info Tab */}
      {(isNew || activeTab === 'info') && (
        <>
          {globalError && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-danger text-sub">
              {globalError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Account */}
            <div className="card space-y-4">
              <h2 className="text-card-title font-bold">アカウント情報</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">ユーザーID <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={form.userCode}
                    onChange={e => handleChange('userCode', e.target.value)}
                    className={`form-input ${errors.userCode ? 'border-danger' : ''}`}
                    placeholder="例: staff001"
                  />
                  {errors.userCode && <p className="text-danger text-xs mt-1">{errors.userCode}</p>}
                </div>
                <div>
                  <label className="form-label">
                    パスワード {isNew && <span className="text-danger">*</span>}
                    {!isNew && <span className="text-subtext text-xs ml-1">（変更する場合のみ入力）</span>}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={e => handleChange('password', e.target.value)}
                    className={`form-input ${errors.password ? 'border-danger' : ''}`}
                    placeholder={isNew ? '8文字以上・大小英字・数字を含む' : '変更しない場合は空白'}
                  />
                  {errors.password && <p className="text-danger text-xs mt-1">{errors.password}</p>}
                </div>
              </div>
              <div>
                <label className="form-label">ロール</label>
                <select
                  value={form.role}
                  onChange={e => handleChange('role', e.target.value)}
                  className="form-input w-auto"
                >
                  <option value="STAFF">スタッフ</option>
                  <option value="GROUP_LEADER">グループリーダー</option>
                  <option value="ADMIN">管理者</option>
                </select>
              </div>
            </div>

            {/* Profile */}
            <div className="card space-y-4">
              <h2 className="text-card-title font-bold">基本情報</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">姓 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={e => handleChange('lastName', e.target.value)}
                    className={`form-input ${errors.lastName ? 'border-danger' : ''}`}
                    placeholder="田中"
                  />
                  {errors.lastName && <p className="text-danger text-xs mt-1">{errors.lastName}</p>}
                </div>
                <div>
                  <label className="form-label">名 <span className="text-danger">*</span></label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={e => handleChange('firstName', e.target.value)}
                    className={`form-input ${errors.firstName ? 'border-danger' : ''}`}
                    placeholder="花子"
                  />
                  {errors.firstName && <p className="text-danger text-xs mt-1">{errors.firstName}</p>}
                </div>
                <div>
                  <label className="form-label">姓（フリガナ）</label>
                  <input
                    type="text"
                    value={form.lastNameKana || ''}
                    onChange={e => handleChange('lastNameKana', e.target.value)}
                    className="form-input"
                    placeholder="タナカ"
                  />
                </div>
                <div>
                  <label className="form-label">名（フリガナ）</label>
                  <input
                    type="text"
                    value={form.firstNameKana || ''}
                    onChange={e => handleChange('firstNameKana', e.target.value)}
                    className="form-input"
                    placeholder="ハナコ"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">メールアドレス</label>
                  <input
                    type="email"
                    value={form.email || ''}
                    onChange={e => handleChange('email', e.target.value || null)}
                    className="form-input"
                    placeholder="email@example.com"
                  />
                </div>
                <div>
                  <label className="form-label">電話番号</label>
                  <input
                    type="tel"
                    value={form.phone || ''}
                    onChange={e => handleChange('phone', e.target.value || null)}
                    className="form-input"
                    placeholder="090-0000-0000"
                  />
                </div>
              </div>
              <div>
                <label className="form-label">入社日</label>
                <input
                  type="date"
                  value={form.hireDate || ''}
                  onChange={e => handleChange('hireDate', e.target.value || null)}
                  className="form-input w-auto"
                />
              </div>
            </div>

            {/* Employment */}
            <div className="card space-y-4">
              <h2 className="text-card-title font-bold">雇用情報</h2>
              <div>
                <label className="form-label">雇用形態 <span className="text-danger">*</span></label>
                <select
                  value={form.employmentType}
                  onChange={e => handleChange('employmentType', e.target.value)}
                  className="form-input w-auto"
                >
                  <option value="FULL_TIME">正社員</option>
                  <option value="PART_TIME">パート</option>
                  <option value="CONTRACT">契約社員</option>
                </select>
              </div>
              {(form.employmentType === 'PART_TIME' || form.employmentType === 'CONTRACT') && (
                <div>
                  <label className="form-label">時給（円）</label>
                  <input
                    type="number"
                    value={form.hourlyWage ?? ''}
                    onChange={e => handleChange('hourlyWage', e.target.value ? parseFloat(e.target.value) : null)}
                    className="form-input w-40"
                    min="0"
                    placeholder="1200"
                  />
                </div>
              )}
              {form.employmentType === 'FULL_TIME' && (
                <div>
                  <label className="form-label">月給（円）</label>
                  <input
                    type="number"
                    value={form.monthlySalary ?? ''}
                    onChange={e => handleChange('monthlySalary', e.target.value ? parseFloat(e.target.value) : null)}
                    className="form-input w-48"
                    min="0"
                    placeholder="250000"
                  />
                </div>
              )}
            </div>

            {/* Groups */}
            <div className="card space-y-4">
              <h2 className="text-card-title font-bold">グループ割り当て</h2>
              {groups.length === 0 ? (
                <p className="text-subtext text-sub">グループがまだありません</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {groups.map(group => (
                    <label key={group.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={(form.groupIds || []).includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="w-4 h-4 rounded"
                      />
                      <span
                        className="px-3 py-1 rounded-full text-sm font-medium text-white"
                        style={{ backgroundColor: group.color || '#6B7280' }}
                      >
                        {group.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary disabled:opacity-60"
              >
                {isSubmitting ? '保存中...' : isNew ? '登録する' : '変更を保存'}
              </button>
              <button
                type="button"
                onClick={() => navigate('/admin/staff')}
                className="btn-secondary"
              >
                キャンセル
              </button>
            </div>
          </form>
        </>
      )}

      {/* Constraint Tab */}
      {!isNew && activeTab === 'constraint' && (
        <div className="space-y-6">
          {/* Skill Level */}
          <div className="card space-y-3">
            <h2 className="text-card-title font-bold">スキルレベル</h2>
            <div className="flex gap-2 flex-wrap">
              {(['TRAINEE', 'NORMAL', 'SENIOR', 'LEADER'] as SkillLevel[]).map(level => (
                <button
                  key={level}
                  onClick={() => setConstraint(c => ({ ...c, skillLevel: level }))}
                  className={`px-4 py-2 rounded-lg border text-sub transition-all ${
                    constraint.skillLevel === level
                      ? 'border-primary bg-blue-50 text-primary font-medium'
                      : 'border-border text-subtext hover:bg-gray-50'
                  }`}
                >
                  {SKILL_LEVEL_LABELS[level]}
                </button>
              ))}
            </div>
          </div>

          {/* Work limits */}
          <div className="card space-y-4">
            <h2 className="text-card-title font-bold">勤務制限</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">月最大勤務日数</label>
                <input
                  type="number"
                  value={constraint.maxWorkDaysPerMonth ?? ''}
                  onChange={e => setConstraint(c => ({ ...c, maxWorkDaysPerMonth: e.target.value ? parseInt(e.target.value) : null }))}
                  className="form-input w-28"
                  min="0"
                  max="31"
                  placeholder="制限なし"
                />
              </div>
              <div>
                <label className="form-label">月最大夜勤回数</label>
                <input
                  type="number"
                  value={constraint.maxNightShifts ?? ''}
                  onChange={e => setConstraint(c => ({ ...c, maxNightShifts: e.target.value ? parseInt(e.target.value) : null }))}
                  className="form-input w-28"
                  min="0"
                  max="31"
                  placeholder="制限なし"
                />
              </div>
            </div>
            <div className="flex gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-sub text-text">
                <input
                  type="checkbox"
                  checked={constraint.canWorkNight ?? true}
                  onChange={e => setConstraint(c => ({ ...c, canWorkNight: e.target.checked }))}
                  className="w-4 h-4"
                />
                夜勤可能
              </label>
              <label className="flex items-center gap-2 cursor-pointer text-sub text-text">
                <input
                  type="checkbox"
                  checked={constraint.requiresPairing ?? false}
                  onChange={e => setConstraint(c => ({ ...c, requiresPairing: e.target.checked }))}
                  className="w-4 h-4"
                />
                ペア勤務必須
              </label>
            </div>
          </div>

          {/* Available days */}
          <div className="card space-y-3">
            <h2 className="text-card-title font-bold">勤務可能曜日</h2>
            <p className="text-xs text-subtext">未選択の場合、全曜日可能とみなされます</p>
            <div className="flex gap-2">
              {DAYS_JA.map((day, i) => (
                <button
                  key={i}
                  onClick={() => toggleAvailableDay(i)}
                  className={`w-10 h-10 rounded-full border text-sub font-medium transition-all ${
                    (constraint.availableDays ?? []).includes(i)
                      ? (i === 0 ? 'bg-red-500 border-red-500 text-white' : i === 6 ? 'bg-blue-500 border-blue-500 text-white' : 'bg-primary border-primary text-white')
                      : 'border-border text-subtext hover:bg-gray-50'
                  }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          {/* Unavailable dates */}
          <div className="card space-y-3">
            <h2 className="text-card-title font-bold">勤務不可日</h2>
            <div className="flex gap-2">
              <input
                type="date"
                value={unavailableDateInput}
                onChange={e => setUnavailableDateInput(e.target.value)}
                className="form-input flex-1"
              />
              <button onClick={addUnavailableDate} className="btn-secondary px-4">追加</button>
            </div>
            {(constraint.unavailableDates ?? []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {(constraint.unavailableDates ?? []).map(date => (
                  <span key={date} className="flex items-center gap-1 bg-gray-100 text-subtext px-2 py-1 rounded-full text-xs">
                    {date}
                    <button onClick={() => removeUnavailableDate(date)} className="text-danger hover:text-red-700 ml-0.5">×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card space-y-3">
            <h2 className="text-card-title font-bold">備考</h2>
            <textarea
              value={constraint.notes ?? ''}
              onChange={e => setConstraint(c => ({ ...c, notes: e.target.value || null }))}
              rows={3}
              className="form-input resize-none"
              placeholder="特記事項があれば記入してください"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleConstraintSave}
              disabled={constraintSaving}
              className="btn-primary"
            >
              {constraintSaving ? '保存中...' : '制約を保存'}
            </button>
            {constraintSaved && <span className="text-success text-sub">保存しました</span>}
          </div>
        </div>
      )}
    </div>
  );
}
