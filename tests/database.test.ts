import { db, clearHistory, loadMatches, loadProfile, loadSettings, replaceAll, saveMatch, saveProfile, saveSettings } from '../src/data/database';
import { defaultSettings, type MatchState } from '../src/domain/types';

const match: MatchState = { id: 'stored', lifecycle: 'completed', startedAt: '2026-08-08T00:00:00Z', lastEventAt: '2026-08-08T00:05:00Z', endedAt: '2026-08-08T00:05:00Z', playlistId: 11, playlistName: 'Ranked Doubles', playlistCategory: 'ranked', arena: '', timeSeconds: 0, isOvertime: false, isReplay: false, teams: [], participants: [], events: [{ id: 'stored:1', matchId: 'stored', sequence: 1, eventName: 'GoalScored', receivedAt: '2026-08-08T00:02:00Z', payload: { GoalSpeed: 100 } }] };

describe('IndexedDB storage', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });
  afterAll(async () => { await db.delete(); });

  it('hydrates normalized events with matches', async () => {
    await saveMatch(match);
    const loaded = await loadMatches();
    expect(loaded[0]?.events[0]?.payload.GoalSpeed).toBe(100);
  });

  it('stores settings and profile independently', async () => {
    await saveSettings({ ...defaultSettings, sessionGapMinutes: 45 });
    await saveProfile({ primaryId: 'Steam|1|0', displayName: 'Me' });
    expect((await loadSettings()).sessionGapMinutes).toBe(45);
    expect((await loadProfile())?.displayName).toBe('Me');
  });

  it('restores and deletes history transactionally', async () => {
    await replaceAll([match], defaultSettings, { primaryId: 'Steam|1|0', displayName: 'Me' });
    expect(await db.events.count()).toBe(1);
    await clearHistory();
    expect(await loadMatches()).toEqual([]);
    expect((await loadProfile())?.primaryId).toBe('Steam|1|0');
  });
});
