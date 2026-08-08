import { db, clearHistory, historyRepository, loadMatches, loadProfile, loadSettings, replaceAll, saveMatch, saveProfile, saveSettings } from '../src/data/database';
import { defaultSettings, type MatchState, type ParticipantState } from '../src/domain/types';

const match: MatchState = { id: 'stored', lifecycle: 'completed', startedAt: '2026-08-08T00:00:00Z', lastEventAt: '2026-08-08T00:05:00Z', endedAt: '2026-08-08T00:05:00Z', playlistId: 11, playlistName: 'Ranked Doubles', playlistCategory: 'ranked', arena: '', timeSeconds: 0, isOvertime: false, isReplay: false, teams: [], participants: [], events: [{ id: 'stored:1', matchId: 'stored', sequence: 1, eventName: 'GoalScored', receivedAt: '2026-08-08T00:02:00Z', payload: { GoalSpeed: 100 } }] };

function player(name: string, primaryId: string, teamNumber: number): ParticipantState {
  return { name, primaryId, teamNumber, score: 100, goals: 0, assists: 0, saves: 0, shots: 1, touches: 10, demos: 0 };
}

function playedMatch(id: string, startedAt: string, teammate: boolean, won: boolean): MatchState {
  const you = player('You', 'Steam|you|0', 0);
  const other = player('Other', 'Epic|other|0', teammate ? 0 : 1);
  return {
    ...match, id, matchGuid: id, startedAt, lastEventAt: startedAt, endedAt: startedAt,
    winnerTeamNumber: won ? 0 : 1, teams: [{ teamNumber: 0, name: 'Blue', score: won ? 2 : 1, colorPrimary: '' }, { teamNumber: 1, name: 'Orange', score: won ? 1 : 2, colorPrimary: '' }],
    participants: [you, other], events: [{ id: `${id}:1`, matchId: id, sequence: 1, eventName: 'GoalScored', receivedAt: startedAt, payload: { Scorer: { Name: won ? 'You' : 'Other' }, GoalSpeed: 100, DebugOnly: 'raw' } }],
  };
}

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

  it('queries a complete player relationship through stable cursor pages', async () => {
    await saveMatch(playedMatch('one', '2026-08-01T00:00:00Z', true, true));
    await saveMatch(playedMatch('two', '2026-08-02T00:00:00Z', false, false));
    await saveMatch(playedMatch('three', '2026-08-03T00:00:00Z', false, true));

    const first = await historyRepository.getPlayerHistory('Steam|you|0', 'Epic|other|0', { limit: 1, relationship: 'against' });
    expect(first.summary).toMatchObject({ gamesTogether: 1, winsTogether: 1, gamesOpposed: 2, winsAgainst: 1, lossesAgainst: 1 });
    expect(first.matches.items.map((item) => item.id)).toEqual(['three']);
    expect(first.matches.nextCursor).toBeTruthy();

    const second = await historyRepository.getPlayerHistory('Steam|you|0', 'Epic|other|0', { limit: 1, relationship: 'against', cursor: first.matches.nextCursor });
    expect(second.matches.items.map((item) => item.id)).toEqual(['two']);
    expect(second.matches.nextCursor).toBeUndefined();
  });

  it('expires raw payloads while retaining semantic event detail', async () => {
    const old = playedMatch('old', '2026-04-01T00:00:00Z', false, true);
    await saveMatch(old);
    expect(await db.rawEvents.count()).toBe(1);

    expect(await historyRepository.compactRawEvents(new Date('2026-08-08T00:00:00Z'))).toBe(1);
    const restored = await historyRepository.getMatch('old');
    expect(restored?.events[0]?.payload).toEqual({ Scorer: { Name: 'You' }, GoalSpeed: 100 });
    expect(await db.events.count()).toBe(1);
  });
});
