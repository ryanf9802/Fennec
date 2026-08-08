import { calculateEncounters } from '../src/domain/encounters';
import { parseEnvelope } from '../src/domain/envelope';
import { reduceStatsEnvelope, recoverActiveMatch } from '../src/domain/reducer';
import { groupSessions } from '../src/domain/sessions';
import { timelineCatalog } from '../src/domain/timeline';
import type { MatchState, ParticipantState } from '../src/domain/types';

const player = (name: string, primaryId: string, teamNumber: number): ParticipantState => ({ name, primaryId, teamNumber, score: 0, goals: 0, assists: 0, saves: 0, shots: 0, touches: 0, demos: 0 });
const match = (id: string, start: string, end: string): MatchState => ({ id, lifecycle: 'completed', startedAt: start, lastEventAt: end, endedAt: end, playlistId: 11, playlistName: 'Ranked Doubles', playlistCategory: 'ranked', arena: '', timeSeconds: 0, isOvertime: false, isReplay: false, teams: [], participants: [], events: [] });

describe('Stats API domain', () => {
  it('validates envelopes', () => {
    expect(() => parseEnvelope('{}')).toThrow(/Event/);
    expect(parseEnvelope('{"Event":"MatchCreated","Data":{}}').event).toBe('MatchCreated');
  });

  it('reduces snapshots while preserving discrete event payloads', () => {
    const snapshot = parseEnvelope(JSON.stringify({ Event: 'UpdateState', Data: { MatchGuid: 'match-1', Players: [{ Name: 'Me', PrimaryId: 'Steam|1|0', TeamNum: 0, Score: 250, Goals: 1, Shots: 2, Saves: 1 }], Game: { PlaylistId: 11, TimeSeconds: 180, Teams: [{ TeamNum: 0, Score: 1 }, { TeamNum: 1, Score: 0 }] } } }));
    const first = reduceStatsEnvelope(undefined, snapshot, '2026-08-08T00:00:00Z').current;
    expect(first.events).toHaveLength(0);
    expect(first.playlistName).toBe('Ranked Doubles');
    const goal = reduceStatsEnvelope(first, parseEnvelope('{"Event":"GoalScored","Data":{"MatchGuid":"match-1","GoalSpeed":123.4}}'), '2026-08-08T00:00:01Z').current;
    expect(goal.events[0]?.payload.GoalSpeed).toBe(123.4);
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

  it('marks stale interrupted matches incomplete', () => {
    const value = match('one', '2026-08-08T00:00:00Z', '2026-08-08T00:01:00Z');
    value.lifecycle = 'live'; delete value.endedAt;
    expect(recoverActiveMatch([value], new Date('2026-08-08T01:00:00Z').getTime())).toBeUndefined();
    expect(value.lifecycle).toBe('incomplete');
  });
});
