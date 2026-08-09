import {
  createBackup,
  matchesCsv,
  parseBackup,
  streamBackup,
} from '../src/data/backup';
import { defaultSettings, type MatchState } from '../src/domain/types';

const value: MatchState = {
  id: 'one',
  lifecycle: 'completed',
  startedAt: '2026-08-08T00:00:00Z',
  lastEventAt: '2026-08-08T00:05:00Z',
  endedAt: '2026-08-08T00:05:00Z',
  playlistId: 11,
  playlistName: 'Ranked Doubles',
  playlistCategory: 'ranked',
  arena: 'DFH Stadium',
  timeSeconds: 0,
  elapsedSeconds: 300,
  isOvertime: false,
  isReplay: false,
  capture: {
    version: 1,
    updateStatePackets: 4,
    activePlayPackets: 4,
    ballSpeed: { samples: 2, sum: 600, min: 200, max: 400 },
    lastTouchSamplesByTeam: { 0: 3, 1: 1 },
  },
  winnerTeamNumber: 0,
  teams: [
    { teamNumber: 0, name: 'Blue', score: 2, colorPrimary: '' },
    { teamNumber: 1, name: 'Orange', score: 1, colorPrimary: '' },
  ],
  participants: [
    {
      name: 'Me',
      primaryId: 'Steam|1|0',
      teamNumber: 0,
      score: 500,
      goals: 2,
      assists: 0,
      passes: 1,
      fifties: 0,
      saves: 1,
      shots: 3,
      touches: 30,
      demos: 0,
    },
    {
      name: 'Mate',
      primaryId: 'Epic|2|0',
      teamNumber: 0,
      score: 250,
      goals: 0,
      assists: 1,
      passes: 0,
      fifties: 0,
      saves: 0,
      shots: 1,
      touches: 20,
      demos: 0,
    },
  ],
  events: [
    {
      id: 'one:1',
      matchId: 'one',
      sequence: 1,
      eventName: 'BallHit',
      receivedAt: '2026-08-08T00:01:00Z',
      payload: {
        Players: [{ Name: 'Me', TeamNum: 0, PrimaryId: 'Steam|1|0' }],
        Ball: {
          Location: { X: 1, Y: 2, Z: 3 },
          PreHitSpeed: 100,
          PostHitSpeed: 160,
        },
      },
    },
    {
      id: 'one:2',
      matchId: 'one',
      sequence: 2,
      eventName: 'BallHit',
      receivedAt: '2026-08-08T00:01:01Z',
      payload: {
        Players: [{ Name: 'Mate', TeamNum: 0, PrimaryId: 'Epic|2|0' }],
        Ball: {
          Location: { X: 4, Y: 5, Z: 6 },
          PreHitSpeed: 150,
          PostHitSpeed: 200,
        },
      },
    },
  ],
};

