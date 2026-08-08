import { calculateEncounters } from '../src/domain/encounters';
import { parseEnvelope } from '../src/domain/envelope';
import { calculatePlayerHistory, isTrackablePrimaryId } from '../src/domain/playerHistory';
import { reduceStatsEnvelope, recoverActiveMatch } from '../src/domain/reducer';
import { groupSessions } from '../src/domain/sessions';
import { timelineCatalog, timelineDisplayItems } from '../src/domain/timeline';
import { observedBallSpeed, playerTouchAnalytics, spatialEventPoints } from '../src/domain/analytics';
import { arenaProfile } from '../src/domain/arenaProfiles';
import { normalizePlayerKey, playerKeyFor } from '../src/domain/playerIdentity';
import { defaultSettings, type MatchState, type ParticipantState, type TimelineEvent } from '../src/domain/types';

const player = (name: string, primaryId: string, teamNumber: number): ParticipantState => ({ name, primaryId, teamNumber, score: 0, goals: 0, assists: 0, saves: 0, shots: 0, touches: 0, demos: 0 });
const match = (id: string, start: string, end: string): MatchState => ({ id, lifecycle: 'completed', startedAt: start, lastEventAt: end, endedAt: end, playlistId: 11, playlistName: 'Ranked Doubles', playlistCategory: 'ranked', arena: '', timeSeconds: 0, isOvertime: false, isReplay: false, teams: [], participants: [], events: [] });
const event = (matchId: string, sequence: number, eventName: string, payload: Record<string, unknown>, matchClockSeconds = 71): TimelineEvent => ({ id: `${matchId}:${sequence}`, matchId, sequence, eventName, payload, matchClockSeconds, receivedAt: '2026-08-08T00:00:00Z' });

