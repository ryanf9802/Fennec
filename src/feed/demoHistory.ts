import type { MatchState, ParticipantState, TimelineEvent } from '../domain/types';

const basePlayers = {
  you: ['You', 'Steam|demo-you|0'],
  luna: ['Luna', 'Epic|demo-luna|0'],
  drift: ['Drift', 'Steam|demo-drift|0'],
  orbit: ['Orbit', 'Epic|demo-orbit|0'],
} as const;

function player(key: keyof typeof basePlayers, teamNumber: number, goals: number, score: number): ParticipantState {
  const [name, primaryId] = basePlayers[key];
  return { name, primaryId, teamNumber, score, goals, assists: goals ? 0 : 1, saves: 1, shots: goals + 2, touches: 24 + goals * 5, demos: 0 };
}

function event(matchId: string, sequence: number, receivedAt: string, scorer: string): TimelineEvent {
  return { id: `${matchId}:${sequence}`, matchId, sequence, eventName: 'GoalScored', receivedAt, matchClockSeconds: 180, payload: { Scorer: { Name: scorer }, GoalSpeed: 98.6 + sequence } };
}

function demoMatch(id: string, startedAt: Date, teammates: boolean, won: boolean, blueScore: number, orangeScore: number): MatchState {
  const endedAt = new Date(startedAt.getTime() + 5 * 60_000).toISOString();
  const youTeam = 0;
  return {
    id,
    matchGuid: id,
    lifecycle: 'completed',
    startedAt: startedAt.toISOString(),
    lastEventAt: endedAt,
    endedAt,
    playlistId: 11,
    playlistName: 'Ranked Doubles',
    playlistCategory: 'ranked',
    arena: 'DFH Stadium',
    timeSeconds: 0,
    isOvertime: false,
    isReplay: false,
    winnerTeamNumber: won ? youTeam : 1,
    teams: [{ teamNumber: 0, name: 'Blue', score: blueScore, colorPrimary: '42d9ff' }, { teamNumber: 1, name: 'Orange', score: orangeScore, colorPrimary: 'ff8a3d' }],
    participants: teammates
      ? [player('you', 0, Math.max(1, blueScore - 1), 510), player('luna', 0, 1, 360), player('drift', 1, orangeScore, 390), player('orbit', 1, 0, 220)]
      : [player('you', 0, blueScore, 480), player('orbit', 0, 0, 280), player('luna', 1, Math.max(1, orangeScore - 1), 430), player('drift', 1, 1, 340)],
    events: [event(id, 1, new Date(startedAt.getTime() + 2 * 60_000).toISOString(), 'You'), { id: `${id}:2`, matchId: id, sequence: 2, eventName: 'MatchEnded', receivedAt: endedAt, matchClockSeconds: 0, payload: { WinnerTeamNum: won ? 0 : 1 } }],
  };
}

export function createDemoHistory(now = new Date()): MatchState[] {
  return [
    demoMatch('demo-history-1', new Date(now.getTime() - 27 * 60 * 60_000), true, true, 3, 1),
    demoMatch('demo-history-2', new Date(now.getTime() - 26.8 * 60 * 60_000), false, false, 1, 2),
    demoMatch('demo-current-1', new Date(now.getTime() - 24 * 60_000), true, true, 4, 2),
    demoMatch('demo-current-2', new Date(now.getTime() - 13 * 60_000), true, false, 1, 3),
  ];
}