describe('portable data', () => {
  it('excludes training from JSON and CSV exports', () => {
    const training = {
      ...structuredClone(value),
      id: 'training',
      playlistId: 9,
      playlistName: 'Training',
    };

    expect(
      createBackup([training, value], defaultSettings).matches.map(
        (match) => match.id,
      ),
    ).toEqual(['one']);
    expect(matchesCsv([training, value], 'Steam|1|0')).not.toContain(
      'training',
    );
  });

  it('excludes training from streamed backups', async () => {
    const writes: string[] = [];
    const training = {
      ...structuredClone(value),
      id: 'training',
      playlistId: 9,
      playlistName: 'Training',
    };
    Object.defineProperty(window, 'showSaveFilePicker', {
      configurable: true,
      value: async () => ({
        createWritable: async () => ({
          write: async (chunk: string) => writes.push(chunk),
          close: async () => undefined,
        }),
      }),
    });

    async function* matches() {
      yield training;
      yield value;
    }

    try {
      expect(
        await streamBackup('backup.ndjson', matches(), defaultSettings),
      ).toBe(true);
      expect(writes.join('')).not.toContain('"id":"training"');
      expect(writes.join('')).toContain('"id":"one"');
    } finally {
      Reflect.deleteProperty(window, 'showSaveFilePicker');
    }
  });

  it('round-trips the versioned backup', () => {
    const backup = createBackup(
      [
        {
          ...value,
          sessionEndedAfter: true,
          sessionEndedAfterByPrimaryIds: ['Steam|viewer|0'],
          observedByPrimaryId: 'Steam|viewer|0',
        },
      ],
      defaultSettings,
      {
        primaryId: 'Steam|1|0',
        displayName: 'Me',
      },
    );
    expect(parseBackup(JSON.stringify(backup)).matches[0]).toMatchObject({
      id: 'one',
      sessionEndedAfter: true,
      sessionEndedAfterByPrimaryIds: ['Steam|viewer|0'],
      observedByPrimaryId: 'Steam|viewer|0',
    });
    expect(backup.version).toBe(5);
    expect(backup.matches[0]?.participants[0]?.passes).toBe(1);
    expect(backup.matches[0]?.participants[0]?.fifties).toBe(0);
  });
  it('imports and normalizes version 1 backups', () => {
    const backup = createBackup([value], defaultSettings);
    const parsed = parseBackup(JSON.stringify({ ...backup, version: 1 }));
    expect(parsed.version).toBe(5);
    expect(parsed.matches[0]?.participants[0]?.carTouches).toBe(0);
    expect(parsed.matches[0]?.participants[0]?.passes).toBe(1);
    expect(parsed.matches[0]?.participants[0]?.fifties).toBe(0);
  });
  it('imports the streamable version 3 record format', () => {
    const header = {
      format: 'fennec-backup',
      version: 3,
      encoding: 'ndjson',
      exportedAt: '2026-08-08T00:00:00Z',
      settings: defaultSettings,
    };
    const parsed = parseBackup(
      `${JSON.stringify(header)}\n${JSON.stringify({ type: 'match', value })}\n`,
    );
    expect(parsed.matches.map((match) => match.id)).toEqual(['one']);
  });
  it('rejects unrelated JSON', () =>
    expect(() => parseBackup('{"version":1}')).toThrow(/supported/));
  it('normalizes invalid settings from imported data', () => {
    const backup = createBackup([value], defaultSettings);
    const parsed = parseBackup(
      JSON.stringify({
        ...backup,
        settings: {
          ...backup.settings,
          webSocketPort: 1,
          sessionGapMinutes: 0,
          matchAnalyticsView: 'invalid',
        },
      }),
    );
    expect([
      parsed.settings.webSocketPort,
      parsed.settings.sessionGapMinutes,
      parsed.settings.matchAnalyticsView,
    ]).toEqual([49124, 30, 'analytics']);
  });
  it('defaults settings added after older backups were created', () => {
    const backup = createBackup([value], defaultSettings);
    const legacySettings: Partial<typeof backup.settings> = {
      ...backup.settings,
    };
    Reflect.deleteProperty(legacySettings, 'matchAnalyticsView');
    Reflect.deleteProperty(legacySettings, 'speedUnit');
    const parsed = parseBackup(
      JSON.stringify({ ...backup, version: 2, settings: legacySettings }),
    );
    expect(parsed.settings.matchAnalyticsView).toBe('analytics');
    expect(parsed.settings.speedUnit).toBe('kmh');
  });
  it('exports profile match summaries as CSV', () => {
    const csv = matchesCsv([value], 'Steam|1|0');
    const [header, row] = csv
      .split('\r\n')
      .map((line) => line.slice(1, -1).split('","'));
    expect(header).toEqual([
      'match_id',
      'started_at',
      'playlist',
      'lifecycle',
      'result',
      'team_score',
      'opponent_score',
      'goals',
      'assists',
      'passes',
      'fifties',
      'saves',
      'shots',
      'car_touches',
      'ball_hits',
      'average_post_hit_speed',
      'maximum_post_hit_speed',
      'player_name',
      'team_number',
      'score',
      'touches',
      'demos',
      'arena',
      'playlist_id',
      'playlist_category',
      'ended_at',
      'elapsed_seconds',
      'overtime',
      'team_ball_hits',
      'team_touch_share_pct',
      'average_speed_gain',
      'shooting_pct',
      'team_last_touch_control_pct',
      'match_average_ball_speed',
      'match_maximum_ball_speed',
    ]);
    expect(
      Object.fromEntries(header!.map((key, index) => [key, row![index]])),
    ).toMatchObject({
      match_id: 'one',
      result: 'win',
      team_score: '2',
      opponent_score: '1',
      goals: '2',
      ball_hits: '1',
      average_post_hit_speed: '160.0',
      maximum_post_hit_speed: '160.0',
      player_name: 'Me',
      team_number: '0',
      score: '500',
      touches: '30',
      demos: '0',
      arena: 'DFH Stadium',
      playlist_id: '11',
      playlist_category: 'ranked',
      ended_at: '2026-08-08T00:05:00Z',
      elapsed_seconds: '300',
      overtime: 'false',
      team_ball_hits: '2',
      team_touch_share_pct: '50.0',
      average_speed_gain: '60.0',
      shooting_pct: '66.7',
      team_last_touch_control_pct: '75.0',
      match_average_ball_speed: '300.0',
      match_maximum_ball_speed: '400.0',
    });
  });
  it('exports only chronological profile appearances', () => {
    const earlier = {
      ...structuredClone(value),
      id: 'earlier',
      startedAt: '2026-08-07T23:00:00Z',
    };
    const unrelated = structuredClone(value);
    unrelated.id = 'unrelated';
    unrelated.participants[0]!.primaryId = 'Epic|9|0';

    const csv = matchesCsv([value, unrelated, earlier], 'Steam|1|0');
    expect(csv.split('\r\n').map((line) => line.split(',')[0])).toEqual([
      '"match_id"',
      '"earlier"',
      '"one"',
    ]);
  });
  it('escapes exported player names for spreadsheet import', () => {
    const named = structuredClone(value);
    named.participants[0]!.name = 'Me, "Ace"';

    expect(matchesCsv([named], 'Steam|1|0')).toContain('"Me, ""Ace"""');
  });
  it('uses retained ball-hit events when snapshot capture is unavailable', () => {
    const semanticOnly = structuredClone(value);
    delete semanticOnly.capture;

    const [header, row] = matchesCsv([semanticOnly], 'Steam|1|0')
      .split('\r\n')
      .map((line) => line.slice(1, -1).split('","'));
    const result = Object.fromEntries(
      header!.map((key, index) => [key, row![index]]),
    );
    expect(result).toMatchObject({
      ball_hits: '1',
      team_ball_hits: '2',
      team_touch_share_pct: '50.0',
      average_speed_gain: '60.0',
      match_average_ball_speed: '',
      match_maximum_ball_speed: '',
    });
  });
  it('leaves unavailable telemetry and ratios blank while preserving zeros', () => {
    const legacy = structuredClone(value);
    delete legacy.capture;
    delete legacy.elapsedSeconds;
    legacy.events = [];
    legacy.participants[0]!.shots = 0;

    const [header, row] = matchesCsv([legacy], 'Steam|1|0')
      .split('\r\n')
      .map((line) => line.slice(1, -1).split('","'));
    const result = Object.fromEntries(
      header!.map((key, index) => [key, row![index]]),
    );
    expect(result).toMatchObject({
      shots: '0',
      demos: '0',
      elapsed_seconds: '',
      ball_hits: '',
      average_post_hit_speed: '',
      maximum_post_hit_speed: '',
      team_ball_hits: '',
      team_touch_share_pct: '',
      average_speed_gain: '',
      shooting_pct: '',
      team_last_touch_control_pct: '',
      match_average_ball_speed: '',
      match_maximum_ball_speed: '',
    });
  });
});
