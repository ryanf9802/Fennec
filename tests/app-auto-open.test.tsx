import { act, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Outlet, useLocation } from 'react-router-dom';
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
  activeMatch: undefined as MatchState | undefined,
  autoOpenLiveMatch: true,
  getMatchSessionId: vi.fn(),
  profile: undefined as { primaryId: string; displayName: string } | undefined,
  setupState: 'complete',
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    activeMatch: mocks.activeMatch,
    profile: mocks.profile,
    settings: {
      ...defaultSettings,
      autoOpenLiveMatch: mocks.autoOpenLiveMatch,
    },
    ready: true,
    diagnostic: undefined,
  }),
}));
vi.mock('../src/data/database', () => ({
  historyRepository: { getMatchSessionId: mocks.getMatchSessionId },
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
  MatchPage: function MatchPage({ match }: { match?: MatchState }) {
    const location = useLocation();
    const matchOrigin = (location.state as { matchOrigin?: string } | null)
      ?.matchOrigin;
    return (
      <div>
        <div>{match?.playlistName ?? 'Historical match'}</div>
        {matchOrigin && <div>{matchOrigin}</div>}
      </div>
    );
  },
}));
vi.mock('../src/pages/OnboardingPage', () => ({
  OnboardingPage: () => <div>Setup route</div>,
}));
vi.mock('../src/pages/ProfilePage', () => ({ ProfilePage: () => null }));
vi.mock('../src/pages/SessionPage', () => ({ SessionPage: () => null }));
vi.mock('../src/pages/SettingsPage', () => ({
  SettingsPage: () => <div>Settings route</div>,
}));
vi.mock('../src/components/LocalAccessModal', () => ({
  LocalAccessModal: () => null,
}));
vi.mock('../src/pwa/LiveWakeLock', () => ({ LiveWakeLock: () => null }));
vi.mock('../src/pwa/PwaLifecycle', () => ({ PwaLifecycle: () => null }));

describe('app shell entry and live auto-open', () => {
  beforeEach(() => {
    mocks.activeMatch = training;
    mocks.autoOpenLiveMatch = true;
    mocks.getMatchSessionId.mockReset();
    mocks.getMatchSessionId.mockResolvedValue('session-one');
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

  it('does not leave setup when a live match completes setup', async () => {
    render(
      <MemoryRouter initialEntries={['/setup']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Setup route')).toBeInTheDocument();
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

  it('opens a completed live match with its session as the origin', async () => {
    mocks.activeMatch = {
      ...training,
      id: 'ranked-live',
      playlistId: 11,
      playlistName: 'Ranked Doubles',
      playlistCategory: 'ranked',
    };
    const view = render(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Ranked Doubles')).toBeInTheDocument();

    mocks.activeMatch = undefined;
    view.rerender(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Historical match')).toBeInTheDocument();
    expect(screen.getByText('/sessions/session-one')).toBeInTheDocument();
    expect(mocks.getMatchSessionId).toHaveBeenCalledWith(
      'ranked-live',
      'id:Steam|you|0',
    );
  });

  it('returns to the game timeline when training ends', async () => {
    const view = render(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Training')).toBeInTheDocument();

    mocks.activeMatch = undefined;
    view.rerender(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Games route')).toBeInTheDocument();
    expect(mocks.getMatchSessionId).not.toHaveBeenCalled();
  });

  it('falls back to the game timeline when no profile session exists', async () => {
    mocks.activeMatch = {
      ...training,
      id: 'untracked-live',
      playlistId: 11,
      playlistName: 'Ranked Doubles',
      playlistCategory: 'ranked',
    };
    mocks.getMatchSessionId.mockResolvedValue(undefined);
    const view = render(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );

    mocks.activeMatch = undefined;
    view.rerender(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Games route')).toBeInTheDocument();
  });

  it('does not redirect after the user has left the live page', async () => {
    mocks.autoOpenLiveMatch = false;
    mocks.activeMatch = {
      ...training,
      id: 'ranked-live',
      playlistId: 11,
      playlistName: 'Ranked Doubles',
      playlistCategory: 'ranked',
    };
    const view = render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    mocks.activeMatch = undefined;
    view.rerender(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>,
    );

    expect(screen.getByText('Settings route')).toBeInTheDocument();
    expect(screen.queryByText('Historical match')).not.toBeInTheDocument();
    expect(mocks.getMatchSessionId).not.toHaveBeenCalled();
  });

  it('cancels a finished-match redirect when another match becomes live', async () => {
    let resolveSession!: (sessionId: string) => void;
    mocks.getMatchSessionId.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveSession = resolve;
      }),
    );
    mocks.activeMatch = {
      ...training,
      id: 'first-live',
      playlistId: 11,
      playlistName: 'First match',
      playlistCategory: 'ranked',
    };
    const view = render(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );

    mocks.activeMatch = undefined;
    view.rerender(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Opening saved match…')).toBeInTheDocument();

    mocks.activeMatch = {
      ...training,
      id: 'second-live',
      playlistId: 11,
      playlistName: 'Second match',
      playlistCategory: 'ranked',
    };
    view.rerender(
      <MemoryRouter initialEntries={['/live']}>
        <App />
      </MemoryRouter>,
    );
    await act(async () => resolveSession('session-one'));

    expect(screen.getByText('Second match')).toBeInTheDocument();
    expect(screen.queryByText('Historical match')).not.toBeInTheDocument();
  });
});
