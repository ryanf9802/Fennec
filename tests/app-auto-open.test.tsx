import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Outlet } from 'react-router-dom';
import { App } from '../src/app/App';
import { defaultSettings, type MatchState } from '../src/domain/types';

const training: MatchState = {
  id: 'training-live',
  lifecycle: 'live',
  startedAt: '2026-08-09T00:00:00Z',
  lastEventAt: '2026-08-09T00:00:01Z',
  playlistId: 9,
  playlistName: 'Training',
  playlistCategory: 'unknown',
  arena: 'Woods',
  timeSeconds: 1,
  isOvertime: false,
  isReplay: false,
  observedByPrimaryId: 'Steam|you|0',
  teams: [],
  participants: [],
  events: [],
};
const mocks = vi.hoisted(() => ({
  profile: undefined as { primaryId: string; displayName: string } | undefined,
  setupState: 'complete',
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    activeMatch: training,
    profile: mocks.profile,
    settings: { ...defaultSettings, autoOpenLiveMatch: true },
    ready: true,
    diagnostic: undefined,
  }),
}));
vi.mock('../src/platform/LocalAccessContext', () => ({
  useLocalAccess: () => ({ satisfied: true }),
}));
vi.mock('../src/setup/SetupStatusContext', () => ({
  SetupStatusProvider: ({ children }: { children: ReactNode }) => children,
  useSetupStatus: () => ({ state: mocks.setupState }),
}));
vi.mock('../src/components/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../src/app/RequireSetup', () => ({
  RequireSetup: () =>
    mocks.setupState === 'checking' ? <div>Checking setup…</div> : <Outlet />,
}));
vi.mock('../src/pages/GamesPage', () => ({
  GamesPage: () => <div>Games route</div>,
}));
vi.mock('../src/pages/MatchPage', () => ({
  MatchPage: ({ match }: { match?: MatchState }) => (
    <div>{match?.playlistName ?? 'Historical match'}</div>
  ),
}));
vi.mock('../src/pages/OnboardingPage', () => ({ OnboardingPage: () => null }));
vi.mock('../src/pages/ProfilePage', () => ({ ProfilePage: () => null }));
vi.mock('../src/pages/SessionPage', () => ({ SessionPage: () => null }));
vi.mock('../src/pages/SettingsPage', () => ({ SettingsPage: () => null }));
vi.mock('../src/components/LocalAccessModal', () => ({
  LocalAccessModal: () => null,
}));
vi.mock('../src/pwa/LiveWakeLock', () => ({ LiveWakeLock: () => null }));
vi.mock('../src/pwa/PwaLifecycle', () => ({ PwaLifecycle: () => null }));

describe('app shell entry and live auto-open', () => {
  beforeEach(() => {
    mocks.profile = { primaryId: 'Steam|you|0', displayName: 'You' };
    mocks.setupState = 'complete';
  });

  it('honors the existing auto-open preference for training', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Training')).toBeInTheDocument();
    expect(screen.queryByText('Games route')).not.toBeInTheDocument();
  });

  it('does not auto-open a live match when no player is selected', async () => {
    mocks.profile = undefined;
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Games route')).toBeInTheDocument();
    expect(screen.queryByText('Training')).not.toBeInTheDocument();
  });

  it('does not auto-open a live match while setup is locked', async () => {
    mocks.setupState = 'incomplete';
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Games route')).toBeInTheDocument();
    expect(screen.queryByText('Training')).not.toBeInTheDocument();
  });

  it('keeps setup checking behind the app entrance', () => {
    mocks.setupState = 'checking';
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-entrance')).toHaveAccessibleName(
      'Loading Fennec',
    );
    expect(screen.queryByText('Checking setup…')).not.toBeInTheDocument();
    expect(screen.queryByText('Games route')).not.toBeInTheDocument();
  });
});
