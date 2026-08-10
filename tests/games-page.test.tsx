import { act, fireEvent, render, screen, within } from '@testing-library/react';
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

function participant(name: string, primaryId: string, teamNumber: number) {
  return {
    name,
    primaryId,
    teamNumber,
    score: 0,
    goals: 0,
    assists: 0,
    passes: 0,
    fifties: 0,
    saves: 0,
    shots: 0,
    touches: 0,
    demos: 0,
  };
}

function recurringSession(endedManually = false): SessionGroup {
  const teammates = [
    ['Alpha', 'Epic|alpha|0'],
    ['Bravo', 'Epic|bravo|0'],
    ['Charlie', 'Epic|charlie|0'],
  ] as const;
  const matches = [0, 1, 2].map((index) => ({
    ...match,
    id: `match-${index}`,
    startedAt: `2026-08-08T00:${index}0:00Z`,
    lastEventAt: `2026-08-08T00:${index}5:00Z`,
    endedAt: `2026-08-08T00:${index}5:00Z`,
    participants: [
      participant('You', 'Steam|you|0', 0),
      ...teammates
        .filter(([name]) => name !== 'Charlie' || index > 0)
        .map(([name, id]) => participant(name, id, 0)),
      ...(index === 0 ? [participant('One game', 'Epic|once|0', 0)] : []),
    ],
  }));
  return {
    id: 'recurring-session',
    startedAt: matches[0]!.startedAt,
    endedAt: matches.at(-1)!.endedAt!,
    matches,
    endedManually,
  };
}

function session(endedManually = false): SessionGroup {
  return {
    id: 'latest-session',
    startedAt: match.startedAt,
    endedAt: match.endedAt!,
    matches: [match],
    endedManually,
  };
}

function renderPage(
  value = session(),
  withProfile = true,
  activeMatch?: MatchState,
) {
  mocks.fennec = {
    activeMatch,
    profile: withProfile
      ? { primaryId: 'Steam|you|0', displayName: 'You' }
      : undefined,
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
      screen.getByRole('link', { name: /Earlier today.*Games 1/ }),
    ).toBeInTheDocument();
    expect(screen.queryByText('In focus')).not.toBeInTheDocument();
    expect(screen.queryByText('Recurring teammates')).not.toBeInTheDocument();
  });

  it('labels live training without extra history messaging', () => {
    renderPage(session(), true, {
      ...match,
      id: 'training',
      lifecycle: 'live',
      playlistId: 9,
      playlistName: 'Training',
      observedByPrimaryId: 'Steam|you|0',
    });

    expect(screen.getByText('Training now')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Training' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/not saved to history/i)).not.toBeInTheDocument();
  });

  it('prompts for a player instead of showing unscoped history', () => {
    renderPage(session(), false);
    expect(
      screen.getByRole('heading', { name: 'Choose your player' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Select your player' }),
    ).toHaveAttribute('href', '/profile#player-selection');
    expect(
      screen.queryByRole('heading', { name: 'Current session' }),
    ).not.toBeInTheDocument();
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
      screen.getByRole('link', { name: /Earlier today.*Games 1/ }),
    ).toBeInTheDocument();
  });

  it('contains the current session identity, action, and feedback in its detail card', async () => {
    renderPage();

    const sessionLink = screen.getByRole('link', {
      name: 'View current session details',
    });
    const sessionCard = sessionLink.parentElement!;
    expect(sessionLink).toHaveAttribute('href', '/sessions/latest-session');
    expect(
      within(sessionCard).getByRole('heading', { name: 'Current session' }),
    ).toBeInTheDocument();
    expect(
      within(sessionCard).getByRole('button', { name: 'End session' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Past sessions' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /Full session/ }),
    ).not.toBeInTheDocument();

    const endSession = mocks.fennec.endSession as ReturnType<typeof vi.fn>;
    endSession.mockResolvedValue('ended');
    await act(async () => {
      fireEvent.click(
        within(sessionCard).getByRole('button', { name: 'End session' }),
      );
      await Promise.resolve();
    });
    expect(endSession).toHaveBeenCalledOnce();
    expect(
      within(sessionCard).getByText(
        'Session ended. The next game will start a new session.',
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ['current', false],
    ['past', true],
  ])(
    'shows only the top two recurring teammates for a %s session',
    (_, ended) => {
      renderPage(recurringSession(ended));

      const recurring = screen.getByText('Recurring teammates').parentElement!;
      expect(within(recurring).getByText('Alpha')).toBeInTheDocument();
      expect(within(recurring).getByText('Bravo')).toBeInTheDocument();
      expect(within(recurring).queryByText('Charlie')).not.toBeInTheDocument();
      expect(within(recurring).queryByText('One game')).not.toBeInTheDocument();
    },
  );
});
