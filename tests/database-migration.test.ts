import Dexie from 'dexie';
import { db, historyRepository } from '../src/data/database';
import { defaultSettings, type MatchState } from '../src/domain/types';

const legacyMatch: Omit<MatchState, 'events'> = {
  id: 'legacy', lifecycle: 'completed', startedAt: '2025-01-01T00:00:00Z', lastEventAt: '2025-01-01T00:05:00Z', endedAt: '2025-01-01T00:05:00Z',
  playlistId: 11, playlistName: 'Ranked Doubles', playlistCategory: 'ranked', arena: '', timeSeconds: 0, isOvertime: false, isReplay: false, winnerTeamNumber: 0,
  teams: [{ teamNumber: 0, name: 'Blue', score: 1, colorPrimary: '' }, { teamNumber: 1, name: 'Orange', score: 0, colorPrimary: '' }],
  participants: [
    { name: 'You', primaryId: 'Steam|migration-you|0', teamNumber: 0, score: 100, goals: 1, assists: 0, saves: 0, shots: 1, touches: 10, demos: 0 },
    { name: 'Other', primaryId: 'Epic|migration-other|0', teamNumber: 1, score: 50, goals: 0, assists: 0, saves: 0, shots: 1, touches: 8, demos: 0 },
  ],
};

describe('version 2 database migration', () => {
  beforeAll(async () => {
    db.close();
    await Dexie.delete('fennec');
    const legacy = new Dexie('fennec');
    legacy.version(2).stores({ matches: 'id, startedAt, lastEventAt, lifecycle, playlistCategory', events: 'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]', settings: 'key', profiles: 'key, primaryId' });
    await legacy.open();
    await legacy.table('matches').put(legacyMatch);
    await legacy.table('events').put({ id: 'legacy:1', matchId: 'legacy', sequence: 1, receivedAt: '2025-01-01T00:02:00Z', eventName: 'GoalScored', payload: { Scorer: { Name: 'You' }, GoalSpeed: 99, DebugOnly: 'raw' } });
    await legacy.table('settings').put({ key: 'settings', value: defaultSettings });
    legacy.close();
  });
  afterAll(async () => { await db.delete(); });

  it('atomically builds normalized history and searchable relationships', async () => {
    await historyRepository.initialize();
    const migrated = await historyRepository.getMatch('legacy');
    const playerHistory = await historyRepository.getPlayerHistory('Steam|migration-you|0', 'Epic|migration-other|0');

    expect(migrated?.participants).toHaveLength(2);
    expect(migrated?.events[0]?.payload.DebugOnly).toBeUndefined();
    expect(playerHistory.summary).toMatchObject({ gamesOpposed: 1, winsAgainst: 1 });
    expect(await db.rawEvents.count()).toBe(0);
  });
});
