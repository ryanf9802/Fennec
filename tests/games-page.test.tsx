import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GamesPage } from '../src/pages/GamesPage';
import {
  defaultSettings,
  type MatchState,
  type SessionGroup,
} from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  fennec: {} as Record<string, unknown>,
  sessions: {} as Record<string, unknown>,
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => mocks.fennec,
}));

vi.mock('../src/data/historyQueries', () => ({
  useSessions: () => mocks.sessions,
}));

const match: MatchState = {
  id: 'latest-match',
  lifecycle: 'completed',
  startedAt: '2026-08-08T00:00:00Z',
  lastEventAt: '2026-08-08T00:05:00Z',
  endedAt: '2026-08-08T00:05:00Z',
  playlistId: 11,
  playlistName: 'Ranked Doubles',
  playlistCategory: 'ranked',
  arena: 'DFH Stadium',
  timeSeconds: 0,
  isOvertime: false,
  isReplay: false,
  teams: [],
  participants: [],
  events: [],
};

function session(endedManually = false): SessionGroup {
  return {
    id: 'latest-session',
    startedAt: match.startedAt,
    endedAt: match.endedAt!,
    matches: [match],
    endedManually,
  };
}

function renderPage(value = session()) {
  mocks.fennec = {
    activeMatch: undefined,
    profile: undefined,
    connection: 'waiting',
    endSession: vi.fn(),
    settings: defaultSettings,
  };
  mocks.sessions = {
    data: { pages: [{ items: [value] }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
  };
  return render(
    <MemoryRouter>
      <GamesPage />
    </MemoryRouter>,
  );
}

describe('closed session presentation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-08T00:34:59Z'));
  });

  afterEach(() => vi.useRealTimers());

  it('moves a manually ended latest session into Past sessions', () => {
    renderPage(session(true));

    expect(
      screen.getByRole('heading', { name: 'Ready for a new session?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Start a new match in Rocket League to begin a new session.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Past sessions' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Earlier today.*1 game/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('In focus')).not.toBeInTheDocument();
  });

  it('transitions to the between-sessions panel at the idle deadline', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { name: 'Current session' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Ready for a new session?' }),
    ).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(1_025));

    expect(
      screen.getByRole('heading', { name: 'Ready for a new session?' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('In focus')).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Earlier today.*1 game/ }),
    ).toBeInTheDocument();
  });
});
