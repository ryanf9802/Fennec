import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchRow } from '../src/components/MatchRow';
import { MatchPage } from '../src/pages/MatchPage';
import { calculatePlayerHistory } from '../src/domain/playerHistory';
import { defaultSettings, type MatchState } from '../src/domain/types';

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    profile: { primaryId: 'Steam|you|0', displayName: 'You' },
    settings: defaultSettings,
  }),
}));

vi.mock('../src/data/historyQueries', () => ({
  useMatch: () => ({ data: undefined, isLoading: false, isError: false }),
}));

const match: MatchState = {
  id: 'orange-win',
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
  winnerTeamNumber: 1,
  teams: [
    { teamNumber: 0, name: 'Blue', score: 0, colorPrimary: '' },
    { teamNumber: 1, name: 'Orange', score: 2, colorPrimary: '' },
  ],
  participants: [
    {
      name: 'Opponent',
      primaryId: 'Epic|opponent|0',
      teamNumber: 0,
      score: 50,
      goals: 0,
      assists: 0,
      passes: 0,
      fifties: 0,
      saves: 0,
      shots: 1,
      touches: 4,
      demos: 0,
    },
    {
      name: 'You',
      primaryId: 'Steam|you|0',
      teamNumber: 1,
      score: 200,
      goals: 2,
      assists: 0,
      passes: 3,
      fifties: 2,
      saves: 0,
      shots: 2,
      touches: 8,
      demos: 0,
    },
  ],
  events: [],
};

describe('user-first team presentation', () => {
  it('shows the user score first in game rows', () => {
    render(
      <MemoryRouter>
        <MatchRow match={match} profileId="Steam|you|0" />
      </MemoryRouter>,
    );

    expect(screen.getByText('WIN')).toBeInTheDocument();
    expect(screen.getAllByText('2 – 0')).not.toHaveLength(0);
  });

  it('shows the user team first in the scoreboard and summary score', () => {
    render(
      <MemoryRouter>
        <MatchPage match={match} />
      </MemoryRouter>,
    );

    expect(screen.getByText('2 – 0')).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /^Passes/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('columnheader', { name: /^50s/ }),
    ).toBeInTheDocument();
    const teamSections = screen.getByRole('table').querySelectorAll('tbody');
    expect([...teamSections].map((section) => section.textContent)).toEqual([
      expect.stringMatching(/^Orange.*You/),
      expect.stringMatching(/^Blue.*Opponent/),
    ]);
  });

  it('shows the user score first in recent player meetings', () => {
    const history = calculatePlayerHistory(
      [match],
      'Steam|you|0',
      'Epic|opponent|0',
    );

    expect(history?.recent[0]).toMatchObject({ result: 'win', score: '2–0' });
  });
});
