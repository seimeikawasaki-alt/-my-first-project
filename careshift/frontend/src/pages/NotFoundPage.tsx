import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

interface NotFoundPageProps {
  code?: 404 | 403;
}

export default function NotFoundPage({ code = 404 }: NotFoundPageProps) {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();

  const home = !isAuthenticated ? '/login' : user?.role === 'ADMIN' ? '/admin/dashboard' : '/staff/dashboard';
  const title = code === 403 ? 'アクセス権限がありません' : 'ページが見つかりません';
  const desc = code === 403
    ? 'このページを表示する権限がありません。'
    : 'お探しのページは存在しないか、移動された可能性があります。';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="text-center">
        <p className="text-6xl font-bold text-primary">{code}</p>
        <p className="text-heading font-bold text-text mt-4">{title}</p>
        <p className="text-sub text-subtext mt-2">{desc}</p>
        <button onClick={() => navigate(home)} className="btn-primary mt-6">
          ホームに戻る
        </button>
      </div>
    </div>
  );
}
