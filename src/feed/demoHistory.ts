import type {
  MatchState,
  ParticipantState,
  TimelineEvent,
} from '../domain/types';

const basePlayers = {
  you: ['You', 'Steam|demo-you|0'],
  luna: ['Luna', 'Epic|demo-luna|0'],
  drift: ['Drift', 'Steam|demo-drift|0'],
  orbit: ['Orbit', 'Epic|demo-orbit|0'],
} as const;

function player(
  key: keyof typeof basePlayers,
  teamNumber: number,
  goals: number,
  score: number,
): ParticipantState {
  const [name, primaryId] = basePlayers[key];
  return {
    name,
    primaryId,
    shortcut: Object.keys(basePlayers).indexOf(key) + 1,
    teamNumber,
    score,
    goals,
    assists: goals ? 0 : 1,
    passes: key === 'you' ? 1 : 0,
    fifties: key === 'you' ? 2 : 1,
    saves: 1,
    shots: goals + 2,
    touches: 24 + goals * 5,
    carTouches: 7 + goals,
    demos: 0,
    loadout: [],
    isPresent: true,
  };
}

function event(
  matchId: string,
  sequence: number,
  receivedAt: string,
  scorer: string,
): TimelineEvent {
  return {
    id: `${matchId}:${sequence}`,
    matchId,
    sequence,
    eventName: 'GoalScored',
    receivedAt,
    matchClockSeconds: 180,
    elapsedSeconds: 120,
    payload: {
      Scorer: { Name: scorer },
      GoalSpeed: 98.6 + sequence,
      ImpactLocation: { X: 650, Y: 5000, Z: 550 },
    },
  };
}

function demoTeams(id: string, blueScore: number, orangeScore: number) {
  if (id === 'demo-history-1')
    return [
      {
        teamNumber: 0,
        name: 'Neon Foxes',
        score: blueScore,
        colorPrimary: '65D9EE',
        colorSecondary: '2563EB',
      },
      {
        teamNumber: 1,
        name: 'Solar Flare',
        score: orangeScore,
        colorPrimary: 'FACC15',
        colorSecondary: 'EF4444',
      },
    ];
  return [
    {
      teamNumber: 0,
      name: 'Blue',
      score: blueScore,
      colorPrimary: '42d9ff',
      colorSecondary: '2563eb',
    },
    {
      teamNumber: 1,
      name: 'Orange',
      score: orangeScore,
      colorPrimary: 'ff8a3d',
      colorSecondary: 'c2410c',
    },
  ];
}

function demoMatch(
  id: string,
  startedAt: Date,
  teammates: boolean,
  won: boolean,
  blueScore: number,
  orangeScore: number,
): MatchState {
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
    regulationDurationSeconds: 300,
    elapsedSeconds: 300,
    isOvertime: false,
    isReplay: false,
    winnerTeamNumber: won ? youTeam : 1,
    teams: demoTeams(id, blueScore, orangeScore),
    participants: teammates
      ? [
          player('you', 0, Math.max(1, blueScore - 1), 510),
          player('luna', 0, 1, 360),
          player('drift', 1, orangeScore, 390),
          player('orbit', 1, 0, 220),
        ]
      : [
          player('you', 0, blueScore, 480),
          player('orbit', 0, 0, 280),
          player('luna', 1, Math.max(1, orangeScore - 1), 430),
          player('drift', 1, 1, 340),
        ],
    capture: {
      version: 1,
      updateStatePackets: 600,
      activePlayPackets: 580,
      ballSpeed: { samples: 580, sum: 580 * 825, min: 0, max: 1720 },
      lastTouchSamplesByTeam: { 0: won ? 330 : 250, 1: won ? 250 : 330 },
    },
    events: [
      {
        id: `${id}:1`,
        matchId: id,
        sequence: 1,
        eventName: 'BallHit',
        receivedAt: new Date(startedAt.getTime() + 60_000).toISOString(),
        matchClockSeconds: 240,
        elapsedSeconds: 60,
        payload: {
          Players: [{ Name: 'You', Shortcut: 1, TeamNum: 0 }],
          Ball: {
            PreHitSpeed: 540,
            PostHitSpeed: 1120,
            Location: { X: -1200, Y: -900, Z: 170 },
          },
        },
      },
      {
        id: `${id}:2`,
        matchId: id,
        sequence: 2,
        eventName: 'BallHit',
        receivedAt: new Date(startedAt.getTime() + 90_000).toISOString(),
        matchClockSeconds: 210,
        elapsedSeconds: 90,
        payload: {
          Players: [
            { Name: 'You', Shortcut: 1, TeamNum: 0 },
            {
              Name: teammates ? 'Drift' : 'Luna',
              Shortcut: teammates ? 3 : 2,
              TeamNum: 1,
            },
          ],
          Ball: {
            PreHitSpeed: 720,
            PostHitSpeed: 980,
            Location: { X: 300, Y: 1200, Z: 320 },
          },
        },
      },
      {
        id: `${id}:3`,
        matchId: id,
        sequence: 3,
        eventName: 'BallHit',
        receivedAt: new Date(startedAt.getTime() + 110_000).toISOString(),
        matchClockSeconds: 190,
        elapsedSeconds: 110,
        payload: {
          Players: [{ Name: 'You', Shortcut: 1, TeamNum: 0 }],
          Ball: {
            PreHitSpeed: 860,
            PostHitSpeed: 1260,
            Location: { X: 480, Y: 3600, Z: 260 },
          },
        },
      },
      event(
        id,
        4,
        new Date(startedAt.getTime() + 2 * 60_000).toISOString(),
        'You',
      ),
      {
        id: `${id}:5`,
        matchId: id,
        sequence: 5,
        eventName: 'MatchEnded',
        receivedAt: endedAt,
        matchClockSeconds: 0,
        elapsedSeconds: 300,
        payload: { WinnerTeamNum: won ? 0 : 1 },
      },
    ],
  };
}

export function createDemoHistory(now = new Date()): MatchState[] {
  return [
    demoMatch(
      'demo-history-1',
      new Date(now.getTime() - 27 * 60 * 60_000),
      true,
      true,
      3,
      1,
    ),
    demoMatch(
      'demo-history-2',
      new Date(now.getTime() - 26.8 * 60 * 60_000),
      false,
      false,
      1,
      2,
    ),
    demoMatch(
      'demo-current-1',
      new Date(now.getTime() - 24 * 60_000),
      true,
      true,
      4,
      2,
    ),
    demoMatch(
      'demo-current-2',
      new Date(now.getTime() - 13 * 60_000),
      true,
      false,
      1,
      3,
    ),
  ];
}
