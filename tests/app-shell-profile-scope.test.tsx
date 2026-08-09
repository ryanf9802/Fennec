import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/components/AppShell';
import { defaultSettings, type MatchState } from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  activeMatch: undefined as MatchState | undefined,
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({
    activeMatch: mocks.activeMatch,
    connection: 'waiting',
    demoMode: false,
    profile: { primaryId: 'Steam|you|0', displayName: 'You' },
    settings: defaultSettings,
    updateSettings: vi.fn(),
  }),
}));

function liveMatch(primaryId: string): MatchState {
  return {
    id: 'live',
    matchGuid: 'live',
    startedAt: '2026-08-09T00:00:00Z',
    lastEventAt: '2026-08-09T00:00:00Z',
    lifecycle: 'live',
    playlistId: 0,
    playlistName: 'Private Match',
    playlistCategory: 'private',
    arena: 'DFH Stadium',
    teams: [],
    participants: [
      {
        name: 'Player',
        primaryId,
        teamNumber: 0,
        score: 0,
        goals: 0,
        assists: 0,
        saves: 0,
        shots: 0,
        touches: 0,
        demos: 0,
      },
    ],
    events: [],
  };
}

describe('profile-scoped live navigation', () => {
  beforeEach(() => {
    mocks.activeMatch = undefined;
  });

  it('hides a live match unrelated to the selected player', () => {
    mocks.activeMatch = liveMatch('Epic|someone-else|0');
    render(
      <MemoryRouter>
        <AppShell>Content</AppShell>
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('link', { name: 'Live match' }),
    ).not.toBeInTheDocument();
  });

  it('shows a live match involving the selected player', () => {
    mocks.activeMatch = liveMatch('Steam|you|0');
    render(
      <MemoryRouter>
        <AppShell>Content</AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Live match' })).toHaveAttribute(
      'href',
      '/live',
    );
  });

  it('labels training separately from a live match', () => {
    mocks.activeMatch = {
      ...liveMatch('Steam|you|0'),
      playlistId: 9,
      playlistName: 'Training',
    };
    render(
      <MemoryRouter>
        <AppShell>Content</AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Live training' })).toHaveAttribute(
      'href',
      '/live',
    );
  });
});
