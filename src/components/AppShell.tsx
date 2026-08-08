import { ChevronLeft, ChevronRight, Gamepad2, Radio, Settings, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { ConnectionStatus } from './ConnectionStatus';

const navigation = [
  { to: '/', label: 'Games', icon: Gamepad2 },
  { to: '/profile', label: 'Profile', icon: UserRound },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { activeMatch, connection, demoMode, settings, updateSettings } = useFennec();
  const collapsed = settings.sidebarCollapsed;
  return <div className="app-backdrop flex min-h-screen min-w-0">
    <aside className={`surface-flat sticky top-0 hidden h-screen shrink-0 flex-col border-y-0 border-l-0 transition-[width] duration-200 md:flex ${collapsed ? 'w-[4.75rem]' : 'w-[4.75rem] lg:w-[14.5rem]'}`}>
      <div className="flex h-[4.75rem] items-center border-b border-ui px-3">
        <Link to="/" aria-label="Fennec home" className="flex min-w-0 flex-1 items-center overflow-hidden">
          {collapsed
            ? <img src="/assets/brand/fennec-a-mark-primary.svg" alt="Fennec" className="mx-auto size-11 shrink-0" />
            : <><img src="/assets/brand/fennec-a-mark-primary.svg" alt="Fennec" className="mx-auto size-11 shrink-0 lg:hidden" /><img src="/assets/brand/fennec-a-lockup-primary.svg" alt="Fennec" className="hidden h-9 min-w-0 max-w-[8.5rem] lg:block" /></>}
        </Link>
        <button aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} className="hover-surface hidden size-9 shrink-0 items-center justify-center rounded-lg lg:flex" onClick={() => void updateSettings({ ...settings, sidebarCollapsed: !collapsed })}>
          {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-2 p-3">
        {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} aria-label={label} title={collapsed ? label : undefined} className={({ isActive }) => `flex h-11 items-center rounded-xl font-bold transition ${collapsed ? 'justify-center px-0' : 'justify-center px-0 lg:justify-start lg:gap-3 lg:px-3'} ${isActive ? 'bg-cyan-400/12 text-fennec-cyan' : 'text-muted hover-surface'}`}>
          <Icon className="size-5 shrink-0" />{!collapsed && <span className="hidden lg:inline">{label}</span>}
        </NavLink>)}
        {activeMatch && <NavLink to="/live" aria-label="Live match" title={collapsed ? 'Live match' : undefined} className={`mt-3 flex min-h-11 items-center rounded-xl bg-cyan-400/12 font-bold text-fennec-cyan ${collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:gap-3 lg:px-3'}`}>
          <Radio className="live-pulse size-5 shrink-0 rounded-full" />{!collapsed && <span className="hidden lg:inline">Live match</span>}
        </NavLink>}
      </nav>
      <div className="shrink-0 p-3">{collapsed ? <div className="mx-auto size-2 rounded-full bg-fennec-cyan" title="Fennec is running" /> : <><div className="mx-auto size-2 rounded-full bg-fennec-cyan lg:hidden" title="Fennec is running" /><ConnectionStatus connection={connection} demoMode={demoMode} className="surface-flat hidden w-full justify-center rounded-full px-3 py-1.5 text-xs lg:flex" /></>}</div>
    </aside>

    <div className="min-w-0 flex-1 pb-20 md:pb-0">
      <header className="surface-flat sticky top-0 z-20 flex h-16 items-center justify-between border-x-0 border-t-0 px-4 md:hidden">
        <Link to="/" className="flex items-center"><img src="/assets/brand/fennec-a-lockup-primary.svg" alt="Fennec" className="h-8 w-auto" /></Link>
        <ConnectionStatus connection={connection} demoMode={demoMode} className="surface-flat rounded-full px-3 py-1.5 text-xs" />
      </header>
      <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-10">{children}</main>
    </div>

    <nav className="surface fixed inset-x-3 bottom-3 z-30 grid grid-cols-3 rounded-2xl p-1.5 md:hidden">
      {navigation.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.68rem] font-bold ${isActive ? 'bg-cyan-400/12 text-fennec-cyan' : 'text-muted'}`}><Icon className="size-5" /><span className="truncate">{label}</span></NavLink>)}
    </nav>
  </div>;
}
