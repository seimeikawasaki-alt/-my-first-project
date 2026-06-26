import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { AxiosError } from 'axios';

interface ApiErrorResponse {
  error: { message: string };
}

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuthStore();
  const [userCode, setUserCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await login(userCode, password);
      const { user } = useAuthStore.getState();
      if (user?.role === 'ADMIN') {
        navigate('/admin/dashboard');
      } else {
        navigate('/staff/dashboard');
      }
    } catch (err) {
      const axiosError = err as AxiosError<ApiErrorResponse>;
      setError(axiosError.response?.data?.error?.message || 'ログインに失敗しました');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">CareShift</h1>
          <p className="text-subtext">介護施設向けシフト・勤怠・給与管理システム</p>
        </div>

        <div className="card">
          <h2 className="text-card-title font-bold text-center mb-6">ログイン</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-danger text-sub">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="userCode" className="form-label">
                ユーザーID
              </label>
              <input
                id="userCode"
                type="text"
                value={userCode}
                onChange={e => setUserCode(e.target.value)}
                className="form-input"
                placeholder="ユーザーIDを入力"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="form-label">
                パスワード
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="form-input"
                placeholder="パスワードを入力"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isLoading ? 'ログイン中...' : 'ログイン'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-subtext mt-6">
          © 2024 CareShift. All rights reserved.
        </p>
      </div>
    </div>
  );
}
