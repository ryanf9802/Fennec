import { inferInitialProfile } from '../src/domain/profileInference';
import type { MatchState, ParticipantState } from '../src/domain/types';

function participant(
  name: string,
  primaryId: string,
  shortcut: number,
  teamNumber: number,
): ParticipantState {
  return {
    name,
    primaryId,
    shortcut,
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

function match(overrides: Partial<MatchState> = {}): MatchState {
  return {
    id: 'live-match',
    lifecycle: 'live',
    startedAt: '2026-08-13T00:00:00Z',
    lastEventAt: '2026-08-13T00:00:01Z',
    playlistId: 11,
    playlistName: 'Ranked Doubles',
    playlistCategory: 'ranked',
    arena: 'DFH Stadium',
    timeSeconds: 300,
    isOvertime: false,
    isReplay: false,
    teams: [],
    participants: [],
    events: [],
    ...overrides,
  };
}

describe('initial profile inference', () => {
  const you = participant('You', 'Steam|you|0', 1, 0);
  const teammate = participant('Teammate', 'Epic|mate|0', 2, 0);

  it('resolves the sole trackable training player', () => {
    expect(
      inferInitialProfile(
        match({
          playlistId: 9,
          playlistName: 'Training',
          playlistCategory: 'unknown',
          participants: [you, participant('Bot', 'Unknown|0|0', 2, 1)],
        }),
      ),
    ).toEqual({
      status: 'resolved',
      profile: { primaryId: 'Steam|you|0', displayName: 'You' },
    });
  });

  it('resolves a normal-play view target by shortcut', () => {
    expect(
      inferInitialProfile(
        match({
          participants: [you, teammate],
          viewTarget: { name: 'Stale name', shortcut: 1, teamNumber: 1 },
        }),
      ),
    ).toEqual({
      status: 'resolved',
      profile: { primaryId: 'Steam|you|0', displayName: 'You' },
    });
  });

  it('falls back to a unique normalized name and team', () => {
    expect(
      inferInitialProfile(
        match({
          participants: [you, teammate],
          viewTarget: { name: ' YOU ', teamNumber: 0 },
        }),
      ),
    ).toEqual({
      status: 'resolved',
      profile: { primaryId: 'Steam|you|0', displayName: 'You' },
    });
  });

  it('waits for a usable non-replay roster', () => {
    expect(inferInitialProfile(match())).toEqual({ status: 'pending' });
    expect(
      inferInitialProfile(
        match({
          participants: [participant('Unknown', 'Unknown|0|0', 1, 0)],
          viewTarget: { name: 'Unknown', shortcut: 1, teamNumber: 0 },
        }),
      ),
    ).toEqual({ status: 'pending' });
    expect(
      inferInitialProfile(
        match({
          isReplay: true,
          participants: [you],
          viewTarget: { name: 'You', shortcut: 1, teamNumber: 0 },
        }),
      ),
    ).toEqual({ status: 'pending' });
  });

  it('fails closed when usable player data is ambiguous or untargeted', () => {
    expect(
      inferInitialProfile(match({ participants: [you, teammate] })),
    ).toEqual({ status: 'failed' });
    expect(
      inferInitialProfile(
        match({
          playlistId: 9,
          playlistName: 'Training',
          playlistCategory: 'unknown',
          participants: [you, teammate],
        }),
      ),
    ).toEqual({ status: 'failed' });
  });
});
