import { useState, useEffect, FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { staffApi, StaffCreateRequest } from '../../api/staff';
import { groupsApi } from '../../api/groups';
import { Group } from '../../types';
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
};

export default function StaffFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isNew = id === 'new';

  const [form, setForm] = useState<StaffCreateRequest>(initialForm);
  const [groups, setGroups] = useState<Group[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [globalError, setGlobalError] = useState('');
  const [isLoading, setIsLoading] = useState(!isNew);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    groupsApi.list().then(res => setGroups(res.data.data));
  }, []);

  useEffect(() => {
    if (!isNew && id) {
      staffApi.get(id).then(res => {
        const user = res.data.data;
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
          groupIds: user.groups?.map(g => g.id) || [],
        });
        setIsLoading(false);
      });
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

  if (isLoading) return <div className="p-8"><LoadingSpinner /></div>;

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-6">
        <button onClick={() => navigate('/admin/staff')} className="text-subtext hover:text-text text-sub mb-2 flex items-center gap-1">
          ← スタッフ一覧に戻る
        </button>
        <h1 className="text-heading font-bold text-text">
          {isNew ? 'スタッフ登録' : 'スタッフ編集'}
        </h1>
      </div>

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
    </div>
  );
}
