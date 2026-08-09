import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { MatchPage } from '../src/pages/MatchPage';
import { ProfilePage } from '../src/pages/ProfilePage';
import { defaultSettings, type MatchState } from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  profile: {
    primaryId: 'Steam|you|0',
    displayName: 'You',
  } as { primaryId: string; displayName: string } | undefined,
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    profile: mocks.profile,
    settings: defaultSettings,
    selectProfile: vi.fn(),
  }),
}));

const botMatch: MatchState = {
  id: 'bots',
  lifecycle: 'completed',
  startedAt: '2026-08-08T00:00:00Z',
  lastEventAt: '2026-08-08T00:05:00Z',
  endedAt: '2026-08-08T00:05:00Z',
  playlistId: 6,
  playlistName: 'Private Match',
  playlistCategory: 'private',
  arena: 'Street',
  timeSeconds: 0,
  isOvertime: false,
  isReplay: false,
  winnerTeamNumber: 0,
  teams: [
    { teamNumber: 0, name: 'Blue', score: 1, colorPrimary: '' },
    { teamNumber: 1, name: 'Orange', score: 0, colorPrimary: '' },
  ],
  participants: [
    {
      name: 'You',
      primaryId: 'Steam|you|0',
      shortcut: 1,
      teamNumber: 0,
      score: 100,
      goals: 1,
      assists: 0,
      passes: 0,
      fifties: 0,
      saves: 0,
      shots: 1,
      touches: 5,
      demos: 0,
    },
    {
      name: 'Boomer',
      primaryId: 'Unknown|0|0',
      shortcut: 2,
      teamNumber: 1,
      score: 50,
      goals: 0,
      assists: 0,
      passes: 0,
      fifties: 0,
      saves: 1,
      shots: 0,
      touches: 4,
      demos: 0,
      isPresent: false,
    },
    {
      name: 'Solo',
      primaryId: 'Epic|solo|0',
      shortcut: 3,
      teamNumber: 1,
      score: 25,
      goals: 0,
      assists: 0,
      passes: 0,
      fifties: 0,
      saves: 0,
      shots: 0,
      touches: 2,
      demos: 0,
    },
  ],
  events: [],
};

const playerHistory = {
  pages: [
    {
      summary: {
        playerKey: 'name:boomer',
        identityKind: 'name' as const,
        latestName: 'Boomer',
        gamesTogether: 1,
        winsTogether: 1,
        lossesTogether: 0,
        gamesOpposed: 2,
        winsAgainst: 1,
        lossesAgainst: 1,
        firstSeen: botMatch.startedAt,
        lastSeen: botMatch.startedAt,
      },
      matches: { items: [botMatch] },
    },
  ],
};

vi.mock('../src/data/historyQueries', () => ({
  useMatch: () => ({ data: undefined, isLoading: false, isError: false }),
  usePlayerHistory: () => ({
    data: playerHistory,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
  usePlayerHistoryAvailability: () => ({ data: ['name:boomer'] }),
  usePlayers: (_query: string, platformOnly: boolean) => ({
    data: [
      {
        playerKey: 'id:Steam|you|0',
        primaryId: 'Steam|you|0',
        identityKind: 'platform',
        latestName: 'You',
        normalizedName: 'you',
        firstSeen: botMatch.startedAt,
        lastSeen: botMatch.startedAt,
      },
      {
        playerKey: 'id:Epic|teammate|0',
        primaryId: 'Epic|teammate|0',
        identityKind: 'platform',
        latestName: 'Teammate',
        normalizedName: 'teammate',
        firstSeen: botMatch.startedAt,
        lastSeen: botMatch.startedAt,
      },
      {
        playerKey: 'name:boomer',
        identityKind: 'name',
        latestName: 'Boomer',
        normalizedName: 'boomer',
        firstSeen: botMatch.startedAt,
        lastSeen: botMatch.startedAt,
      },
    ].filter((player) => !platformOnly || player.identityKind === 'platform'),
  }),
  useOverview: () => ({
    data: { matches: 1, sessions: 1, firstMatchStartedAt: botMatch.startedAt },
  }),
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('player profile UI', () => {
  beforeEach(() => {
    mocks.profile = { primaryId: 'Steam|you|0', displayName: 'You' };
  });
  it('opens a player profile over the match without changing location', () => {
    render(
      <MemoryRouter initialEntries={['/matches/bots']}>
        <MatchPage match={botMatch} />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(screen.getByText('BOT')).toBeInTheDocument();
    expect(screen.getByText('Boomer')).toHaveClass('font-medium');
    expect(
      screen
        .getByLabelText('Orange team, no longer in match')
        .querySelector('[data-team-number="1"]'),
    ).toHaveStyle({ backgroundColor: '#94a3b8' });
    expect(screen.queryByText('LEFT')).not.toBeInTheDocument();
    expect(screen.getByText('YOU')).toHaveClass(
      'inline-flex',
      'h-4',
      'items-center',
      'leading-none',
    );
    expect(
      screen.queryByRole('button', { name: 'View profile for Solo' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Solo').closest('th')?.querySelector('.lucide-history'),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByText('Boomer')
        .closest('th')
        ?.querySelector('.lucide-history'),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'View profile for Boomer (no longer in match)',
      }),
    );
    expect(screen.getByRole('dialog', { name: 'Boomer' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/matches/bots');
    expect(screen.getByRole('heading', { name: 'Boomer' })).toBeInTheDocument();
    expect(
      screen.queryByText('All-time player history'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Name-based identity')).toBeInTheDocument();
    expect(screen.queryByText('Unknown|0|0')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Close player profile' }),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/matches/bots');
  });

  it('keeps match filters collapsed until requested', () => {
    render(
      <MemoryRouter>
        <MatchPage match={botMatch} />
      </MemoryRouter>,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'View profile for Boomer (no longer in match)',
      }),
    );

    const filters = screen.getByRole('button', { name: 'Filters' });
    expect(filters).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Relationship')).not.toBeInTheDocument();
    fireEvent.click(filters);
    expect(filters).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Relationship')).toBeInTheDocument();
    fireEvent.click(filters);
    expect(filters).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Relationship')).not.toBeInTheDocument();
  });

  it('does not offer bots as the selected user profile', () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    fireEvent.focus(screen.getByRole('combobox', { name: 'Search players' }));
    expect(screen.getByRole('option', { name: /You/ })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /Boomer/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Use player' })).toBeDisabled();
  });

  it('enables Use player only after selecting a different player', () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    const usePlayer = screen.getByRole('button', { name: 'Use player' });
    expect(usePlayer).toBeDisabled();

    fireEvent.focus(screen.getByRole('combobox', { name: 'Search players' }));
    fireEvent.click(screen.getByRole('option', { name: /Teammate/ }));
    expect(usePlayer).toBeEnabled();
  });

  it('highlights player selection until a profile is chosen', () => {
    mocks.profile = undefined;
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    const section = screen
      .getByRole('heading', { name: 'Select your player' })
      .closest('section');
    expect(section).toHaveClass('ring-2', 'ring-cyan-400/40');
    expect(
      screen.getByText('Choose a player to personalize your Fennec view.'),
    ).toBeInTheDocument();
  });
});
