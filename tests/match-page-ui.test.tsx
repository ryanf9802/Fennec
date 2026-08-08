import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MatchState } from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  deleteMatch: vi.fn(),
  matchQuery: {
    data: undefined as MatchState | undefined,
    isLoading: false,
    isError: false,
  },
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    settings: {
      timelinePreset: 'curated',
      enabledTimelineEvents: [],
      timelineAttributes: {},
    },
    profile: undefined,
    deleteMatch: mocks.deleteMatch,
  }),
}));
vi.mock('../src/data/historyQueries', () => ({
  useMatch: () => mocks.matchQuery,
}));
vi.mock('../src/components/MatchAnalytics', () => ({
  MatchAnalytics: () => null,
}));
vi.mock('../src/components/PlayerProfileDialog', () => ({
  PlayerProfileDialog: () => null,
}));
vi.mock('../src/components/Timeline', () => ({ Timeline: () => null }));

import { MatchPage } from '../src/pages/MatchPage';

const historicalMatch: MatchState = {
  id: 'history-one',
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
  winnerTeamNumber: 0,
  teams: [
    { teamNumber: 0, name: 'Blue', score: 2, colorPrimary: '' },
    { teamNumber: 1, name: 'Orange', score: 1, colorPrimary: '' },
  ],
  participants: [],
  events: [],
};

function renderHistoricalMatch() {
  mocks.matchQuery.data = historicalMatch;
  return render(
    <MemoryRouter initialEntries={['/matches/history-one']}>
      <Routes>
        <Route path="/matches/:matchId" element={<MatchPage />} />
        <Route path="/" element={<h1>Game timeline destination</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('historical match deletion', () => {
  beforeEach(() => {
    mocks.deleteMatch.mockReset();
    vi.restoreAllMocks();
  });

  it('opens a confirmation dialog, disables it while deleting, and returns to history', async () => {
    let finish!: (deleted: boolean) => void;
    mocks.deleteMatch.mockReturnValue(
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    );
    renderHistoricalMatch();

    const deleteTrigger = screen.getByRole('button', { name: 'Delete match' });
    expect(deleteTrigger.closest('p')).toHaveTextContent('DFH Stadium ·');
    fireEvent.click(deleteTrigger);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('heading')).toHaveTextContent(
      'Delete this match?',
    );
    expect(dialog).toHaveTextContent('removed from history and all stats');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete match' }),
    );
    expect(
      within(dialog).getByRole('button', { name: 'Deleting…' }),
    ).toBeDisabled();
    expect(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    ).toBeDisabled();
    await act(async () => finish(true));

    expect(
      await screen.findByRole('heading', { name: 'Game timeline destination' }),
    ).toBeInTheDocument();
    expect(mocks.deleteMatch).toHaveBeenCalledWith('history-one');
  });

  it('leaves the match in place when confirmation is cancelled', () => {
    renderHistoricalMatch();

    fireEvent.click(screen.getByRole('button', { name: 'Delete match' }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(mocks.deleteMatch).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Ranked Doubles' }),
    ).toBeInTheDocument();
  });

  it('reports a deletion failure without navigating away', async () => {
    mocks.deleteMatch.mockRejectedValue(new Error('storage unavailable'));
    renderHistoricalMatch();

    fireEvent.click(screen.getByRole('button', { name: 'Delete match' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Delete match' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not delete match: storage unavailable',
    );
    expect(
      within(dialog).getByRole('button', { name: 'Delete match' }),
    ).toBeEnabled();
  });

  it('does not expose deletion on the live monitor', () => {
    render(
      <MemoryRouter>
        <MatchPage match={{ ...historicalMatch, lifecycle: 'live' }} />
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('button', { name: 'Delete match' }),
    ).not.toBeInTheDocument();
  });
});
