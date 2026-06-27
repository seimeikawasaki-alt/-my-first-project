import { Outlet, NavLink } from 'react-router-dom';

const navItems = [
  { label: 'ホーム', icon: '🏠', to: '/staff/dashboard' },
  { label: 'シフト', icon: '📅', to: '/staff/shifts' },
  { label: '打刻', icon: '⏱', to: '/staff/punch', center: true },
  { label: '勤怠', icon: '📋', to: '/staff/attendance' },
  { label: 'マイページ', icon: '👤', to: '/staff/profile' },
];

export default function StaffLayout() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-border safe-area-inset-bottom z-50">
        <div className="flex items-end justify-around max-w-lg mx-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                item.center
                  ? `flex flex-col items-center justify-center -mt-5 w-16 h-16 rounded-full shadow-lg transition-colors ${isActive ? 'bg-primary-hover' : 'bg-primary'} text-white`
                  : `flex flex-col items-center py-2 px-3 text-xs transition-colors ${isActive ? 'text-primary' : 'text-subtext'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={item.center ? 'text-2xl' : 'text-xl mb-0.5'}>{item.icon}</span>
                  {!item.center && (
                    <span className={`text-xs ${isActive ? 'font-medium' : ''}`}>{item.label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
