import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/components/AppShell';
import { defaultSettings, type MatchState } from '../src/domain/types';

const mocks = vi.hoisted(() => ({
  activeMatch: undefined as MatchState | undefined,
  setupState: 'complete' as 'complete' | 'incomplete',
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
vi.mock('../src/setup/SetupStatusContext', () => ({
  useSetupStatus: () => ({ state: mocks.setupState }),
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
    timeSeconds: 0,
    isOvertime: false,
    isReplay: false,
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
        passes: 0,
        fifties: 0,
      },
    ],
    events: [],
  };
}

describe('profile-scoped live navigation', () => {
  beforeEach(() => {
    mocks.activeMatch = undefined;
    mocks.setupState = 'complete';
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
    for (const link of screen.getAllByRole('link', { name: 'Live match' }))
      expect(link).toHaveAttribute('href', '/live');
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
    for (const link of screen.getAllByRole('link', { name: 'Live training' }))
      expect(link).toHaveAttribute('href', '/live');
  });

  it('keeps setup and settings usable while game navigation is locked', () => {
    mocks.setupState = 'incomplete';
    mocks.activeMatch = liveMatch('Steam|you|0');
    render(
      <MemoryRouter>
        <AppShell>Content</AppShell>
      </MemoryRouter>,
    );

    expect(
      screen
        .getAllByLabelText('Games')
        .every((item) => item.getAttribute('aria-disabled') === 'true'),
    ).toBe(true);
    expect(
      screen
        .getAllByLabelText('Profile')
        .every((item) => item.getAttribute('aria-disabled') === 'true'),
    ).toBe(true);
    expect(
      screen
        .getAllByLabelText('Live match')
        .every((item) => item.getAttribute('aria-disabled') === 'true'),
    ).toBe(true);
    expect(screen.getAllByRole('link', { name: 'Setup' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: 'Settings' })).toHaveLength(2);
  });

  it('hides Setup after a completed user leaves it', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <AppShell>Content</AppShell>
      </MemoryRouter>,
    );
    expect(
      screen.queryByRole('link', { name: 'Setup' }),
    ).not.toBeInTheDocument();

    mocks.setupState = 'incomplete';
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <AppShell>Content</AppShell>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: 'Setup' })).toHaveLength(2);
  });
});
