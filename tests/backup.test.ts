import { createBackup, matchesCsv, parseBackup } from '../src/data/backup';
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
  isOvertime: false,
  isReplay: false,
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
      payload: { Players: [{ Name: 'Me', TeamNum: 0 }] },
    },
    {
      id: 'one:2',
      matchId: 'one',
      sequence: 2,
      eventName: 'BallHit',
      receivedAt: '2026-08-08T00:01:01Z',
      payload: { Players: [{ Name: 'Mate', TeamNum: 0 }] },
    },
  ],
};

describe('portable data', () => {
  it('round-trips the versioned backup', () => {
    const backup = createBackup(
      [{ ...value, sessionEndedAfter: true }],
      defaultSettings,
      {
        primaryId: 'Steam|1|0',
        displayName: 'Me',
      },
    );
    expect(parseBackup(JSON.stringify(backup)).matches[0]).toMatchObject({
      id: 'one',
      sessionEndedAfter: true,
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
  it('defaults older backups without a saved telemetry view', () => {
    const backup = createBackup([value], defaultSettings);
    const legacySettings: Partial<typeof backup.settings> = {
      ...backup.settings,
    };
    Reflect.deleteProperty(legacySettings, 'matchAnalyticsView');
    const parsed = parseBackup(
      JSON.stringify({ ...backup, version: 2, settings: legacySettings }),
    );
    expect(parsed.settings.matchAnalyticsView).toBe('analytics');
  });
  it('exports profile match summaries as CSV', () => {
    const csv = matchesCsv([value], 'Steam|1|0');
    expect(csv).toContain('"win","2","1","2"');
    expect(csv).toContain('"assists","passes","fifties","saves"');
    expect(csv).toContain('"car_touches","ball_hits"');
  });
});