describe('Stats API domain', () => {
  it('validates envelopes', () => {
    expect(() => parseEnvelope('{}')).toThrow(/Event/);
    expect(parseEnvelope('{"Event":"MatchCreated","Data":{}}').event).toBe('MatchCreated');
  });

  it('parses the JSON-encoded Data shape emitted by the game WebSocket', () => {
    const envelope = parseEnvelope(JSON.stringify({
      Event: 'UpdateState',
      Data: JSON.stringify({ MatchGuid: 'live-match', Game: { PlaylistId: 6 } }),
    }));

    expect(envelope).toEqual({
      event: 'UpdateState',
      data: { MatchGuid: 'live-match', Game: { PlaylistId: 6 } },
    });
    expect(() => parseEnvelope('{"Event":"UpdateState","Data":"not-json"}')).toThrow(/valid JSON/);
    expect(() => parseEnvelope('{"Event":"UpdateState","Data":"[]"}')).toThrow(/object Data/);
  });

  it('reduces snapshots while preserving discrete event payloads', () => {
    const snapshot = parseEnvelope(JSON.stringify({ Event: 'UpdateState', Data: { MatchGuid: 'match-1', Players: [{ Name: 'Me', PrimaryId: 'Steam|1|0', TeamNum: 0, Score: 250, Goals: 1, Shots: 2, Saves: 1 }], Game: { PlaylistId: 11, TimeSeconds: 180, Teams: [{ TeamNum: 0, Score: 1 }, { TeamNum: 1, Score: 0 }] } } }));
    const first = reduceStatsEnvelope(undefined, snapshot, '2026-08-08T00:00:00Z').current;
    expect(first.events).toHaveLength(0);
    expect(first.playlistName).toBe('Ranked Doubles');
    const goal = reduceStatsEnvelope(first, parseEnvelope('{"Event":"GoalScored","Data":{"MatchGuid":"match-1","GoalSpeed":123.4}}'), '2026-08-08T00:00:01Z').current;
    expect(goal.events[0]?.payload.GoalSpeed).toBe(123.4);
  });

  it('captures complete normal-play snapshots and active ball aggregates', () => {
    let value = reduceStatsEnvelope(undefined, { event: 'RoundStarted', data: { MatchGuid: 'normal' } }, '2026-08-08T00:00:00Z').current;
    value = reduceStatsEnvelope(value, { event: 'UpdateState', data: {
      MatchGuid: 'normal',
      Players: [{ Name: 'Me', PrimaryId: 'Steam|1|0', Shortcut: 2, TeamNum: 0, Score: 120, CarTouches: 4, Loadout: ['Body_Fennec'] }],
      Game: { PlaylistId: 11, TimeSeconds: 250, Ball: { Speed: 900.5, TeamNum: 0 }, bHasWinner: false, Teams: [{ TeamNum: 0, ColorSecondary: '001122' }] },
    } }, '2026-08-08T00:00:01Z').current;
    expect(value.participants[0]).toEqual(expect.objectContaining({ shortcut: 2, carTouches: 4, loadout: ['Body_Fennec'], isPresent: true }));
    expect(value.teams[0]?.colorSecondary).toBe('001122');
    expect(value.ball).toEqual({ speed: 900.5, lastTouchTeamNumber: 0 });
    expect(value.capture).toEqual(expect.objectContaining({ updateStatePackets: 1, activePlayPackets: 1, ballSpeed: expect.objectContaining({ samples: 1, sum: 900.5, max: 900.5 }) }));

    value = reduceStatsEnvelope(value, { event: 'MatchPaused', data: { MatchGuid: 'normal' } }).current;
    value = reduceStatsEnvelope(value, { event: 'UpdateState', data: { MatchGuid: 'normal', Players: [], Game: { Ball: { Speed: 1500, TeamNum: 1 } } } }).current;
    expect(value.capture?.activePlayPackets).toBe(1);
    expect(value.participants[0]?.isPresent).toBe(false);

    const shortcutOnly = { ...value, participants: [{ ...value.participants[0]!, primaryId: undefined, shortcut: 2 }] };
    const identified = reduceStatsEnvelope(shortcutOnly, { event: 'UpdateState', data: { MatchGuid: 'normal', Players: [{ Name: 'Me', PrimaryId: 'Steam|1|0', Shortcut: 2, TeamNum: 0 }], Game: {} } }).current;
    expect(identified.participants).toHaveLength(1);
    expect(identified.participants[0]?.primaryId).toBe('Steam|1|0');
  });

  it('keeps bots with a shared unknown platform ID distinct by shortcut', () => {
    const players = [
      { Name: 'Fitz', PrimaryId: 'Steam|76561198080090519|0', Shortcut: 5, TeamNum: 1 },
      { Name: 'Boomer', PrimaryId: 'Unknown|0|0', Shortcut: 1, TeamNum: 0 },
      { Name: 'Iceman', PrimaryId: 'Unknown|0|0', Shortcut: 6, TeamNum: 1 },
      { Name: 'Maverick', PrimaryId: 'Unknown|0|0', Shortcut: 2, TeamNum: 0 },
      { Name: 'Merlin', PrimaryId: 'Unknown|0|0', Shortcut: 3, TeamNum: 0 },
      { Name: 'Centice', PrimaryId: 'Unknown|0|0', Shortcut: 7, TeamNum: 1 },
    ];
    let value = reduceStatsEnvelope(undefined, { event: 'UpdateState', data: { MatchGuid: 'bots', Players: players, Game: {} } }).current;
    value = reduceStatsEnvelope(value, { event: 'UpdateState', data: { MatchGuid: 'bots', Players: players.map((item, index) => ({ ...item, Shortcut: item.Name === 'Merlin' ? 13 : item.Shortcut, Score: index + 10 })), Game: {} } }).current;

    expect(value.participants).toHaveLength(6);
    expect(value.participants.map((item) => item.name)).toEqual(['Fitz', 'Boomer', 'Iceman', 'Maverick', 'Merlin', 'Centice']);
    expect(value.participants.find((item) => item.name === 'Merlin')).toMatchObject({ shortcut: 13, score: 14, isPresent: true });

    value = reduceStatsEnvelope(value, { event: 'PlayerLeft', data: { MatchGuid: 'bots', PrimaryId: 'Unknown|0|0', Shortcut: 2, PlayerName: 'Maverick' } }).current;
    expect(value.participants.find((item) => item.name === 'Maverick')?.isPresent).toBe(false);
    expect(value.participants.filter((item) => item.name !== 'Maverick').every((item) => item.isPresent)).toBe(true);
  });

  it('creates normalized name identities when a platform ID is unavailable', () => {
    expect(playerKeyFor({ name: '  BÖÖMER  ', primaryId: 'Unknown|0|0' })).toBe('name:böömer');
    expect(playerKeyFor({ name: 'Boomer', primaryId: undefined })).toBe('name:boomer');
    expect(playerKeyFor({ name: 'Unknown player', primaryId: undefined })).toBeUndefined();
    expect(normalizePlayerKey('Steam|1|0')).toBe('id:Steam|1|0');
    expect(normalizePlayerKey('name: BOOMER ')).toBe('name:boomer');
  });

  it('derives touch analytics and resolves event actors by shortcut', () => {
    const value = match('touches', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    value.participants = [{ ...player('Me', 'Steam|1|0', 0), shortcut: 4 }, { ...player('Mate', 'Epic|2|0', 0), shortcut: 5 }];
    value.events = [
      { id: 'touches:1', matchId: value.id, sequence: 1, eventName: 'BallHit', receivedAt: value.startedAt, matchClockSeconds: 210, payload: { Players: [{ Name: 'Me', Shortcut: 4, TeamNum: 0 }], Ball: { PreHitSpeed: 400, PostHitSpeed: 1000, Location: { X: 10, Y: 20, Z: 30 } } } },
      { id: 'touches:2', matchId: value.id, sequence: 2, eventName: 'BallHit', receivedAt: value.startedAt, matchClockSeconds: 205, payload: { Players: [{ Name: 'Mate', Shortcut: 5, TeamNum: 0 }], Ball: { PreHitSpeed: 800, PostHitSpeed: 900, Location: { X: 40, Y: 50, Z: 60 } } } },
    ];
    expect(spatialEventPoints(value)[0]?.actors[0]?.primaryId).toBe('Steam|1|0');
    expect(playerTouchAnalytics(value, 'Steam|1|0')).toEqual(expect.objectContaining({ touches: 1, teamTouches: 2, touchShare: 0.5, averagePostHitSpeed: 1000, averageSpeedChange: 600 }));
  });

  it('resolves mode-specific arena profiles and expands for outliers', () => {
    const value = match('arena', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    value.playlistId = 27;
    expect(arenaProfile(value, []).kind).toBe('hoops');
    value.playlistId = 29;
    expect(arenaProfile(value, []).kind).toBe('dropshot');
    value.playlistId = 11;
    expect(arenaProfile(value, [{ id: 'x', kind: 'touch', x: 9000, y: 0, z: 0, actors: [] }]).xMax).toBeGreaterThan(9000);
  });

  it('reports unavailable observed speed for legacy matches', () => {
    expect(observedBallSpeed(match('legacy', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z'))).toEqual({});
  });

  it('begins active sampling when Fennec connects during a round', () => {
    const value = reduceStatsEnvelope(undefined, { event: 'UpdateState', data: { MatchGuid: 'mid-round', Game: { bReplay: false, Ball: { Speed: 700, TeamNum: 0 } } } }).current;
    expect(value.roundActive).toBe(true);
    expect(value.capture?.activePlayPackets).toBe(1);
  });

  it('completes superseded live matches and continues event sequence', () => {
    const first = reduceStatsEnvelope(undefined, { event: 'MatchCreated', data: { MatchGuid: 'one' } }, '2026-08-08T00:00:00Z').current;
    const result = reduceStatsEnvelope(first, { event: 'MatchCreated', data: { MatchGuid: 'two' } }, '2026-08-08T00:01:00Z');
    expect(result.superseded?.lifecycle).toBe('incomplete');
    expect(result.current.id).toBe('two');
    expect(result.current.events[0]?.sequence).toBe(1);
  });

  it('makes the session threshold inclusive', () => {
    const first = match('one', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    expect(groupSessions([first, match('before', '2026-08-08T00:34:59Z', '2026-08-08T00:40:00Z')], 30)).toHaveLength(1);
    expect(groupSessions([first, match('exact', '2026-08-08T00:35:00Z', '2026-08-08T00:40:00Z')], 30)).toHaveLength(2);
  });

  it('separates teammate and opponent records', () => {
    const first = match('one', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    first.participants = [player('Me', 'Steam|1|0', 0), player('Friend', 'Epic|2|0', 0)]; first.winnerTeamNumber = 0;
    const second = match('two', '2026-08-08T00:10:00Z', '2026-08-08T00:15:00Z');
    second.participants = [player('Me', 'Steam|1|0', 0), player('Friend', 'Epic|2|0', 1)]; second.winnerTeamNumber = 0;
    const encounter = calculateEncounters([first, second], 'Steam|1|0')[0]!;
    expect([encounter.gamesTogether, encounter.gamesOpposed, encounter.winsTogether, encounter.winsAgainst]).toEqual([1, 1, 1, 1]);
  });

  it('discovers nested and unknown timeline attributes', () => {
    const value = match('one', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    value.events = [{ id: 'one:1', matchId: 'one', sequence: 1, eventName: 'FutureEvent', receivedAt: value.startedAt, payload: { Nested: { Value: 7 }, NewField: true } }];
    expect(timelineCatalog([value]).FutureEvent).toEqual(['Nested.Value', 'NewField']);
  });

  it('turns curated events into readable newest-first gameplay sentences', () => {
    const value = match('timeline', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    value.participants = [player('Saltie', 'Epic|2|0', 1), player('Samara', 'Epic|3|0', 0), player('Caveman', 'Epic|4|0', 0)];
    value.events = [
      event(value.id, 1, 'RoundStarted', {}),
      event(value.id, 2, 'PlayerJoined', { Player: { Name: 'Saltie', TeamNum: 1 } }, 0),
      event(value.id, 3, 'StatfeedEvent', { Type: 'Shot on Goal', MainTarget: { Name: 'Saltie' } }),
      event(value.id, 4, 'GoalScored', { Scorer: { Name: 'Samara' }, Assister: { Name: 'Caveman' }, GoalSpeed: 49.7 }),
      event(value.id, 5, 'StatfeedEvent', { Type: 'Goal', MainTarget: { Name: 'Samara' } }),
      event(value.id, 6, 'PlayerLeft', { PlayerName: 'Saltie' }, 65),
      event(value.id, 7, 'GoalReplayStart', {}, 65),
      event(value.id, 8, 'GoalReplayEnd', {}, 65),
    ];

    const items = timelineDisplayItems(value, defaultSettings);
    expect(items.map((item) => item.parts.map((part) => part.text).join(''))).toEqual([
      'Saltie left',
      'Samara scored — assisted by Caveman',
      'Saltie shot on goal',
      'Saltie joined',
    ]);
    expect(items[0]?.parts[0]?.player?.teamNumber).toBe(1);
    expect(timelineDisplayItems(value, { ...defaultSettings, timelinePreset: 'everything' }).slice(0, 2).map((item) => item.parts[0]?.text)).toEqual(['Goal Replay End', 'Goal Replay Start']);
  });

  it('hides kickoff noise only from curated timelines and preserves technical details elsewhere', () => {
    const value = match('noise', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    value.events = [event(value.id, 1, 'GoalScored', { Scorer: { Name: '' }, GoalSpeed: 0, GoalTime: 0 }, 12)];
    expect(timelineDisplayItems(value, defaultSettings)).toEqual([]);
    const everything = timelineDisplayItems(value, { ...defaultSettings, timelinePreset: 'everything' });
    expect(everything[0]?.parts[0]?.text).toBe('Goal Scored');
    expect(everything[0]?.technicalDetails).toContain('GoalSpeed');
  });

  it('calculates detailed together and against history from completed games only', () => {
    const together = match('together', '2026-08-08T00:00:00Z', '2026-08-08T00:05:00Z');
    together.teams = [{ teamNumber: 0, name: 'Blue', score: 3, colorPrimary: '' }, { teamNumber: 1, name: 'Orange', score: 1, colorPrimary: '' }];
    together.participants = [{ ...player('Me', 'Steam|1|0', 0), score: 500, goals: 2 }, { ...player('Friend', 'Epic|2|0', 0), score: 300, assists: 2 }];
    together.winnerTeamNumber = 0;
    const against = match('against', '2026-08-08T00:10:00Z', '2026-08-08T00:15:00Z');
    against.teams = [{ teamNumber: 0, name: 'Blue', score: 2, colorPrimary: '' }, { teamNumber: 1, name: 'Orange', score: 4, colorPrimary: '' }];
    against.participants = [{ ...player('Me', 'Steam|1|0', 0), score: 250, saves: 2 }, { ...player('Renamed Friend', 'Epic|2|0', 1), score: 600, goals: 3 }];
    against.winnerTeamNumber = 1;
    const live = match('live', '2026-08-08T00:20:00Z', '2026-08-08T00:25:00Z');
    live.lifecycle = 'live'; live.participants = [player('Me', 'Steam|1|0', 0), player('Renamed Friend', 'Epic|2|0', 1)];

    const history = calculatePlayerHistory([against, live, together], 'Steam|1|0', 'Epic|2|0')!;
    expect(history.latestName).toBe('Renamed Friend');
    expect(history.totalMeetings).toBe(3);
    expect(history.together).toMatchObject({ games: 1, wins: 1, losses: 0, winRate: 100, goalsFor: 3, goalsAgainst: 1 });
    expect(history.against).toMatchObject({ games: 1, wins: 0, losses: 1, winRate: 0, goalsFor: 2, goalsAgainst: 4 });
    expect(history.against.lastSeen).toBe(against.startedAt);
    expect(history.together.you.score).toBe(500);
    expect(history.against.player.goals).toBe(3);
    expect(history.recent[0]?.result).toBe('incomplete');
    expect(isTrackablePrimaryId('Unknown|0|0')).toBe(false);
  });

  it('marks stale interrupted matches incomplete', () => {
    const value = match('one', '2026-08-08T00:00:00Z', '2026-08-08T00:01:00Z');
    value.lifecycle = 'live'; delete value.endedAt;
    expect(recoverActiveMatch([value], new Date('2026-08-08T01:00:00Z').getTime())).toBeUndefined();
    expect(value.lifecycle).toBe('incomplete');
  });
});
