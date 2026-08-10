import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  ListChecks,
  Radio,
  Settings,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { isTrainingMatch } from '../domain/playlists';
import { matchBelongsToProfile } from '../domain/profileScope';
import { ConnectionStatus } from './ConnectionStatus';
import { useSetupStatus } from '../setup/SetupStatusContext';

const primaryNavigation = [
  { to: '/', label: 'Games', icon: Gamepad2 },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

/**
 * Renders responsive navigation and exposes live-match navigation only when
 * the active match belongs to the currently selected player profile.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const setup = useSetupStatus();
  const {
    activeMatch,
    connection,
    demoMode,
    profile,
    settings,
    updateSettings,
  } = useFennec();
  const visibleActiveMatch =
    activeMatch && matchBelongsToProfile(activeMatch, profile?.primaryId)
      ? activeMatch
      : undefined;
  const liveLabel =
    visibleActiveMatch && isTrainingMatch(visibleActiveMatch)
      ? 'Live training'
      : 'Live match';
  const collapsed = settings.sidebarCollapsed;
  const locked = setup.state !== 'complete';
  const showSetup = locked || pathname === '/setup';
  const navigation = [
    ...primaryNavigation,
    ...(showSetup ? [{ to: '/setup', label: 'Setup', icon: ListChecks }] : []),
    { to: '/settings', label: 'Settings', icon: Settings },
  ];
  const mobileItemCount = navigation.length + (visibleActiveMatch ? 1 : 0);
  const mobileGridClass =
    mobileItemCount >= 5
      ? 'grid-cols-5'
      : mobileItemCount === 4
        ? 'grid-cols-4'
        : 'grid-cols-3';
  return (
    <div className="app-backdrop flex min-h-screen min-w-0">
      <aside
        className={`surface-flat sticky top-0 hidden h-screen shrink-0 flex-col border-y-0 border-l-0 transition-[width] duration-200 md:flex ${collapsed ? 'w-[4.75rem]' : 'w-[4.75rem] lg:w-[14.5rem]'}`}
      >
        <div className="flex h-[4.75rem] items-center border-b border-ui px-3">
          <Link
            to={locked ? '/setup' : '/'}
            aria-label="Fennec home"
            className={`flex min-w-0 flex-1 items-center overflow-hidden ${collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:gap-3'}`}
          >
            <img
              src="/assets/brand/fennec-a-mark-primary.svg"
              alt="Fennec"
              className="size-11 shrink-0"
            />
            {!collapsed && (
              <span className="text-main hidden truncate text-xl font-black tracking-tight lg:inline">
                Fennec
              </span>
            )}
          </Link>
        </div>
        <button
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="surface-flat hover-surface absolute top-[4.75rem] -right-4 z-10 hidden size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full lg:flex"
          onClick={() =>
            void updateSettings({ ...settings, sidebarCollapsed: !collapsed })
          }
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
        <nav className="flex flex-1 flex-col gap-2 p-3">
          {navigation.map(({ to, label, icon: Icon }) => {
            const disabled = locked && (to === '/' || to === '/profile');
            const classes = `flex h-11 items-center rounded-xl font-bold transition ${collapsed ? 'justify-center px-0' : 'justify-center px-0 lg:justify-start lg:gap-3 lg:px-3'}`;
            return disabled ? (
              <span
                key={to}
                aria-disabled="true"
                aria-label={label}
                title={collapsed ? label : undefined}
                className={`${classes} cursor-not-allowed text-muted opacity-40`}
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed && (
                  <span className="hidden lg:inline">{label}</span>
                )}
              </span>
            ) : (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                aria-label={label}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  `${classes} ${isActive ? 'bg-cyan-400/12 text-fennec-cyan' : 'text-muted hover-surface'}`
                }
              >
                <Icon className="size-5 shrink-0" />
                {!collapsed && (
                  <span className="hidden lg:inline">{label}</span>
                )}
              </NavLink>
            );
          })}
          {visibleActiveMatch &&
            (locked ? (
              <span
                aria-disabled="true"
                aria-label={liveLabel}
                title={collapsed ? liveLabel : undefined}
                className={`mt-3 flex min-h-11 cursor-not-allowed items-center rounded-xl font-bold text-muted opacity-40 ${collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:gap-3 lg:px-3'}`}
              >
                <Radio className="live-pulse size-5 shrink-0 rounded-full" />
                {!collapsed && (
                  <span className="hidden lg:inline">{liveLabel}</span>
                )}
              </span>
            ) : (
              <NavLink
                to="/live"
                aria-label={liveLabel}
                title={collapsed ? liveLabel : undefined}
                className={`mt-3 flex min-h-11 items-center rounded-xl bg-cyan-400/12 font-bold text-fennec-cyan ${collapsed ? 'justify-center' : 'justify-center lg:justify-start lg:gap-3 lg:px-3'}`}
              >
                <Radio className="live-pulse size-5 shrink-0 rounded-full" />
                {!collapsed && (
                  <span className="hidden lg:inline">{liveLabel}</span>
                )}
              </NavLink>
            ))}
        </nav>
        <div className="shrink-0 p-3">
          {collapsed ? (
            <ConnectionStatus
              connection={connection}
              demoMode={demoMode}
              showLabel={false}
              className="surface-flat min-h-[1.875rem] w-full justify-center rounded-full px-3 py-1.5 text-xs"
            />
          ) : (
            <>
              <ConnectionStatus
                connection={connection}
                demoMode={demoMode}
                showLabel={false}
                className="surface-flat min-h-[1.875rem] w-full justify-center rounded-full px-3 py-1.5 text-xs lg:hidden"
              />
              <ConnectionStatus
                connection={connection}
                demoMode={demoMode}
                className="surface-flat hidden w-full justify-center rounded-full px-3 py-1.5 text-xs lg:flex"
              />
            </>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1 pb-20 md:pb-0">
        <header className="surface-flat sticky top-0 z-20 flex h-16 items-center justify-between border-x-0 border-t-0 px-4 md:hidden">
          <Link to={locked ? '/setup' : '/'} className="flex items-center">
            <img
              src="/assets/brand/fennec-a-lockup-primary.svg"
              alt="Fennec"
              className="h-8 w-auto"
            />
          </Link>
          <ConnectionStatus
            connection={connection}
            demoMode={demoMode}
            className="surface-flat rounded-full px-3 py-1.5 text-xs"
          />
        </header>
        <main className="mx-auto min-w-0 max-w-[1600px] px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-10">
          {children}
        </main>
      </div>

      <nav
        className={`surface fixed inset-x-3 bottom-3 z-30 grid ${mobileGridClass} rounded-2xl p-1.5 md:hidden`}
      >
        {navigation.map(({ to, label, icon: Icon }) => {
          const disabled = locked && (to === '/' || to === '/profile');
          const classes =
            'flex min-w-0 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.68rem] font-bold';
          return disabled ? (
            <span
              key={to}
              aria-disabled="true"
              aria-label={label}
              className={`${classes} cursor-not-allowed text-muted opacity-40`}
            >
              <Icon className="size-5" />
              <span className="truncate">{label}</span>
            </span>
          ) : (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `${classes} ${isActive ? 'bg-cyan-400/12 text-fennec-cyan' : 'text-muted'}`
              }
            >
              <Icon className="size-5" />
              <span className="truncate">{label}</span>
            </NavLink>
          );
        })}
        {visibleActiveMatch &&
          (locked ? (
            <span
              aria-disabled="true"
              aria-label={liveLabel}
              className="flex min-w-0 cursor-not-allowed flex-col items-center gap-1 rounded-xl px-2 py-2 text-[0.68rem] font-bold text-muted opacity-40"
            >
              <Radio className="live-pulse size-5 rounded-full" />
              <span className="truncate">{liveLabel}</span>
            </span>
          ) : (
            <NavLink
              to="/live"
              aria-label={liveLabel}
              className="flex min-w-0 flex-col items-center gap-1 rounded-xl bg-cyan-400/12 px-2 py-2 text-[0.68rem] font-bold text-fennec-cyan"
            >
              <Radio className="live-pulse size-5 rounded-full" />
              <span className="truncate">{liveLabel}</span>
            </NavLink>
          ))}
      </nav>
    </div>
  );
}
