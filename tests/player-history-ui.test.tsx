import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MatchPage } from '../src/pages/MatchPage';
import { PlayerHistoryPage } from '../src/pages/PlayerHistoryPage';
import { ProfilePage } from '../src/pages/ProfilePage';
import { defaultSettings, type MatchState } from '../src/domain/types';

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    profile: { primaryId: 'Steam|you|0', displayName: 'You' },
    settings: defaultSettings,
    selectProfile: vi.fn(),
  }),
}));

const botMatch: MatchState = {
  id: 'bots', lifecycle: 'completed', startedAt: '2026-08-08T00:00:00Z', lastEventAt: '2026-08-08T00:05:00Z', endedAt: '2026-08-08T00:05:00Z',
  playlistId: 6, playlistName: 'Private Match', playlistCategory: 'private', arena: 'Street', timeSeconds: 0, isOvertime: false, isReplay: false,
  winnerTeamNumber: 0, teams: [{ teamNumber: 0, name: 'Blue', score: 1, colorPrimary: '' }, { teamNumber: 1, name: 'Orange', score: 0, colorPrimary: '' }],
  participants: [
    { name: 'You', primaryId: 'Steam|you|0', shortcut: 1, teamNumber: 0, score: 100, goals: 1, assists: 0, saves: 0, shots: 1, touches: 5, demos: 0 },
    { name: 'Boomer', primaryId: 'Unknown|0|0', shortcut: 2, teamNumber: 1, score: 50, goals: 0, assists: 0, saves: 1, shots: 0, touches: 4, demos: 0 },
  ],
  events: [],
};

const playerHistory = {
  pages: [{
    summary: { playerKey: 'name:boomer', identityKind: 'name' as const, latestName: 'Boomer', gamesTogether: 1, winsTogether: 1, lossesTogether: 0, gamesOpposed: 2, winsAgainst: 1, lossesAgainst: 1, firstSeen: botMatch.startedAt, lastSeen: botMatch.startedAt },
    matches: { items: [botMatch] },
  }],
};

vi.mock('../src/data/historyQueries', () => ({
  useMatch: () => ({ data: undefined, isLoading: false, isError: false }),
  usePlayerHistory: () => ({ data: playerHistory, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  usePlayers: () => ({ data: [
    { playerKey: 'id:Steam|you|0', primaryId: 'Steam|you|0', identityKind: 'platform', latestName: 'You', normalizedName: 'you', firstSeen: botMatch.startedAt, lastSeen: botMatch.startedAt },
    { playerKey: 'name:boomer', identityKind: 'name', latestName: 'Boomer', normalizedName: 'boomer', firstSeen: botMatch.startedAt, lastSeen: botMatch.startedAt },
  ] }),
  useOverview: () => ({ data: { matches: 1, sessions: 1, firstMatchStartedAt: botMatch.startedAt } }),
}));

function LocationProbe() {
  return <div data-testid="location">{useLocation().pathname}</div>;
}

describe('bot player history UI', () => {
  it('labels bots on the scoreboard and opens their name-based history', () => {
    render(<MemoryRouter initialEntries={['/matches/bots']}><Routes>
      <Route path="/matches/:matchId" element={<><MatchPage match={botMatch} /><LocationProbe /></>} />
      <Route path="/players/:playerId" element={<LocationProbe />} />
    </Routes></MemoryRouter>);

    expect(screen.getByText('BOT')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View history with Boomer' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/players/name%3Aboomer');
  });

  it('describes a bot history as name-based instead of showing a fake ID', () => {
    render(<MemoryRouter initialEntries={['/players/name%3Aboomer']}><Routes>
      <Route path="/players/:playerId" element={<PlayerHistoryPage />} />
    </Routes></MemoryRouter>);

    expect(screen.getByRole('heading', { name: 'Boomer' })).toBeInTheDocument();
    expect(screen.queryByText('All-time player history')).not.toBeInTheDocument();
    expect(screen.getByText('Name-based identity')).toBeInTheDocument();
    expect(screen.getByText('BOT')).toBeInTheDocument();
    expect(screen.queryByText('Unknown|0|0')).not.toBeInTheDocument();
  });

  it('does not offer bots as the selected user profile', () => {
    render(<MemoryRouter><ProfilePage /></MemoryRouter>);

    expect(screen.getByRole('option', { name: /You/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Boomer/ })).not.toBeInTheDocument();
  });
});
