import {
  db,
  clearHistory,
  deleteMatch,
  historyRepository,
  loadMatches,
  loadProfile,
  loadSettings,
  replaceAll,
  saveMatch,
  saveProfile,
  saveSettings,
} from '../src/data/database';
import {
  defaultSettings,
  type MatchState,
  type ParticipantState,
} from '../src/domain/types';

const match: MatchState = {
  id: 'stored',
  lifecycle: 'completed',
  startedAt: '2026-08-08T00:00:00Z',
  lastEventAt: '2026-08-08T00:05:00Z',
  endedAt: '2026-08-08T00:05:00Z',
  playlistId: 11,
  playlistName: 'Ranked Doubles',
  playlistCategory: 'ranked',
  arena: '',
  timeSeconds: 0,
  isOvertime: false,
  isReplay: false,
  teams: [],
  participants: [],
  events: [
    {
      id: 'stored:1',
      matchId: 'stored',
      sequence: 1,
      eventName: 'GoalScored',
      receivedAt: '2026-08-08T00:02:00Z',
      payload: { GoalSpeed: 100 },
    },
  ],
};

function player(
  name: string,
  primaryId: string,
  teamNumber: number,
): ParticipantState {
  return {
    name,
    primaryId,
    teamNumber,
    score: 100,
    goals: 0,
    assists: 0,
    passes: 0,
    fifties: 0,
    saves: 0,
    shots: 1,
    touches: 10,
    demos: 0,
  };
}

function playedMatch(
  id: string,
  startedAt: string,
  teammate: boolean,
  won: boolean,
): MatchState {
  const you = player('You', 'Steam|you|0', 0);
  const other = player('Other', 'Epic|other|0', teammate ? 0 : 1);
  return {
    ...match,
    id,
    matchGuid: id,
    startedAt,
    lastEventAt: startedAt,
    endedAt: startedAt,
    winnerTeamNumber: won ? 0 : 1,
    teams: [
      { teamNumber: 0, name: 'Blue', score: won ? 2 : 1, colorPrimary: '' },
      { teamNumber: 1, name: 'Orange', score: won ? 1 : 2, colorPrimary: '' },
    ],
    participants: [you, other],
    events: [
      {
        id: `${id}:1`,
        matchId: id,
        sequence: 1,
        eventName: 'GoalScored',
        receivedAt: startedAt,
        payload: {
          Scorer: { Name: won ? 'You' : 'Other' },
          GoalSpeed: 100,
          DebugOnly: 'raw',
        },
      },
    ],
  };
}

