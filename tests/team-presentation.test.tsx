import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MatchRow } from '../src/components/MatchRow';
import { MatchPage } from '../src/pages/MatchPage';
import { calculatePlayerHistory } from '../src/domain/playerHistory';
import {
  normalizeTeamColor,
  resolveTeamPresentation,
} from '../src/domain/teamPresentation';
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
  it('normalizes API colors and falls back safely for incomplete teams', () => {
    expect(normalizeTeamColor(' ABC123 ')).toBe('#abc123');
    expect(normalizeTeamColor('#12abEF')).toBe('#12abef');
    expect(normalizeTeamColor('transparent')).toBeUndefined();
    expect(
      resolveTeamPresentation(
        [
          {
            teamNumber: 0,
            name: '  Neon Foxes  ',
            score: 0,
            colorPrimary: '65D9EE',
            colorSecondary: '',
          },
        ],
        0,
      ),
    ).toEqual({
      teamNumber: 0,
      name: 'Neon Foxes',
      primaryColor: '#65d9ee',
      secondaryColor: '#65d9ee',
    });
    expect(resolveTeamPresentation([], 1)).toEqual({
      teamNumber: 1,
      name: 'Orange',
      primaryColor: '#ff8a3d',
      secondaryColor: '#c2410c',
    });
    expect(resolveTeamPresentation([], 4)).toMatchObject({
      name: 'Team 5',
      primaryColor: '#94a3b8',
      secondaryColor: '#475569',
    });
  });

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
    expect(
      screen.queryByRole('columnheader', { name: /Car touches/ }),
    ).not.toBeInTheDocument();
    const teamSections = screen.getByRole('table').querySelectorAll('tbody');
    expect([...teamSections].map((section) => section.textContent)).toEqual([
      expect.stringMatching(/^Orange.*You/),
      expect.stringMatching(/^Blue.*Opponent/),
    ]);
  });

  it('renders custom team names and colors as accents instead of text colors', () => {
    const custom = {
      ...match,
      teams: [
        {
          teamNumber: 0,
          name: 'Solar Flare',
          score: 0,
          colorPrimary: 'FACC15',
          colorSecondary: 'EF4444',
        },
        {
          teamNumber: 1,
          name: 'Neon Foxes',
          score: 2,
          colorPrimary: '65D9EE',
          colorSecondary: '2563EB',
        },
      ],
    };
    render(
      <MemoryRouter>
        <MatchPage match={custom} />
      </MemoryRouter>,
    );

    const teamName = screen.getByText('Neon Foxes');
    const swatch = teamName.parentElement?.querySelector(
      '[data-team-number="1"]',
    );
    expect(teamName).not.toHaveStyle({ color: '#65d9ee' });
    expect(swatch).toHaveStyle({
      backgroundColor: '#65d9ee',
      borderColor: '#2563eb',
    });
    expect(screen.getByLabelText('Neon Foxes team')).toBeInTheDocument();
  });

  it('caps and truncates long player names without hiding their full value', () => {
    const longName = 'An extraordinarily long Rocket League player name';
    const longNameMatch = {
      ...match,
      participants: match.participants.map((player) =>
        player.name === 'Opponent' ? { ...player, name: longName } : player,
      ),
    };
    render(
      <MemoryRouter>
        <MatchPage match={longNameMatch} />
      </MemoryRouter>,
    );

    const name = screen.getByText(longName);
    expect(name).toHaveAttribute('title', longName);
    expect(name).toHaveClass('min-w-0', 'truncate');
    expect(name.parentElement).toHaveClass('max-w-full');
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
