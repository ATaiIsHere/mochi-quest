import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, Target, ListTodo, Wallet, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '總覽' },
  { to: '/goals', icon: Target, label: '目標' },
  { to: '/tasks', icon: ListTodo, label: '任務' },
  { to: '/wallet', icon: Wallet, label: '錢包' },
  { to: '/settings', icon: Settings, label: '設定' },
];

export function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 flex-col border-r bg-card px-3 py-6">
        <div className="mb-8 px-3">
          <span className="text-xl font-bold tracking-tight">Mochi Quest</span>
          <p className="text-xs text-muted-foreground mt-0.5">個人成長教練</p>
        </div>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 flex md:hidden border-t bg-card">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors',
                isActive ? 'text-primary' : 'text-muted-foreground'
              )
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