describe('IndexedDB storage', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
  });
  afterAll(async () => {
    await db.delete();
  });

  it('hydrates normalized events with matches', async () => {
    await saveMatch(match);
    const loaded = await loadMatches();
    expect(loaded[0]?.events[0]?.payload.GoalSpeed).toBe(100);
  });

  it('does not persist training through live saves or restores', async () => {
    const training = {
      ...structuredClone(match),
      id: 'training',
      playlistId: 9,
      playlistName: 'Training',
    };

    await saveMatch(training);
    expect(await loadMatches()).toEqual([]);

    await replaceAll([training, match], defaultSettings);
    expect((await loadMatches()).map((item) => item.id)).toEqual(['stored']);
  });

  it('loads the latest match with participants and events', async () => {
    await saveMatch(playedMatch('older', '2026-08-08T00:00:00Z', true, true));
    await saveMatch(
      playedMatch('latest', '2026-08-08T00:10:00Z', false, false),
    );

    const latest = await historyRepository.loadLatestMatch();

    expect(latest?.id).toBe('latest');
    expect(
      latest?.participants.map((participant) => participant.name).sort(),
    ).toEqual(['Other', 'You']);
    expect(latest?.events[0]).toMatchObject({
      id: 'latest:1',
      eventName: 'GoalScored',
    });
  });

  it('stores settings and profile independently', async () => {
    await saveSettings({
      ...defaultSettings,
      sessionGapMinutes: 45,
      matchAnalyticsView: 'touch-map',
    });
    await saveProfile({ primaryId: 'Steam|1|0', displayName: 'Me' });
    expect(await loadSettings()).toMatchObject({
      sessionGapMinutes: 45,
      matchAnalyticsView: 'touch-map',
    });
    expect((await loadProfile())?.displayName).toBe('Me');
  });

  it('ends an idle session and preserves the boundary when settings rebuild', async () => {
    const profileKey = 'id:Steam|you|0';
    await saveMatch(playedMatch('one', '2026-08-08T00:00:00Z', true, true));
    await saveMatch(playedMatch('two', '2026-08-08T00:05:00Z', true, true));

    expect(await historyRepository.endCurrentSession(profileKey)).toBe('ended');
    expect(await historyRepository.endCurrentSession(profileKey)).toBe(
      'unchanged',
    );
    await saveMatch(playedMatch('three', '2026-08-08T00:10:00Z', true, true));
    await saveSettings({ ...defaultSettings, sessionGapMinutes: 60 });

    const sessions = (await historyRepository.listSessions(profileKey)).items;
    expect(
      sessions.map((session) => session.matches.map((item) => item.id)),
    ).toEqual([['three'], ['one', 'two']]);
    expect(sessions.map((session) => session.endedManually)).toEqual([
      false,
      true,
    ]);
    expect(
      (await historyRepository.listSessions('id:Epic|other|0')).items.map(
        (session) => session.matches.map((item) => item.id),
      ),
    ).toEqual([['one', 'two', 'three']]);

    expect(await deleteMatch('two')).toBe(true);
    await saveSettings({ ...defaultSettings, sessionGapMinutes: 90 });
    const rebuilt = (await historyRepository.listSessions(profileKey)).items;
    expect(
      rebuilt.map((session) => session.matches.map((item) => item.id)),
    ).toEqual([['three'], ['one']]);
    expect(rebuilt.map((session) => session.endedManually)).toEqual([
      false,
      true,
    ]);
  });

  it('moves a live game into a new session immediately', async () => {
    const profileKey = 'id:Steam|you|0';
    await saveMatch(playedMatch('one', '2026-08-08T00:00:00Z', true, true));
    const live = playedMatch('live', '2026-08-08T00:05:00Z', true, true);
    live.lifecycle = 'live';
    delete live.endedAt;
    await saveMatch(live);

    expect(await historyRepository.endCurrentSession(profileKey, live.id)).toBe(
      'split-live',
    );
    expect(await historyRepository.endCurrentSession(profileKey, live.id)).toBe(
      'unchanged',
    );
    await saveMatch({ ...live, lastEventAt: '2026-08-08T00:06:00Z' });
    await saveMatch(playedMatch('three', '2026-08-08T00:07:00Z', false, false));

    const sessions = (await historyRepository.listSessions(profileKey)).items;
    expect(
      sessions.map((session) => session.matches.map((item) => item.id)),
    ).toEqual([['live', 'three'], ['one']]);
    expect(sessions[1]?.endedManually).toBe(true);
  });

  it('restores and deletes history transactionally', async () => {
    await replaceAll([match], defaultSettings, {
      primaryId: 'Steam|1|0',
      displayName: 'Me',
    });
    expect(await db.events.count()).toBe(1);
    await clearHistory();
    expect(await loadMatches()).toEqual([]);
    expect((await loadProfile())?.primaryId).toBe('Steam|1|0');
  });

  it('queries a complete player relationship through stable cursor pages', async () => {
    await saveMatch(playedMatch('one', '2026-08-01T00:00:00Z', true, true));
    await saveMatch(playedMatch('two', '2026-08-02T00:00:00Z', false, false));
    await saveMatch(playedMatch('three', '2026-08-03T00:00:00Z', false, true));

    const first = await historyRepository.getPlayerHistory(
      'id:Steam|you|0',
      'id:Epic|other|0',
      { limit: 1, relationship: 'against' },
    );
    expect(first.summary).toMatchObject({
      gamesTogether: 1,
      winsTogether: 1,
      gamesOpposed: 2,
      winsAgainst: 1,
      lossesAgainst: 1,
    });
    expect(first.matches.items.map((item) => item.id)).toEqual(['three']);
    expect(first.matches.items[0]?.events).toEqual([]);
    expect((await historyRepository.getMatch('three'))?.events).toHaveLength(1);
    expect(first.matches.nextCursor).toBeTruthy();

    const second = await historyRepository.getPlayerHistory(
      'id:Steam|you|0',
      'id:Epic|other|0',
      { limit: 1, relationship: 'against', cursor: first.matches.nextCursor },
    );
    expect(second.matches.items.map((item) => item.id)).toEqual(['two']);
    expect(second.matches.nextCursor).toBeUndefined();
  });

  it('finds player history only when another shared match exists', async () => {
    const first = playedMatch('first', '2026-08-01T00:00:00Z', true, true);
    await saveMatch(first);

    expect(
      await historyRepository.listPlayerKeysWithHistory(
        'id:Steam|you|0',
        ['id:Epic|other|0'],
        first.id,
      ),
    ).toEqual([]);

    const live = playedMatch('live', '2026-08-02T00:00:00Z', false, false);
    live.lifecycle = 'live';
    delete live.endedAt;
    await saveMatch(live);
    expect(
      await historyRepository.listPlayerKeysWithHistory(
        'id:Steam|you|0',
        ['id:Epic|other|0'],
        live.id,
      ),
    ).toEqual(['id:Epic|other|0']);

    await saveMatch({
      ...live,
      lifecycle: 'completed',
      endedAt: live.lastEventAt,
    });
    expect(
      await historyRepository.listPlayerKeysWithHistory(
        'id:Steam|you|0',
        ['id:Epic|other|0'],
        live.id,
      ),
    ).toEqual(['id:Epic|other|0']);
  });

  it('scopes history to matches the profile played or observed', async () => {
    const played = playedMatch('played', '2026-08-01T00:00:00Z', false, true);
    const observed = playedMatch(
      'observed',
      '2026-08-01T00:10:00Z',
      false,
      false,
    );
    observed.participants = [
      player('Someone else', 'Epic|someone|0', 0),
      player('Opponent', 'Epic|opponent|0', 1),
    ];
    observed.observedByPrimaryId = 'Steam|you|0';
    const unrelated = {
      ...observed,
      id: 'unrelated',
      matchGuid: 'unrelated',
      startedAt: '2026-08-01T00:20:00Z',
      lastEventAt: '2026-08-01T00:20:00Z',
      endedAt: '2026-08-01T00:20:00Z',
      observedByPrimaryId: 'Steam|other-viewer|0',
      events: [],
    };
    await saveMatch(played);
    await saveMatch(observed);
    await saveMatch(unrelated);

    const profileKey = 'id:Steam|you|0';
    expect(await historyRepository.countMatches(profileKey)).toBe(2);
    expect(await historyRepository.countSessions(profileKey)).toBe(1);
    expect(
      (await historyRepository.listMatches({ profileKey })).items.map(
        (item) => item.id,
      ),
    ).toEqual(['observed', 'played']);
    expect(
      (await historyRepository.listSessions(profileKey)).items[0]?.matches.map(
        (item) => item.id,
      ),
    ).toEqual(['played', 'observed']);
    expect(
      await historyRepository.getMatch('observed', profileKey),
    ).toBeDefined();
    expect(
      await historyRepository.getMatch('unrelated', profileKey),
    ).toBeUndefined();
    expect(
      await historyRepository.getMatch('played', profileKey),
    ).toBeDefined();
  });

  it('builds and caches session boundaries independently for selected players', async () => {
    const first = playedMatch('first', '2026-08-01T00:00:00Z', true, true);
    const bridge = playedMatch('bridge', '2026-08-01T00:20:00Z', true, true);
    bridge.participants = [
      player('Other', 'Epic|other|0', 0),
      player('Third', 'Epic|third|0', 1),
    ];
    const last = playedMatch('last', '2026-08-01T00:40:00Z', true, true);
    await saveMatch(first);
    await saveMatch(bridge);
    await saveMatch(last);

    expect(await db.profileSessionCaches.count()).toBe(0);
    const you = await historyRepository.listSessions('id:Steam|you|0');
    expect(
      you.items.map((session) => session.matches.map((item) => item.id)),
    ).toEqual([['last'], ['first']]);
    expect(await db.profileSessionCaches.count()).toBe(1);
    expect(
      await db.profileSessions
        .where('playerKey')
        .equals('id:Epic|other|0')
        .count(),
    ).toBe(0);

    const other = await historyRepository.listSessions('id:Epic|other|0');
    expect(
      other.items.map((session) => session.matches.map((item) => item.id)),
    ).toEqual([['first', 'bridge', 'last']]);
    expect(await db.profileSessionCaches.count()).toBe(2);
  });

  it('refreshes only the active cache during repeated match checkpoints', async () => {
    const current = playedMatch('current', '2026-08-01T00:00:00Z', true, true);
    await saveMatch(current);
    await historyRepository.listSessions('id:Steam|you|0');
    await historyRepository.listSessions('id:Epic|other|0');
    await saveProfile({ primaryId: 'Steam|you|0', displayName: 'You' });

    await saveMatch({
      ...current,
      lastEventAt: '2026-08-01T00:05:00Z',
      endedAt: '2026-08-01T00:05:00Z',
    });

    expect(await db.profileSessionCaches.get('id:Steam|you|0')).toMatchObject({
      stale: 0,
    });
    expect(await db.profileSessionCaches.get('id:Epic|other|0')).toMatchObject({
      stale: 1,
    });
    expect(
      (await historyRepository.listSessions('id:Steam|you|0')).items[0]
        ?.endedAt,
    ).toBe('2026-08-01T00:05:00Z');

    await saveMatch(playedMatch('later', '2026-08-01T00:10:00Z', true, true));
    await historyRepository.listSessions('id:Steam|you|0');
    await saveMatch({
      ...current,
      lastEventAt: '2026-08-01T00:06:00Z',
      endedAt: '2026-08-01T00:06:00Z',
    });
    expect(await db.profileSessionCaches.get('id:Steam|you|0')).toMatchObject({
      stale: 1,
    });
  });

  it('deletes a match and repairs every affected history projection', async () => {
    await saveSettings({ ...defaultSettings, sessionGapMinutes: 30 });
    await saveProfile({ primaryId: 'Steam|you|0', displayName: 'You' });
    const first = playedMatch('first', '2026-08-08T00:00:00Z', false, true);
    const bridge = playedMatch('bridge', '2026-08-08T00:20:00Z', false, false);
    bridge.participants.push(player('Temporary', 'Epic|temporary|0', 1));
    bridge.events = [
      {
        id: 'bridge:1',
        matchId: 'bridge',
        sequence: 1,
        eventName: 'CrossbarHit',
        receivedAt: bridge.startedAt,
        payload: { BallSpeed: 777 },
      },
    ];
    const last = playedMatch('last', '2026-08-08T00:40:00Z', false, true);
    await saveMatch(first, 30);
    await saveMatch(bridge, 30);
    await saveMatch(last, 30);

    expect(await historyRepository.countSessions()).toBe(1);
    expect(
      await historyRepository.getPlayerHistory(
        'id:Steam|you|0',
        'id:Epic|other|0',
      ),
    ).toMatchObject({
      summary: { gamesOpposed: 3, winsAgainst: 2, lossesAgainst: 1 },
    });
    expect((await historyRepository.getTimelineCatalog()).CrossbarHit).toEqual([
      'BallSpeed',
    ]);

    expect(await deleteMatch('bridge')).toBe(true);
    expect(await historyRepository.getMatch('bridge')).toBeUndefined();
    expect(await historyRepository.countMatches()).toBe(2);
    expect(await historyRepository.countSessions()).toBe(2);
    expect(
      (await historyRepository.listSessions()).items.map((session) =>
        session.matches.map((item) => item.id),
      ),
    ).toEqual([['last'], ['first']]);
    expect(
      await historyRepository.getPlayerHistory(
        'id:Steam|you|0',
        'id:Epic|other|0',
      ),
    ).toMatchObject({
      summary: { gamesOpposed: 2, winsAgainst: 2, lossesAgainst: 0 },
    });
    expect(
      (await historyRepository.searchPlayers()).some(
        (item) => item.playerKey === 'id:Epic|temporary|0',
      ),
    ).toBe(false);
    expect(
      (await historyRepository.getTimelineCatalog()).CrossbarHit,
    ).toBeUndefined();
    expect(
      await Promise.all([
        db.events.where('matchId').equals('bridge').count(),
        db.rawEvents.where('matchId').equals('bridge').count(),
        db.appearances.where('matchId').equals('bridge').count(),
        db.profileMatches.where('matchId').equals('bridge').count(),
        db.pairs.where('matchId').equals('bridge').count(),
      ]),
    ).toEqual([0, 0, 0, 0, 0]);
    const exported: string[] = [];
    for await (const item of historyRepository.iterateMatches())
      exported.push(item.id);
    expect(exported).toEqual(['last', 'first']);
    expect((await loadProfile())?.primaryId).toBe('Steam|you|0');
    expect((await loadSettings()).sessionGapMinutes).toBe(30);
    expect(await deleteMatch('bridge')).toBe(false);
  });

  it('does not delete a live match that the feed can still update', async () => {
    await saveMatch({ ...match, id: 'live', lifecycle: 'live', events: [] });
    await expect(deleteMatch('live')).rejects.toThrow(
      'Live matches cannot be deleted.',
    );
    expect(await historyRepository.getMatch('live')).toBeDefined();
  });

  it('builds player history for bots by normalized name', async () => {
    const first = playedMatch('bot-one', '2026-08-04T00:00:00Z', true, true);
    first.participants[1] = {
      ...first.participants[1]!,
      name: 'Boomer',
      primaryId: 'Unknown|0|0',
      shortcut: 2,
    };
    const second = playedMatch('bot-two', '2026-08-05T00:00:00Z', false, false);
    second.participants[1] = {
      ...second.participants[1]!,
      name: ' boomer ',
      primaryId: undefined,
      shortcut: 7,
    };
    await saveMatch(first);
    first.participants[1] = { ...first.participants[1]!, shortcut: 9 };
    await saveMatch(first);
    await saveMatch(second);

    const history = await historyRepository.getPlayerHistory(
      'id:Steam|you|0',
      'name:boomer',
    );
    expect(history.summary).toMatchObject({
      playerKey: 'name:boomer',
      identityKind: 'name',
      latestName: ' boomer ',
      gamesTogether: 1,
      gamesOpposed: 1,
    });
    expect(history.matches.items.map((item) => item.id)).toEqual([
      'bot-two',
      'bot-one',
    ]);
    expect(
      await historyRepository.listPlayerKeysWithHistory(
        'id:Steam|you|0',
        ['name:boomer'],
        second.id,
      ),
    ).toEqual(['name:boomer']);
    expect(
      (await historyRepository.getMatch('bot-one'))?.participants.filter(
        (item) => item.name === 'Boomer',
      ),
    ).toHaveLength(1);
    expect(
      (await historyRepository.searchPlayers()).find(
        (item) => item.playerKey === 'name:boomer',
      ),
    ).toMatchObject({ primaryId: undefined, identityKind: 'name' });
  });

  it('expires raw payloads while retaining semantic event detail', async () => {
    const old = playedMatch('old', '2026-04-01T00:00:00Z', false, true);
    await saveMatch(old);
    expect(await db.rawEvents.count()).toBe(1);

    expect(
      await historyRepository.compactRawEvents(
        new Date('2026-08-08T00:00:00Z'),
      ),
    ).toBe(1);
    const restored = await historyRepository.getMatch('old');
    expect(restored?.events[0]?.payload).toEqual({
      Scorer: { Name: 'You' },
      GoalSpeed: 100,
    });
    expect(await db.events.count()).toBe(1);
  });
});
