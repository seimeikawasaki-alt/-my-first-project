import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';
import { authApi } from '../../api/auth';

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  FULL_TIME: '正社員',
  PART_TIME: 'パート',
  CONTRACT: '契約社員',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理者',
  GROUP_LEADER: 'グループリーダー',
  STAFF: 'スタッフ',
};

export default function ProfilePage() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const [showPwForm, setShowPwForm] = useState(false);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const [pwSuccess, setPwSuccess] = useState('');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleChangePassword = async () => {
    if (pwForm.newPassword !== pwForm.confirmPassword) {
      setPwError('新しいパスワードが一致しません');
      return;
    }
    if (pwForm.newPassword.length < 8) {
      setPwError('パスワードは8文字以上で設定してください');
      return;
    }
    setPwSaving(true);
    setPwError('');
    setPwSuccess('');
    try {
      await authApi.changePassword({ currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword });
      setPwSuccess('パスワードを変更しました');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setShowPwForm(false);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message;
      setPwError(msg ?? 'パスワード変更に失敗しました');
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-white border-b border-border px-4 py-4">
        <div className="max-w-lg mx-auto">
          <h1 className="text-card-title font-bold text-text">マイページ</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Profile card */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center text-white text-xl font-bold">
              {user?.lastName?.[0]}
            </div>
            <div>
              <p className="text-card-title font-bold text-text">{user?.lastName} {user?.firstName}</p>
              <p className="text-sub text-subtext">{user?.userCode}</p>
            </div>
          </div>
          <div className="space-y-2 text-sub">
            <div className="flex justify-between">
              <span className="text-subtext">役職</span>
              <span className="text-text">{ROLE_LABELS[user?.role ?? ''] ?? user?.role}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-subtext">雇用形態</span>
              <span className="text-text">{EMPLOYMENT_TYPE_LABELS[user?.employmentType ?? ''] ?? user?.employmentType}</span>
            </div>
            {user?.email && (
              <div className="flex justify-between">
                <span className="text-subtext">メール</span>
                <span className="text-text">{user.email}</span>
              </div>
            )}
            {user?.phone && (
              <div className="flex justify-between">
                <span className="text-subtext">電話</span>
                <span className="text-text">{user.phone}</span>
              </div>
            )}
            {user?.hireDate && (
              <div className="flex justify-between">
                <span className="text-subtext">入社日</span>
                <span className="text-text">{user.hireDate.slice(0, 10)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick links */}
        <div className="bg-white rounded-xl border border-border p-2">
          <button
            onClick={() => navigate('/staff/payslips')}
            className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <span className="flex items-center gap-3 text-sub text-text"><span className="text-lg">🧾</span>給与明細</span>
            <span className="text-subtext">›</span>
          </button>
          <button
            onClick={() => navigate('/staff/shift-request')}
            className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-gray-50 transition-colors border-t border-border"
          >
            <span className="flex items-center gap-3 text-sub text-text"><span className="text-lg">📝</span>シフト申請</span>
            <span className="text-subtext">›</span>
          </button>
        </div>

        {/* Groups */}
        {user?.groups && user.groups.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-5">
            <h2 className="text-sub font-bold text-text mb-3">所属グループ</h2>
            <div className="space-y-2">
              {user.groups.map(g => (
                <div key={g.id} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: g.color ?? '#94A3B8' }}
                  />
                  <span className="text-sub text-text">{g.name}</span>
                  {g.isLeader && (
                    <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-primary font-medium">
                      リーダー
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Password change */}
        <div className="bg-white rounded-xl border border-border p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sub font-bold text-text">パスワード変更</h2>
            <button onClick={() => { setShowPwForm(s => !s); setPwError(''); setPwSuccess(''); }} className="text-primary text-sub hover:underline">
              {showPwForm ? '閉じる' : '変更する'}
            </button>
          </div>
          {pwSuccess && <p className="text-success text-sub mt-2">{pwSuccess}</p>}
          {showPwForm && (
            <div className="mt-4 space-y-3">
              {pwError && <p className="text-danger text-sub">{pwError}</p>}
              <input
                type="password"
                placeholder="現在のパスワード"
                value={pwForm.currentPassword}
                onChange={e => setPwForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="input w-full"
              />
              <input
                type="password"
                placeholder="新しいパスワード（8文字以上）"
                value={pwForm.newPassword}
                onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                className="input w-full"
              />
              <input
                type="password"
                placeholder="新しいパスワード（確認）"
                value={pwForm.confirmPassword}
                onChange={e => setPwForm(f => ({ ...f, confirmPassword: e.target.value }))}
                className="input w-full"
              />
              <button onClick={handleChangePassword} disabled={pwSaving} className="w-full btn-primary py-3">
                {pwSaving ? '変更中...' : 'パスワードを変更'}
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full py-4 rounded-xl border border-danger text-danger font-medium text-sub hover:bg-red-50 transition-colors"
        >
          ログアウト
        </button>
      </main>
    </div>
  );
}
