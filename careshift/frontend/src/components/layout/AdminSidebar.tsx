import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../stores/authStore';

const now = new Date();
const year = now.getFullYear();
const month = String(now.getMonth() + 1).padStart(2, '0');

interface NavItem { label: string; icon: string; to: string; }
interface NavSection { label: string; icon: string; items: NavItem[]; }

const dashboard: NavItem = { label: 'ダッシュボード', icon: '🏠', to: '/admin/dashboard' };

const sections: NavSection[] = [
  {
    label: 'スタッフ', icon: '👥', items: [
      { label: 'スタッフ管理', icon: '👤', to: '/admin/staff' },
      { label: 'グループ管理', icon: '👪', to: '/admin/groups' },
      { label: '資格・研修管理', icon: '🎓', to: '/admin/qualifications' },
      { label: '入退社管理', icon: '🚪', to: '/admin/lifecycle' },
    ],
  },
  {
    label: 'シフト', icon: '📅', items: [
      { label: 'シフト管理', icon: '📅', to: `/admin/shifts/${year}/${month}` },
      { label: 'シフト設定', icon: '🔧', to: '/admin/shift-settings' },
      { label: 'シフト申請一覧', icon: '📝', to: '/admin/shift-requests' },
      { label: 'シフト交代', icon: '🔄', to: '/admin/shift-swap' },
    ],
  },
  {
    label: '勤怠', icon: '⏰', items: [
      { label: '勤怠管理', icon: '⏰', to: `/admin/attendance/${year}/${month}` },
      { label: '有給休暇管理', icon: '🏖', to: '/admin/paid-leave' },
      { label: '残業管理', icon: '⚠️', to: '/admin/overtime' },
    ],
  },
  {
    label: '給与', icon: '💴', items: [
      { label: '給与管理', icon: '💴', to: `/admin/salary/${year}/${month}` },
      { label: '給与項目設定', icon: '🧾', to: '/admin/salary/settings' },
      { label: '給与振込', icon: '🏦', to: '/admin/payroll-transfer' },
    ],
  },
  {
    label: 'その他', icon: '⚙️', items: [
      { label: '監査ログ', icon: '📋', to: '/admin/audit-logs' },
      { label: '設定', icon: '⚙️', to: '/admin/settings' },
    ],
  },
];

// リンク先の静的な先頭部分（/admin/xxx）を取り出して現在地との一致判定に使う
const rootOf = (to: string) => '/' + to.split('/').slice(1, 3).join('/');

const itemClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 pl-11 pr-6 py-2.5 text-sub transition-colors ${
    isActive
      ? 'bg-blue-50 text-primary font-medium border-r-2 border-primary'
      : 'text-text hover:bg-gray-50'
  }`;

export default function AdminSidebar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const activeSection = sections.find(s => s.items.some(it => location.pathname.startsWith(rootOf(it.to))));

  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    sections.forEach(s => { init[s.label] = activeSection?.label === s.label; });
    return init;
  });

  // ページ遷移時、現在地を含むグループは自動で開く（他は触らない）
  useEffect(() => {
    if (activeSection) setOpen(o => (o[activeSection.label] ? o : { ...o, [activeSection.label]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggle = (label: string) => setOpen(o => ({ ...o, [label]: !o[label] }));

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <aside className="w-64 min-h-screen bg-white border-r border-border flex flex-col">
      <div className="px-6 py-5 border-b border-border">
        <h1 className="text-xl font-bold text-primary">CareShift</h1>
        <p className="text-xs text-subtext mt-0.5">介護施設管理システム</p>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {/* ダッシュボード（単独） */}
        <NavLink
          to={dashboard.to}
          className={({ isActive }) =>
            `flex items-center gap-3 px-6 py-3 text-body transition-colors ${
              isActive ? 'bg-blue-50 text-primary font-medium border-r-2 border-primary' : 'text-text hover:bg-gray-50'
            }`
          }
        >
          <span className="text-lg">{dashboard.icon}</span>
          <span>{dashboard.label}</span>
        </NavLink>

        {sections.map(section => {
          const isOpen = open[section.label];
          const hasActive = activeSection?.label === section.label;
          return (
            <div key={section.label} className="mt-1">
              <button
                onClick={() => toggle(section.label)}
                className={`w-full flex items-center gap-3 px-6 py-3 text-body transition-colors hover:bg-gray-50 ${
                  hasActive ? 'text-primary font-medium' : 'text-text'
                }`}
              >
                <span className="text-lg">{section.icon}</span>
                <span className="flex-1 text-left">{section.label}</span>
                <span className={`text-xs text-subtext transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
              </button>
              {isOpen && (
                <div className="pb-1">
                  {section.items.map(item => (
                    <NavLink key={item.to} to={item.to} className={itemClass}>
                      <span className="text-base">{item.icon}</span>
                      <span>{item.label}</span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="px-6 py-4 border-t border-border">
        <div className="mb-3">
          <p className="text-sub font-medium text-text">
            {user?.lastName} {user?.firstName}
          </p>
          <p className="text-xs text-subtext">{user?.userCode}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left text-sub text-subtext hover:text-danger transition-colors py-1"
        >
          ログアウト
        </button>
      </div>
    </aside>
  );
}
