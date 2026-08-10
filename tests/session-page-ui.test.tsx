import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SessionPage } from '../src/pages/SessionPage';
import type {
  MatchState,
  ParticipantState,
  SessionGroup,
} from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  selected: undefined as { playerKey: string; playerName: string } | undefined,
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    profile: { primaryId: 'Steam|you|0', displayName: 'You' },
  }),
}));

vi.mock('../src/components/PlayerProfileDialog', () => ({
  PlayerProfileDialog: ({
    playerKey,
    playerName,
    onClose,
  }: {
    playerKey: string;
    playerName: string;
    onClose(): void;
  }) => {
    mocks.selected = { playerKey, playerName };
    return (
      <div role="dialog" aria-label={playerName}>
        <button onClick={onClose}>Close player profile</button>
      </div>
    );
  },
}));

function participant(name: string, primaryId: string): ParticipantState {
  return {
    name,
    primaryId,
    teamNumber: 0,
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

function sessionMatch(
  index: number,
  teammates: ParticipantState[],
): MatchState {
  return {
    id: `match-${index}`,
    lifecycle: 'completed',
    startedAt: `2026-08-08T00:${index}0:00Z`,
    lastEventAt: `2026-08-08T00:${index}5:00Z`,
    endedAt: `2026-08-08T00:${index}5:00Z`,
    playlistId: 11,
    playlistName: 'Ranked Doubles',
    playlistCategory: 'ranked',
    arena: 'DFH Stadium',
    timeSeconds: 0,
    isOvertime: false,
    isReplay: false,
    teams: [],
    participants: [participant('You', 'Steam|you|0'), ...teammates],
    events: [],
  };
}

const alpha = participant('Alpha', 'Epic|alpha|0');
const bravo = participant('Bravo', 'Epic|bravo|0');
const once = participant('One game', 'Epic|once|0');
const session: SessionGroup = {
  id: 'session-one',
  startedAt: '2026-08-08T00:00:00Z',
  endedAt: '2026-08-08T00:25:00Z',
  endedManually: false,
  matches: [
    sessionMatch(0, [alpha, bravo, once]),
    sessionMatch(1, [alpha, bravo]),
    sessionMatch(2, [alpha]),
  ],
};

vi.mock('../src/data/historyQueries', () => ({
  useSession: () => ({ data: session, isLoading: false, isError: false }),
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('session detail recurring teammates', () => {
  beforeEach(() => {
    mocks.selected = undefined;
  });

  it('shows every recurring teammate and opens player history in place', () => {
    render(
      <MemoryRouter initialEntries={['/sessions/session-one']}>
        <Routes>
          <Route
            path="/sessions/:sessionId"
            element={
              <>
                <SessionPage />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('button', { name: 'View profile for Alpha' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'View profile for Bravo' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('One game')).not.toBeInTheDocument();
    expect(screen.getByText('W/L diff')).toBeInTheDocument();
    expect(
      screen.getByRole('region', { name: 'Session performance details' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Outcome' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Offense' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Involvement' }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'View profile for Bravo' }),
    );
    expect(screen.getByRole('dialog', { name: 'Bravo' })).toBeInTheDocument();
    expect(mocks.selected).toEqual({
      playerKey: 'id:Epic|bravo|0',
      playerName: 'Bravo',
    });
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sessions/session-one',
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Close player profile' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/sessions/session-one',
    );
  });

  it('records the session as the origin when opening one of its matches', () => {
    render(
      <MemoryRouter initialEntries={['/sessions/session-one']}>
        <Routes>
          <Route path="/sessions/:sessionId" element={<SessionPage />} />
          <Route path="/matches/:matchId" element={<LocationStateProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    const [matchLink] = screen.getAllByRole('link', {
      name: /Ranked Doubles/,
    });
    if (!matchLink) throw new Error('Expected the session to contain a match');
    fireEvent.click(matchLink);

    expect(screen.getByTestId('location-state')).toHaveTextContent(
      '/matches/match-2|/sessions/session-one',
    );
  });
});

function LocationStateProbe() {
  const location = useLocation();
  const matchOrigin = (location.state as { matchOrigin?: string } | null)
    ?.matchOrigin;
  return (
    <div data-testid="location-state">
      {location.pathname}|{matchOrigin}
    </div>
  );
}
