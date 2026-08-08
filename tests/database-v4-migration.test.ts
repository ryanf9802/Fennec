import Dexie from 'dexie';
import { db, historyRepository } from '../src/data/database';

const startedAt = '2026-08-01T00:00:00Z';

describe('version 4 player-key migration', () => {
  beforeAll(async () => {
    db.close();
    await Dexie.delete('fennec');
    const legacy = new Dexie('fennec');
    legacy.version(3).stores({
      matches:
        'id, startedAt, [startedAt+id], lastEventAt, lifecycle, playlistCategory, playlistId, sessionId',
      events:
        'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
      rawEvents: 'id, matchId, receivedAt, [receivedAt+id]',
      appearances:
        'id, matchId, primaryId, [matchId+playerKey], [primaryId+startedAt+matchId], [primaryId+playlistCategory+startedAt+matchId], [primaryId+playlistId+startedAt+matchId], [primaryId+result+startedAt+matchId]',
      players: 'primaryId, normalizedName, firstSeen, lastSeen',
      pairs: 'id, matchId, [playerAId+playerBId+startedAt+matchId]',
      relationships: 'id, [playerAId+playerBId]',
      sessions: 'id, startedAt, [startedAt+id]',
      settings: 'key',
      profiles: 'key, primaryId',
      metadata: 'key',
    });
    await legacy.open();
    await legacy.table('matches').put({
      id: 'legacy-bot',
      sessionId: 'session',
      lifecycle: 'completed',
      startedAt,
      lastEventAt: startedAt,
      endedAt: startedAt,
      playlistId: 6,
      playlistName: 'Private Match',
      playlistCategory: 'private',
      arena: '',
      timeSeconds: 0,
      isOvertime: false,
      isReplay: false,
      winnerTeamNumber: 0,
      teams: [
        { teamNumber: 0, name: 'Blue', score: 1, colorPrimary: '' },
        { teamNumber: 1, name: 'Orange', score: 0, colorPrimary: '' },
      ],
    });
    const base = {
      matchId: 'legacy-bot',
      startedAt,
      playlistId: 6,
      playlistCategory: 'private',
      result: 'win',
      score: 100,
      goals: 0,
      assists: 0,
      passes: 0,
      saves: 0,
      shots: 1,
      touches: 5,
      demos: 0,
    };
    await legacy.table('appearances').bulkPut([
      {
        ...base,
        id: 'legacy-bot\u0000id:Steam|you|0',
        playerKey: 'id:Steam|you|0',
        name: 'You',
        primaryId: 'Steam|you|0',
        shortcut: 1,
        teamNumber: 0,
      },
      {
        ...base,
        id: 'legacy-bot\u0000id:Epic|mate|0',
        playerKey: 'id:Epic|mate|0',
        name: 'Mate',
        primaryId: 'Epic|mate|0',
        shortcut: 3,
        teamNumber: 0,
      },
      {
        ...base,
        id: 'legacy-bot\u0000id:Unknown|0|0',
        playerKey: 'id:Unknown|0|0',
        name: 'Boomer',
        primaryId: 'Unknown|0|0',
        shortcut: 2,
        teamNumber: 1,
        result: 'loss',
      },
    ]);
    await legacy.table('events').bulkPut([
      {
        id: 'legacy-bot:1',
        matchId: 'legacy-bot',
        sequence: 1,
        receivedAt: startedAt,
        eventName: 'BallHit',
        payload: { Players: [{ Name: 'You', Shortcut: 1, TeamNum: 0 }] },
      },
      {
        id: 'legacy-bot:2',
        matchId: 'legacy-bot',
        sequence: 2,
        receivedAt: startedAt,
        eventName: 'BallHit',
        payload: { Players: [{ Name: 'Mate', Shortcut: 3, TeamNum: 0 }] },
      },
      {
        id: 'legacy-bot:3',
        matchId: 'legacy-bot',
        sequence: 3,
        receivedAt: startedAt,
        eventName: 'GoalScored',
        payload: { Scorer: { Name: 'You' } },
      },
    ]);
    await legacy.table('rawEvents').bulkPut([
      {
        id: 'legacy-bot:1',
        matchId: 'legacy-bot',
        receivedAt: startedAt,
        payload: { Players: [{ Name: 'You', Shortcut: 1, TeamNum: 0 }] },
      },
      {
        id: 'legacy-bot:2',
        matchId: 'legacy-bot',
        receivedAt: startedAt,
        payload: { Players: [{ Name: 'Mate', Shortcut: 3, TeamNum: 0 }] },
      },
      {
        id: 'legacy-bot:3',
        matchId: 'legacy-bot',
        receivedAt: startedAt,
        payload: { Scorer: { Name: 'You' }, DebugOnly: 'preserved' },
      },
    ]);
    await legacy.table('metadata').put({ key: 'normalized-v4', value: true });
    legacy.close();
  });

  afterAll(async () => {
    await db.delete();
  });

  it('rebuilds persisted appearances and relationships with name identities', async () => {
    await historyRepository.initialize();

    const migrated = await historyRepository.getMatch('legacy-bot');
    expect(migrated?.participants.map((player) => player.name)).toEqual(
      expect.arrayContaining(['You', 'Mate', 'Boomer']),
    );
    expect(migrated?.participants).toHaveLength(3);
    expect(
      migrated?.participants.find((player) => player.name === 'You')?.passes,
    ).toBe(1);
    expect((await db.metadata.get('normalized-v5'))?.value).toBe(true);
    expect(
      migrated?.events.find((event) => event.eventName === 'GoalScored')
        ?.payload.DebugOnly,
    ).toBe('preserved');
    expect(
      await historyRepository.getPlayerHistory('id:Steam|you|0', 'name:boomer'),
    ).toMatchObject({
      summary: {
        playerKey: 'name:boomer',
        identityKind: 'name',
        latestName: 'Boomer',
        gamesOpposed: 1,
      },
    });
  });
});
