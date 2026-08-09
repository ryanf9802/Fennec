import Dexie, { type EntityTable, type Table } from 'dexie';
import { startsNewSession } from '../domain/sessions';
import { flattenPayload } from '../domain/timeline';
import {
  normalizePlayerName,
  playerIdentityKind,
  playerKeyFor,
  playerKeyForPrimaryId,
  playerPrimaryId,
} from '../domain/playerIdentity';
import {
  normalizeSettings,
  type EncounterSummary,
  type FennecProfile,
  type FennecSettings,
  type MatchState,
  type ParticipantState,
  type SessionGroup,
  type TimelineEvent,
} from '../domain/types';
import { recalculateDerivedTouchStats } from '../domain/passes';
import type {
  EndSessionResult,
  HistoryPage,
  HistoryRepository,
  MatchHistoryQuery,
  PlayerHistoryResult,
  PlayerRecord,
  StorageStatistics,
} from './historyRepository';

const rawRetentionDays = 90;
const schemaMarker = 'normalized-v6';
const stringMinKey = '';
const stringMaxKey = '\uffff';

type StoredMatch = Omit<MatchState, 'events' | 'participants'> & {
  sessionId: string;
};
type LegacyStoredMatch = Omit<MatchState, 'events'> & { sessionId?: string };
interface SettingRecord {
  key: 'settings';
  value: FennecSettings;
}
interface ProfileRecord extends FennecProfile {
  key: 'profile';
}
interface MetadataRecord {
  key: string;
  value: unknown;
}
interface StoredPlayerRecord {
  // IndexedDB v3 established this primary-key path; its v4 value is the opaque player key.
  primaryId: string;
  platformPrimaryId?: string;
  identityKind: 'platform' | 'name';
  latestName: string;
  normalizedName: string;
  firstSeen: string;
  lastSeen: string;
}
interface RawEventRecord {
  id: string;
  matchId: string;
  receivedAt: string;
  payload: Record<string, unknown>;
}
interface AppearanceRecord extends ParticipantState {
  id: string;
  playerKey?: string;
  matchId: string;
  startedAt: string;
  playlistId: number;
  playlistCategory: MatchState['playlistCategory'];
  result: 'win' | 'loss' | 'incomplete';
}
interface ProfileMatchRecord {
  id: string;
  playerKey: string;
  matchId: string;
  sessionId: string;
  startedAt: string;
  playlistId: number;
  playlistCategory: MatchState['playlistCategory'];
  result: 'win' | 'loss' | 'incomplete';
  involvement: 'played' | 'spectated';
}
interface PairRecord {
  id: string;
  playerAKey: string;
  playerBKey: string;
  matchId: string;
  startedAt: string;
  playlistId: number;
  playlistCategory: MatchState['playlistCategory'];
  relationship: 'together' | 'against';
  resultA: 'win' | 'loss' | 'incomplete';
  resultB: 'win' | 'loss' | 'incomplete';
}
interface RelationshipRecord {
  id: string;
  playerAKey: string;
  playerBKey: string;
  gamesTogether: number;
  winsTogetherA: number;
  winsTogetherB: number;
  lossesTogetherA: number;
  lossesTogetherB: number;
  gamesOpposed: number;
  winsAgainstA: number;
  winsAgainstB: number;
  lossesAgainstA: number;
  lossesAgainstB: number;
  firstSeen: string;
  lastSeen: string;
}
interface SessionRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  matchIds: string[];
}

function resultFor(
  match: Pick<MatchState, 'lifecycle' | 'winnerTeamNumber'>,
  teamNumber: number,
): AppearanceRecord['result'] {
  if (match.lifecycle !== 'completed' || match.winnerTeamNumber === undefined)
    return 'incomplete';
  return match.winnerTeamNumber === teamNumber ? 'win' : 'loss';
}

function appearanceKey(player: ParticipantState): string {
  const playerKey = playerKeyFor(player);
  if (playerKey?.startsWith('id:')) return playerKey;
  if (player.shortcut !== undefined) return `slot:${player.shortcut}`;
  return `${playerKey ?? 'unknown'}:${player.teamNumber}`;
}

function appearance(
  match: MatchState,
  player: ParticipantState,
): AppearanceRecord {
  const key = appearanceKey(player);
  return {
    ...player,
    id: `${match.id}\u0000${key}`,
    playerKey: playerKeyFor(player),
    matchId: match.id,
    startedAt: match.startedAt,
    playlistId: match.playlistId,
    playlistCategory: match.playlistCategory,
    result: resultFor(match, player.teamNumber),
  };
}

function profileMatchRecords(
  match: MatchState,
  sessionId: string,
): ProfileMatchRecord[] {
  const values = new Map<string, ProfileMatchRecord>();
  for (const player of match.participants) {
    const playerKey = playerKeyFor(player);
    if (!playerKey) continue;
    values.set(playerKey, {
      id: `${playerKey}\u0000${match.id}`,
      playerKey,
      matchId: match.id,
      sessionId,
      startedAt: match.startedAt,
      playlistId: match.playlistId,
      playlistCategory: match.playlistCategory,
      result: resultFor(match, player.teamNumber),
      involvement: 'played',
    });
  }
  const observerKey = playerKeyForPrimaryId(match.observedByPrimaryId);
  if (observerKey && !values.has(observerKey))
    values.set(observerKey, {
      id: `${observerKey}\u0000${match.id}`,
      playerKey: observerKey,
      matchId: match.id,
      sessionId,
      startedAt: match.startedAt,
      playlistId: match.playlistId,
      playlistCategory: match.playlistCategory,
      result: 'incomplete',
      involvement: 'spectated',
    });
  return [...values.values()];
}

function pairRecords(match: MatchState): PairRecord[] {
  const players = match.participants
    .map((player) => ({ player, playerKey: playerKeyFor(player) }))
    .filter(
      (value): value is { player: ParticipantState; playerKey: string } =>
        !!value.playerKey,
    );
  const result: PairRecord[] = [];
  for (let left = 0; left < players.length; left++) {
    for (let right = left + 1; right < players.length; right++) {
      const first = players[left]!;
      const second = players[right]!;
      if (first.playerKey === second.playerKey) continue;
      const [a, b] =
        first.playerKey.localeCompare(second.playerKey) <= 0
          ? [first, second]
          : [second, first];
      result.push({
        id: `${a.playerKey}\u0000${b.playerKey}\u0000${match.id}`,
        playerAKey: a.playerKey,
        playerBKey: b.playerKey,
        matchId: match.id,
        startedAt: match.startedAt,
        playlistId: match.playlistId,
        playlistCategory: match.playlistCategory,
        relationship:
          a.player.teamNumber === b.player.teamNumber ? 'together' : 'against',
        resultA: resultFor(match, a.player.teamNumber),
        resultB: resultFor(match, b.player.teamNumber),
      });
    }
  }
  return result;
}

/**
 * Folds chronological per-match player pairs into durable relationship totals
 * while preserving each pairing's first- and last-seen timestamps.
 */
function relationshipRecords(pairs: PairRecord[]): RelationshipRecord[] {
  const values = new Map<string, RelationshipRecord>();
  for (const pair of [...pairs].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  )) {
    const id = `${pair.playerAKey}\u0000${pair.playerBKey}`;
    const value = values.get(id) ?? {
      id,
      playerAKey: pair.playerAKey,
      playerBKey: pair.playerBKey,
      gamesTogether: 0,
      winsTogetherA: 0,
      winsTogetherB: 0,
      lossesTogetherA: 0,
      lossesTogetherB: 0,
      gamesOpposed: 0,
      winsAgainstA: 0,
      winsAgainstB: 0,
      lossesAgainstA: 0,
      lossesAgainstB: 0,
      firstSeen: pair.startedAt,
      lastSeen: pair.startedAt,
    };
    value.firstSeen =
      pair.startedAt < value.firstSeen ? pair.startedAt : value.firstSeen;
    value.lastSeen =
      pair.startedAt > value.lastSeen ? pair.startedAt : value.lastSeen;
    if (pair.relationship === 'together') {
      value.gamesTogether++;
      if (pair.resultA === 'win') value.winsTogetherA++;
      else if (pair.resultA === 'loss') value.lossesTogetherA++;
      if (pair.resultB === 'win') value.winsTogetherB++;
      else if (pair.resultB === 'loss') value.lossesTogetherB++;
    } else {
      value.gamesOpposed++;
      if (pair.resultA === 'win') value.winsAgainstA++;
      else if (pair.resultA === 'loss') value.lossesAgainstA++;
      if (pair.resultB === 'win') value.winsAgainstB++;
      else if (pair.resultB === 'loss') value.lossesAgainstB++;
    }
    values.set(id, value);
  }
  return [...values.values()];
}

function semanticPayload(event: TimelineEvent): Record<string, unknown> {
  const payload = event.payload;
  const keys: Record<string, string[]> = {
    BallHit: ['Players', 'Ball'],
    GoalScored: [
      'Scorer',
      'Assister',
      'GoalSpeed',
      'GoalTime',
      'ImpactLocation',
    ],
    CrossbarHit: ['BallLocation', 'BallSpeed', 'ImpactForce', 'BallLastTouch'],
    StatfeedEvent: ['Type', 'EventName', 'MainTarget', 'SecondaryTarget'],
    PlayerJoined: ['Player', 'PlayerName', 'PrimaryId'],
    PlayerLeft: ['Player', 'PlayerName', 'PrimaryId'],
    MatchEnded: ['WinnerTeamNum'],
  };
  const selected = keys[event.eventName];
  if (selected)
    return Object.fromEntries(
      selected
        .filter((key) => payload[key] !== undefined)
        .map((key) => [key, structuredClone(payload[key])]),
    );
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) =>
        key !== 'MatchGuid' &&
        (value == null ||
          ['string', 'number', 'boolean'].includes(typeof value)),
    ),
  );
}

function semanticEvent(event: TimelineEvent): TimelineEvent {
  return { ...event, payload: semanticPayload(event) };
}

function storedMatch(match: MatchState, sessionId: string): StoredMatch {
  const stored = structuredClone(match) as Partial<MatchState> & {
    sessionId: string;
  };
  delete stored.events;
  delete stored.participants;
  stored.sessionId = sessionId;
  return stored as StoredMatch;
}

function sessionIdFor(match: Pick<MatchState, 'id' | 'startedAt'>): string {
  return `${new Date(match.startedAt).getTime().toString(16)}-${match.id}`;
}

function groupSessionRecords(
  matches: Array<
    Pick<
      MatchState,
      'id' | 'startedAt' | 'endedAt' | 'lastEventAt' | 'sessionEndedAfter'
    >
  >,
  idleMinutes: number,
): { records: SessionRecord[]; byMatch: Map<string, string> } {
  const ordered = [...matches].sort(
    (a, b) =>
      a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  const records: SessionRecord[] = [];
  const byMatch = new Map<string, string>();
  let prior: (typeof ordered)[number] | undefined;
  for (const match of ordered) {
    const current = records.at(-1);
    const beginsSession =
      !current || !prior || startsNewSession(prior, match, idleMinutes);
    if (beginsSession)
      records.push({
        id: sessionIdFor(match),
        startedAt: match.startedAt,
        endedAt: match.endedAt ?? match.lastEventAt,
        matchIds: [],
      });
    const session = records.at(-1)!;
    session.matchIds.push(match.id);
    session.endedAt = match.endedAt ?? match.lastEventAt;
    byMatch.set(match.id, session.id);
    prior = match;
  }
  return { records, byMatch };
}

function buildCatalog(events: TimelineEvent[]): Record<string, string[]> {
  const result: Record<string, Set<string>> = {};
  for (const event of events) {
    result[event.eventName] ??= new Set();
    for (const key of Object.keys(flattenPayload(event.payload)))
      result[event.eventName]!.add(key);
  }
  return Object.fromEntries(
    Object.entries(result)
      .sort()
      .map(([eventName, attributes]) => [eventName, [...attributes].sort()]),
  );
}

class FennecDatabase extends Dexie {
  matches!: EntityTable<StoredMatch, 'id'>;
  events!: EntityTable<TimelineEvent, 'id'>;
  rawEvents!: EntityTable<RawEventRecord, 'id'>;
  appearances!: EntityTable<AppearanceRecord, 'id'>;
  profileMatches!: EntityTable<ProfileMatchRecord, 'id'>;
  players!: EntityTable<StoredPlayerRecord, 'primaryId'>;
  pairs!: EntityTable<PairRecord, 'id'>;
  relationships!: EntityTable<RelationshipRecord, 'id'>;
  sessions!: EntityTable<SessionRecord, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  profiles!: EntityTable<ProfileRecord, 'key'>;
  metadata!: EntityTable<MetadataRecord, 'key'>;

  constructor() {
    super('fennec');
    this.version(1).stores({
      matches: 'id, startedAt, lastEventAt, lifecycle, playlistCategory',
      events:
        'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
      settings: 'key',
      profiles: 'key, primaryId',
    });
    this.version(2)
      .stores({
        matches: 'id, startedAt, lastEventAt, lifecycle, playlistCategory',
        events:
          'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
        settings: 'key',
        profiles: 'key, primaryId',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<LegacyStoredMatch>('matches')
          .toCollection()
          .modify((match) => {
            match.participants = match.participants.map((player) => ({
              ...player,
              passes: player.passes ?? 0,
              fifties: player.fifties ?? 0,
              carTouches: player.carTouches ?? 0,
              loadout: player.loadout ?? [],
              isPresent: player.isPresent ?? true,
            }));
            match.teams = match.teams.map((team) => ({
              ...team,
              colorSecondary: team.colorSecondary ?? '',
            }));
          });
      });
    this.version(3).stores({
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
    this.version(4).stores({
      matches:
        'id, startedAt, [startedAt+id], lastEventAt, lifecycle, playlistCategory, playlistId, sessionId',
      events:
        'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
      rawEvents: 'id, matchId, receivedAt, [receivedAt+id]',
      appearances:
        'id, matchId, playerKey, primaryId, [matchId+playerKey], [playerKey+startedAt+matchId], [playerKey+playlistCategory+startedAt+matchId], [playerKey+playlistId+startedAt+matchId], [playerKey+result+startedAt+matchId]',
      players:
        'primaryId, platformPrimaryId, normalizedName, firstSeen, lastSeen',
      pairs: 'id, matchId, [playerAKey+playerBKey+startedAt+matchId]',
      relationships: 'id, [playerAKey+playerBKey]',
      sessions: 'id, startedAt, [startedAt+id]',
      settings: 'key',
      profiles: 'key, primaryId',
      metadata: 'key',
    });
    this.version(5)
      .stores({
        matches:
          'id, startedAt, [startedAt+id], lastEventAt, lifecycle, playlistCategory, playlistId, sessionId',
        events:
          'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
        rawEvents: 'id, matchId, receivedAt, [receivedAt+id]',
        appearances:
          'id, matchId, playerKey, primaryId, [matchId+playerKey], [playerKey+startedAt+matchId], [playerKey+playlistCategory+startedAt+matchId], [playerKey+playlistId+startedAt+matchId], [playerKey+result+startedAt+matchId]',
        profileMatches:
          'id, matchId, playerKey, sessionId, [playerKey+sessionId], [playerKey+startedAt+matchId], [playerKey+playlistCategory+startedAt+matchId], [playerKey+playlistId+startedAt+matchId], [playerKey+result+startedAt+matchId]',
        players:
          'primaryId, platformPrimaryId, identityKind, normalizedName, firstSeen, lastSeen, [identityKind+normalizedName], [identityKind+lastSeen]',
        pairs: 'id, matchId, [playerAKey+playerBKey+startedAt+matchId]',
        relationships: 'id, [playerAKey+playerBKey]',
        sessions: 'id, startedAt, [startedAt+id]',
        settings: 'key',
        profiles: 'key, primaryId',
        metadata: 'key',
      })
      .upgrade(async (transaction) => {
        const matches = await transaction
          .table<StoredMatch>('matches')
          .toArray();
        const appearances = await transaction
          .table<AppearanceRecord>('appearances')
          .toArray();
        const byMatch = new Map<string, AppearanceRecord[]>();
        for (const item of appearances) {
          const values = byMatch.get(item.matchId) ?? [];
          values.push(item);
          byMatch.set(item.matchId, values);
        }
        const records = matches.flatMap((match) =>
          profileMatchRecords(
            {
              ...match,
              participants: byMatch.get(match.id) ?? [],
              events: [],
            } as MatchState,
            match.sessionId,
          ),
        );
        if (records.length)
          await transaction
            .table<ProfileMatchRecord>('profileMatches')
            .bulkPut(records);
      });
  }
}

export const db = new FennecDatabase();

async function normalizeExistingData(): Promise<void> {
  if ((await db.metadata.get(schemaMarker))?.value === true) return;
  await db.transaction(
    'rw',
    [
      db.matches,
      db.events,
      db.rawEvents,
      db.appearances,
      db.profileMatches,
      db.players,
      db.pairs,
      db.relationships,
      db.sessions,
      db.settings,
      db.metadata,
    ],
    async () => {
      if ((await db.metadata.get(schemaMarker))?.value === true) return;
      const legacyMatches = await (
        db.matches as unknown as Table<LegacyStoredMatch, string>
      ).toArray();
      const existingAppearances = await db.appearances.toArray();
      const events = await db.events.toArray();
      const existingRawEvents = await db.rawEvents.toArray();
      const rawById = new Map(
        existingRawEvents.map((event) => [event.id, event.payload]),
      );
      const settings = normalizeSettings(
        (await db.settings.get('settings'))?.value,
      );
      const eventsByMatch = new Map<string, TimelineEvent[]>();
      for (const event of events) {
        const values = eventsByMatch.get(event.matchId) ?? [];
        values.push({
          ...event,
          payload: rawById.get(event.id) ?? event.payload,
        });
        eventsByMatch.set(event.matchId, values);
      }
      const appearancesByMatch = new Map<string, ParticipantState[]>();
      for (const item of existingAppearances) {
        const values = appearancesByMatch.get(item.matchId) ?? [];
        values.push(item);
        appearancesByMatch.set(item.matchId, values);
      }
      const hydrated = legacyMatches.map(
        (match) =>
          ({
            ...match,
            participants:
              match.participants ?? appearancesByMatch.get(match.id) ?? [],
            events: eventsByMatch.get(match.id) ?? [],
          }) as MatchState,
      );
      for (const match of hydrated) recalculateDerivedTouchStats(match);
      const grouped = groupSessionRecords(hydrated, settings.sessionGapMinutes);
      const appearances = hydrated.flatMap((match) =>
        match.participants.map((player) => appearance(match, player)),
      );
      const profileMatches = hydrated.flatMap((match) =>
        profileMatchRecords(match, grouped.byMatch.get(match.id)!),
      );
      const players = new Map<string, StoredPlayerRecord>();
      for (const item of appearances) {
        if (!item.playerKey) continue;
        const prior = players.get(item.playerKey);
        players.set(item.playerKey, {
          primaryId: item.playerKey,
          platformPrimaryId: playerPrimaryId(item.playerKey),
          identityKind: playerIdentityKind(item.playerKey)!,
          latestName:
            !prior || item.startedAt >= prior.lastSeen
              ? item.name
              : prior.latestName,
          normalizedName: (!prior || item.startedAt >= prior.lastSeen
            ? item.name
            : prior.latestName
          )
            .normalize('NFKC')
            .trim()
            .toLowerCase(),
          firstSeen:
            !prior || item.startedAt < prior.firstSeen
              ? item.startedAt
              : prior.firstSeen,
          lastSeen:
            !prior || item.startedAt > prior.lastSeen
              ? item.startedAt
              : prior.lastSeen,
        });
      }
      await Promise.all([
        db.rawEvents.clear(),
        db.appearances.clear(),
        db.profileMatches.clear(),
        db.players.clear(),
        db.pairs.clear(),
        db.relationships.clear(),
        db.sessions.clear(),
      ]);
      if (events.length) {
        await db.rawEvents.bulkPut(
          existingRawEvents.length
            ? existingRawEvents
            : events.map((event) => ({
                id: event.id,
                matchId: event.matchId,
                receivedAt: event.receivedAt,
                payload: event.payload,
              })),
        );
        await db.events.bulkPut(events.map(semanticEvent));
      }
      if (appearances.length) await db.appearances.bulkPut(appearances);
      if (profileMatches.length)
        await db.profileMatches.bulkPut(profileMatches);
      if (players.size) await db.players.bulkPut([...players.values()]);
      const pairs = hydrated.flatMap(pairRecords);
      if (pairs.length) await db.pairs.bulkPut(pairs);
      const relationships = relationshipRecords(pairs);
      if (relationships.length) await db.relationships.bulkPut(relationships);
      if (grouped.records.length) await db.sessions.bulkPut(grouped.records);
      if (hydrated.length)
        await db.matches.bulkPut(
          hydrated.map((match) =>
            storedMatch(match, grouped.byMatch.get(match.id)!),
          ),
        );
      await db.metadata.bulkPut([
        { key: schemaMarker, value: true },
        { key: 'eventCatalog', value: buildCatalog(events) },
      ]);
    },
  );
}

function cursorFor(startedAt: string, id: string): string {
  return encodeURIComponent(JSON.stringify([startedAt, id]));
}

function parseCursor(cursor?: string): [string, string] | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(decodeURIComponent(cursor));
    return Array.isArray(value) &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string'
      ? [value[0], value[1]]
      : undefined;
  } catch {
    return undefined;
  }
}

async function hydrateMatches(records: StoredMatch[]): Promise<MatchState[]> {
  if (!records.length) return [];
  const ids = records.map((match) => match.id);
  const [appearances, events] = await Promise.all([
    db.appearances.where('matchId').anyOf(ids).toArray(),
    db.events.where('matchId').anyOf(ids).toArray(),
  ]);
  const raw = await db.rawEvents.bulkGet(events.map((event) => event.id));
  const rawById = new Map(
    raw
      .filter((item): item is RawEventRecord => !!item)
      .map((item) => [item.id, item.payload]),
  );
  const appearancesByMatch = new Map<string, AppearanceRecord[]>();
  const eventsByMatch = new Map<string, TimelineEvent[]>();
  for (const item of appearances) {
    const values = appearancesByMatch.get(item.matchId) ?? [];
    values.push(item);
    appearancesByMatch.set(item.matchId, values);
  }
  for (const event of events) {
    const values = eventsByMatch.get(event.matchId) ?? [];
    values.push({
      ...event,
      payload: rawById.get(event.id) ?? event.payload,
      rawPayloadAvailable: rawById.has(event.id),
    });
    eventsByMatch.set(event.matchId, values);
  }
  return records.map((record) => {
    const match = structuredClone(record) as Partial<StoredMatch>;
    delete match.sessionId;
    const participants = (appearancesByMatch.get(record.id) ?? []).map(
      (item): ParticipantState => ({
        name: item.name,
        primaryId: item.primaryId,
        shortcut: item.shortcut,
        teamNumber: item.teamNumber,
        score: item.score,
        goals: item.goals,
        assists: item.assists,
        passes: item.passes ?? 0,
        fifties: item.fifties ?? 0,
        saves: item.saves,
        shots: item.shots,
        touches: item.touches,
        carTouches: item.carTouches,
        demos: item.demos,
        loadout: item.loadout,
        isPresent: item.isPresent,
      }),
    );
    return {
      ...match,
      participants,
      events: (eventsByMatch.get(record.id) ?? []).sort(
        (a, b) => a.sequence - b.sequence,
      ),
    } as MatchState;
  });
}

async function hydrateSummaries(records: StoredMatch[]): Promise<MatchState[]> {
  if (!records.length) return [];
  const ids = records.map((match) => match.id);
  const appearances = await db.appearances
    .where('matchId')
    .anyOf(ids)
    .toArray();
  const appearancesByMatch = new Map<string, AppearanceRecord[]>();
  for (const item of appearances) {
    const values = appearancesByMatch.get(item.matchId) ?? [];
    values.push(item);
    appearancesByMatch.set(item.matchId, values);
  }
  return records.map((record) => {
    const match = structuredClone(record) as Partial<StoredMatch>;
    delete match.sessionId;
    const participants = (appearancesByMatch.get(record.id) ?? []).map(
      (item): ParticipantState => ({
        name: item.name,
        primaryId: item.primaryId,
        shortcut: item.shortcut,
        teamNumber: item.teamNumber,
        score: item.score,
        goals: item.goals,
        assists: item.assists,
        passes: item.passes ?? 0,
        fifties: item.fifties ?? 0,
        saves: item.saves,
        shots: item.shots,
        touches: item.touches,
        carTouches: item.carTouches,
        demos: item.demos,
        loadout: item.loadout,
        isPresent: item.isPresent,
      }),
    );
    return { ...match, participants, events: [] } as MatchState;
  });
}

async function hydrateByIds(ids: string[]): Promise<MatchState[]> {
  const records = (await db.matches.bulkGet(ids)).filter(
    (item): item is StoredMatch => !!item,
  );
  const byId = new Map(
    (await hydrateMatches(records)).map((match) => [match.id, match]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((match): match is MatchState => !!match);
}

async function hydrateSummariesByIds(ids: string[]): Promise<MatchState[]> {
  const records = (await db.matches.bulkGet(ids)).filter(
    (item): item is StoredMatch => !!item,
  );
  const byId = new Map(
    (await hydrateSummaries(records)).map((match) => [match.id, match]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((match): match is MatchState => !!match);
}

function matchesFilter(record: StoredMatch, query: MatchHistoryQuery): boolean {
  return (
    (!query.from || record.startedAt >= query.from) &&
    (!query.to || record.startedAt <= query.to) &&
    (query.playlistId === undefined ||
      record.playlistId === query.playlistId) &&
    (!query.playlistCategory ||
      record.playlistCategory === query.playlistCategory)
  );
}

async function listPlainMatches(
  query: MatchHistoryQuery,
): Promise<HistoryPage<MatchState>> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const cursor = parseCursor(query.cursor);
  const collection = cursor
    ? db.matches.where('[startedAt+id]').below(cursor).reverse()
    : db.matches.orderBy('[startedAt+id]').reverse();
  const selected: StoredMatch[] = [];
  let offset = 0;
  while (selected.length <= limit) {
    const batch = await collection.offset(offset).limit(200).toArray();
    if (!batch.length) break;
    offset += batch.length;
    selected.push(
      ...batch
        .filter((record) => matchesFilter(record, query))
        .slice(0, limit + 1 - selected.length),
    );
    if (batch.length < 200) break;
  }
  const page = selected.slice(0, limit);
  return {
    items: await hydrateSummaries(page),
    nextCursor:
      selected.length > limit && page.length
        ? cursorFor(page.at(-1)!.startedAt, page.at(-1)!.id)
        : undefined,
  };
}

function profileMatchFilter(
  record: ProfileMatchRecord,
  query: MatchHistoryQuery,
): boolean {
  return (
    (!query.from || record.startedAt >= query.from) &&
    (!query.to || record.startedAt <= query.to) &&
    (query.playlistId === undefined ||
      record.playlistId === query.playlistId) &&
    (!query.playlistCategory ||
      record.playlistCategory === query.playlistCategory) &&
    (!query.result || record.result === query.result)
  );
}

async function listProfileMatches(
  query: MatchHistoryQuery & { profileKey: string },
): Promise<HistoryPage<MatchState>> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const cursor = parseCursor(query.cursor);
  const upper: [string, string, string] = cursor
    ? [query.profileKey, cursor[0], cursor[1]]
    : [query.profileKey, stringMaxKey, stringMaxKey];
  const collection = db.profileMatches
    .where('[playerKey+startedAt+matchId]')
    .between(
      [query.profileKey, stringMinKey, stringMinKey],
      upper,
      true,
      !cursor,
    )
    .reverse();
  const selected: ProfileMatchRecord[] = [];
  let offset = 0;
  while (selected.length <= limit) {
    const rows = await collection.offset(offset).limit(200).toArray();
    if (!rows.length) break;
    offset += rows.length;
    selected.push(
      ...rows
        .filter((record) => profileMatchFilter(record, query))
        .slice(0, limit + 1 - selected.length),
    );
    if (rows.length < 200) break;
  }
  const page = selected.slice(0, limit);
  return {
    items: await hydrateSummariesByIds(page.map((item) => item.matchId)),
    nextCursor:
      selected.length > limit && page.length
        ? cursorFor(page.at(-1)!.startedAt, page.at(-1)!.matchId)
        : undefined,
  };
}

/**
 * Pages profile-relative player matches through relationship indexes and then
 * applies result, playlist, date, and cursor filters before hydration.
 */
async function listPlayerMatches(
  query: MatchHistoryQuery,
): Promise<HistoryPage<MatchState>> {
  const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
  const cursor = parseCursor(query.cursor);
  const candidates: Array<{ matchId: string; startedAt: string }> = [];
  if (
    query.profileKey &&
    query.playerKey &&
    query.profileKey !== query.playerKey
  ) {
    const [a, b] =
      query.profileKey.localeCompare(query.playerKey) <= 0
        ? [query.profileKey, query.playerKey]
        : [query.playerKey, query.profileKey];
    const upper: [string, string, string, string] = cursor
      ? [a, b, cursor[0], cursor[1]]
      : [a, b, stringMaxKey, stringMaxKey];
    const collection = db.pairs
      .where('[playerAKey+playerBKey+startedAt+matchId]')
      .between([a, b, stringMinKey, stringMinKey], upper, true, !cursor)
      .reverse();
    let offset = 0;
    while (candidates.length <= limit) {
      const rows = await collection.offset(offset).limit(200).toArray();
      if (!rows.length) break;
      offset += rows.length;
      candidates.push(
        ...rows
          .filter((row) => {
            const playerIsA = row.playerAKey === query.profileKey;
            const result = playerIsA ? row.resultA : row.resultB;
            return (
              (!query.relationship ||
                row.relationship === query.relationship) &&
              (!query.result || result === query.result) &&
              (!query.from || row.startedAt >= query.from) &&
              (!query.to || row.startedAt <= query.to) &&
              (query.playlistId === undefined ||
                row.playlistId === query.playlistId) &&
              (!query.playlistCategory ||
                row.playlistCategory === query.playlistCategory)
            );
          })
          .map((row) => ({ matchId: row.matchId, startedAt: row.startedAt }))
          .slice(0, limit + 1 - candidates.length),
      );
      if (rows.length < 200) break;
    }
  } else if (query.playerKey) {
    const upper: [string, string, string] = cursor
      ? [query.playerKey, cursor[0], cursor[1]]
      : [query.playerKey, stringMaxKey, stringMaxKey];
    const collection = db.appearances
      .where('[playerKey+startedAt+matchId]')
      .between(
        [query.playerKey, stringMinKey, stringMinKey],
        upper,
        true,
        !cursor,
      )
      .reverse();
    let offset = 0;
    while (candidates.length <= limit) {
      const rows = await collection.offset(offset).limit(200).toArray();
      if (!rows.length) break;
      offset += rows.length;
      candidates.push(
        ...rows
          .filter(
            (row) =>
              (!query.result || row.result === query.result) &&
              (!query.from || row.startedAt >= query.from) &&
              (!query.to || row.startedAt <= query.to) &&
              (query.playlistId === undefined ||
                row.playlistId === query.playlistId) &&
              (!query.playlistCategory ||
                row.playlistCategory === query.playlistCategory),
          )
          .map((row) => ({ matchId: row.matchId, startedAt: row.startedAt }))
          .slice(0, limit + 1 - candidates.length),
      );
      if (rows.length < 200) break;
    }
  }
  const page = candidates.slice(0, limit);
  return {
    items: await hydrateSummariesByIds(page.map((item) => item.matchId)),
    nextCursor:
      candidates.length > limit && page.length
        ? cursorFor(page.at(-1)!.startedAt, page.at(-1)!.matchId)
        : undefined,
  };
}

async function resolveSessionId(
  match: MatchState,
  idleMinutes: number,
): Promise<string> {
  const existing = await db.matches.get(match.id);
  if (existing?.sessionId) return existing.sessionId;
  const prior = await db.matches
    .where('[startedAt+id]')
    .below([match.startedAt, match.id])
    .last();
  if (prior && !startsNewSession(prior, match, idleMinutes))
    return prior.sessionId;
  return sessionIdFor(match);
}

async function updateCatalog(events: TimelineEvent[]): Promise<void> {
  if (!events.length) return;
  const existing = ((await db.metadata.get('eventCatalog'))?.value ??
    {}) as Record<string, string[]>;
  const next: Record<string, Set<string>> = Object.fromEntries(
    Object.entries(existing).map(([key, values]) => [key, new Set(values)]),
  );
  for (const event of events) {
    next[event.eventName] ??= new Set();
    for (const key of Object.keys(flattenPayload(event.payload)))
      next[event.eventName]!.add(key);
  }
  await db.metadata.put({
    key: 'eventCatalog',
    value: Object.fromEntries(
      Object.entries(next)
        .sort()
        .map(([key, values]) => [key, [...values].sort()]),
    ),
  });
}

async function writeMatch(
  match: MatchState,
  idleMinutes: number,
): Promise<void> {
  const sessionId = await resolveSessionId(match, idleMinutes);
  await db.transaction(
    'rw',
    [
      db.matches,
      db.events,
      db.rawEvents,
      db.appearances,
      db.profileMatches,
      db.players,
      db.pairs,
      db.relationships,
      db.sessions,
      db.metadata,
    ],
    async () => {
      const lastEvent = await db.events
        .where('[matchId+sequence]')
        .between([match.id, 0], [match.id, Number.MAX_SAFE_INTEGER])
        .last();
      const newEvents = match.events.filter(
        (event) => event.sequence > (lastEvent?.sequence ?? 0),
      );
      await db.matches.put(storedMatch(match, sessionId));
      const appearances = match.participants.map((player) =>
        appearance(match, player),
      );
      const appearanceIds = new Set(appearances.map((item) => item.id));
      const staleAppearanceIds = (
        await db.appearances.where('matchId').equals(match.id).primaryKeys()
      ).filter((id) => !appearanceIds.has(String(id)));
      if (staleAppearanceIds.length)
        await db.appearances.bulkDelete(staleAppearanceIds);
      if (appearances.length) await db.appearances.bulkPut(appearances);
      await db.profileMatches.where('matchId').equals(match.id).delete();
      const profileMatches = profileMatchRecords(match, sessionId);
      if (profileMatches.length)
        await db.profileMatches.bulkPut(profileMatches);
      for (const item of appearances) {
        if (!item.playerKey) continue;
        const prior = await db.players.get(item.playerKey);
        await db.players.put({
          primaryId: item.playerKey,
          platformPrimaryId: playerPrimaryId(item.playerKey),
          identityKind: playerIdentityKind(item.playerKey)!,
          latestName:
            !prior || item.startedAt >= prior.lastSeen
              ? item.name
              : prior.latestName,
          normalizedName: (!prior || item.startedAt >= prior.lastSeen
            ? item.name
            : prior.latestName
          )
            .normalize('NFKC')
            .trim()
            .toLowerCase(),
          firstSeen:
            !prior || item.startedAt < prior.firstSeen
              ? item.startedAt
              : prior.firstSeen,
          lastSeen:
            !prior || item.startedAt > prior.lastSeen
              ? item.startedAt
              : prior.lastSeen,
        });
      }
      if (match.lifecycle !== 'live') {
        const pairs = pairRecords(match);
        for (const pair of pairs) {
          const existingPair = await db.pairs.get(pair.id);
          if (!existingPair) {
            const id = `${pair.playerAKey}\u0000${pair.playerBKey}`;
            const prior = await db.relationships.get(id);
            const next = relationshipRecords([pair])[0]!;
            if (prior) {
              next.gamesTogether += prior.gamesTogether;
              next.winsTogetherA += prior.winsTogetherA;
              next.winsTogetherB += prior.winsTogetherB;
              next.lossesTogetherA += prior.lossesTogetherA;
              next.lossesTogetherB += prior.lossesTogetherB;
              next.gamesOpposed += prior.gamesOpposed;
              next.winsAgainstA += prior.winsAgainstA;
              next.winsAgainstB += prior.winsAgainstB;
              next.lossesAgainstA += prior.lossesAgainstA;
              next.lossesAgainstB += prior.lossesAgainstB;
              next.firstSeen =
                prior.firstSeen < next.firstSeen
                  ? prior.firstSeen
                  : next.firstSeen;
              next.lastSeen =
                prior.lastSeen > next.lastSeen ? prior.lastSeen : next.lastSeen;
            }
            await db.relationships.put(next);
          }
          await db.pairs.put(pair);
          if (
            existingPair &&
            (existingPair.relationship !== pair.relationship ||
              existingPair.resultA !== pair.resultA ||
              existingPair.resultB !== pair.resultB)
          ) {
            const related = await db.pairs
              .where('[playerAKey+playerBKey+startedAt+matchId]')
              .between(
                [pair.playerAKey, pair.playerBKey, stringMinKey, stringMinKey],
                [pair.playerAKey, pair.playerBKey, stringMaxKey, stringMaxKey],
              )
              .toArray();
            await db.relationships.put(relationshipRecords(related)[0]!);
          }
        }
      }
      if (newEvents.length) {
        await db.events.bulkPut(newEvents.map(semanticEvent));
        await db.rawEvents.bulkPut(
          newEvents.map((event) => ({
            id: event.id,
            matchId: event.matchId,
            receivedAt: event.receivedAt,
            payload: event.payload,
          })),
        );
        await updateCatalog(newEvents);
      }
      const session = await db.sessions.get(sessionId);
      await db.sessions.put({
        id: sessionId,
        startedAt:
          session?.startedAt && session.startedAt < match.startedAt
            ? session.startedAt
            : match.startedAt,
        endedAt:
          session?.endedAt &&
          session.endedAt > (match.endedAt ?? match.lastEventAt)
            ? session.endedAt
            : (match.endedAt ?? match.lastEventAt),
        matchIds: session?.matchIds.includes(match.id)
          ? session.matchIds
          : [...(session?.matchIds ?? []), match.id],
      });
    },
  );
}

const pendingMatches = new Map<
  string,
  { match: MatchState; idleMinutes: number }
>();
const matchDrains = new Map<string, Promise<void>>();

export async function saveMatch(
  match: MatchState,
  idleMinutes = 30,
): Promise<void> {
  await normalizeExistingData();
  pendingMatches.set(match.id, { match, idleMinutes });
  const existing = matchDrains.get(match.id);
  if (existing) return existing;
  const drain = (async () => {
    while (pendingMatches.has(match.id)) {
      const latest = pendingMatches.get(match.id)!;
      pendingMatches.delete(match.id);
      await writeMatch(latest.match, latest.idleMinutes);
    }
  })().finally(() => matchDrains.delete(match.id));
  matchDrains.set(match.id, drain);
  return drain;
}

async function settleMatchWrites(): Promise<void> {
  while (matchDrains.size) await Promise.all([...matchDrains.values()]);
}

export async function deleteMatch(id: string): Promise<boolean> {
  await settleMatchWrites();
  await normalizeExistingData();
  return db.transaction(
    'rw',
    [
      db.matches,
      db.events,
      db.rawEvents,
      db.appearances,
      db.profileMatches,
      db.players,
      db.pairs,
      db.relationships,
      db.sessions,
      db.settings,
      db.metadata,
    ],
    async () => {
      const match = await db.matches.get(id);
      if (!match) return false;
      if (match.lifecycle === 'live')
        throw new Error('Live matches cannot be deleted.');

      const [deletedAppearances, deletedPairs, session, settings] =
        await Promise.all([
          db.appearances.where('matchId').equals(id).toArray(),
          db.pairs.where('matchId').equals(id).toArray(),
          db.sessions.get(match.sessionId),
          loadSettings(),
        ]);
      await Promise.all([
        db.matches.delete(id),
        db.events.where('matchId').equals(id).delete(),
        db.rawEvents.where('matchId').equals(id).delete(),
        db.appearances.where('matchId').equals(id).delete(),
        db.profileMatches.where('matchId').equals(id).delete(),
        db.pairs.where('matchId').equals(id).delete(),
      ]);

      const affectedPlayerKeys = new Set(
        deletedAppearances
          .map((item) => item.playerKey)
          .filter((playerKey): playerKey is string => !!playerKey),
      );
      for (const playerKey of affectedPlayerKeys) {
        const remaining = await db.appearances
          .where('[playerKey+startedAt+matchId]')
          .between(
            [playerKey, stringMinKey, stringMinKey],
            [playerKey, stringMaxKey, stringMaxKey],
          )
          .toArray();
        const earliest = remaining[0];
        const latest = remaining.at(-1);
        if (!earliest || !latest) {
          await db.players.delete(playerKey);
          continue;
        }
        await db.players.put({
          primaryId: playerKey,
          platformPrimaryId: playerPrimaryId(playerKey),
          identityKind: playerIdentityKind(playerKey)!,
          latestName: latest.name,
          normalizedName: latest.name.normalize('NFKC').trim().toLowerCase(),
          firstSeen: earliest.startedAt,
          lastSeen: latest.startedAt,
        });
      }

      const affectedRelationships = new Map(
        deletedPairs.map((pair) => [
          `${pair.playerAKey}\u0000${pair.playerBKey}`,
          pair,
        ]),
      );
      for (const [relationshipId, pair] of affectedRelationships) {
        const remaining = await db.pairs
          .where('[playerAKey+playerBKey+startedAt+matchId]')
          .between(
            [pair.playerAKey, pair.playerBKey, stringMinKey, stringMinKey],
            [pair.playerAKey, pair.playerBKey, stringMaxKey, stringMaxKey],
          )
          .toArray();
        const rebuilt = relationshipRecords(remaining)[0];
        if (rebuilt) await db.relationships.put(rebuilt);
        else await db.relationships.delete(relationshipId);
      }

      if (session) {
        const remainingMatches = (
          await db.matches.bulkGet(
            session.matchIds.filter((matchId) => matchId !== id),
          )
        ).filter((item): item is StoredMatch => !!item);
        if (match.sessionEndedAfter && remainingMatches.length) {
          const latestRemaining = [...remainingMatches]
            .sort(
              (left, right) =>
                left.startedAt.localeCompare(right.startedAt) ||
                left.id.localeCompare(right.id),
            )
            .at(-1)!;
          latestRemaining.sessionEndedAfter = true;
        }
        const grouped = groupSessionRecords(
          remainingMatches,
          settings.sessionGapMinutes,
        );
        await db.sessions.delete(session.id);
        if (grouped.records.length) await db.sessions.bulkPut(grouped.records);
        if (remainingMatches.length)
          await db.matches.bulkPut(
            remainingMatches.map((item) => ({
              ...item,
              sessionId: grouped.byMatch.get(item.id)!,
            })),
          );
        const remainingProfileMatches = await db.profileMatches
          .where('sessionId')
          .equals(session.id)
          .toArray();
        if (remainingProfileMatches.length)
          await db.profileMatches.bulkPut(
            remainingProfileMatches.map((item) => ({
              ...item,
              sessionId: grouped.byMatch.get(item.matchId)!,
            })),
          );
      }

      await db.metadata.put({
        key: 'eventCatalog',
        value: buildCatalog(await db.events.toArray()),
      });
      return true;
    },
  );
}

export async function endCurrentSession(
  activeMatchId?: string,
): Promise<EndSessionResult> {
  await normalizeExistingData();
  await settleMatchWrites();
  return db.transaction(
    'rw',
    [db.matches, db.profileMatches, db.sessions],
    async () => {
      const ordered = await db.matches.orderBy('[startedAt+id]').toArray();
      if (!ordered.length) return 'unchanged';

      if (!activeMatchId) {
        const latest = ordered.at(-1)!;
        if (latest.sessionEndedAfter) return 'unchanged';
        await db.matches.put({ ...latest, sessionEndedAfter: true });
        return 'ended';
      }

      const activeIndex = ordered.findIndex(
        (match) => match.id === activeMatchId,
      );
      if (activeIndex <= 0) return 'unchanged';
      const active = ordered[activeIndex]!;
      const prior = ordered[activeIndex - 1]!;
      if (active.sessionId !== prior.sessionId) return 'unchanged';

      const session = await db.sessions.get(active.sessionId);
      if (!session) return 'unchanged';
      const sessionMatches = (await db.matches.bulkGet(session.matchIds))
        .filter((match): match is StoredMatch => !!match)
        .sort(
          (left, right) =>
            left.startedAt.localeCompare(right.startedAt) ||
            left.id.localeCompare(right.id),
        );
      const splitIndex = sessionMatches.findIndex(
        (match) => match.id === activeMatchId,
      );
      if (splitIndex <= 0) return 'unchanged';

      const before = sessionMatches.slice(0, splitIndex);
      const after = sessionMatches.slice(splitIndex);
      const boundary = before.at(-1)!;
      const firstMoved = after[0]!;
      const newSessionId = sessionIdFor(firstMoved);
      await db.matches.bulkPut([
        { ...boundary, sessionEndedAfter: true },
        ...after.map((match) => ({ ...match, sessionId: newSessionId })),
      ]);
      const movedProfileMatches = await db.profileMatches
        .where('matchId')
        .anyOf(after.map((match) => match.id))
        .toArray();
      if (movedProfileMatches.length)
        await db.profileMatches.bulkPut(
          movedProfileMatches.map((item) => ({
            ...item,
            sessionId: newSessionId,
          })),
        );
      await db.sessions.bulkPut([
        {
          id: session.id,
          startedAt: before[0]!.startedAt,
          endedAt: boundary.endedAt ?? boundary.lastEventAt,
          matchIds: before.map((match) => match.id),
        },
        {
          id: newSessionId,
          startedAt: firstMoved.startedAt,
          endedAt: after.at(-1)!.endedAt ?? after.at(-1)!.lastEventAt,
          matchIds: after.map((match) => match.id),
        },
      ]);
      return 'split-live';
    },
  );
}

export async function loadMatches(profileKey?: string): Promise<MatchState[]> {
  await historyRepository.initialize();
  if (profileKey) {
    const matches: MatchState[] = [];
    for await (const match of historyRepository.iterateMatches(100, profileKey))
      matches.push(match);
    return matches;
  }
  return hydrateMatches(await db.matches.orderBy('[startedAt+id]').toArray());
}

export async function loadSettings(): Promise<FennecSettings> {
  const stored = await db.settings.get('settings');
  return normalizeSettings(stored?.value);
}

async function rebuildSessions(
  idleMinutes: number,
  settings: FennecSettings,
): Promise<void> {
  const matches = await db.matches.orderBy('[startedAt+id]').toArray();
  const grouped = groupSessionRecords(matches, idleMinutes);
  await db.transaction(
    'rw',
    db.matches,
    db.profileMatches,
    db.sessions,
    db.settings,
    async () => {
      await db.sessions.clear();
      if (grouped.records.length) await db.sessions.bulkPut(grouped.records);
      if (matches.length)
        await db.matches.bulkPut(
          matches.map((match) => ({
            ...match,
            sessionId: grouped.byMatch.get(match.id)!,
          })),
        );
      const profileMatches = await db.profileMatches.toArray();
      if (profileMatches.length)
        await db.profileMatches.bulkPut(
          profileMatches.map((item) => ({
            ...item,
            sessionId: grouped.byMatch.get(item.matchId)!,
          })),
        );
      await db.settings.put({ key: 'settings', value: settings });
    },
  );
}

export async function saveSettings(value: FennecSettings): Promise<void> {
  const previous = await loadSettings();
  if (previous.sessionGapMinutes !== value.sessionGapMinutes)
    await rebuildSessions(value.sessionGapMinutes, value);
  else await db.settings.put({ key: 'settings', value });
}

export async function loadProfile(): Promise<FennecProfile | undefined> {
  const stored = await db.profiles.get('profile');
  return stored
    ? { primaryId: stored.primaryId, displayName: stored.displayName }
    : undefined;
}

export async function saveProfile(value: FennecProfile): Promise<void> {
  await db.profiles.put({ key: 'profile', ...value });
}

export async function clearHistory(): Promise<void> {
  await settleMatchWrites();
  await db.transaction(
    'rw',
    [
      db.matches,
      db.events,
      db.rawEvents,
      db.appearances,
      db.profileMatches,
      db.players,
      db.pairs,
      db.relationships,
      db.sessions,
      db.metadata,
    ],
    async () => {
      await Promise.all([
        db.matches.clear(),
        db.events.clear(),
        db.rawEvents.clear(),
        db.appearances.clear(),
        db.profileMatches.clear(),
        db.players.clear(),
        db.pairs.clear(),
        db.relationships.clear(),
        db.sessions.clear(),
      ]);
      await db.metadata.put({ key: 'eventCatalog', value: {} });
    },
  );
}

export async function replaceAll(
  matches: MatchState[],
  settings: FennecSettings,
  profile?: FennecProfile,
): Promise<void> {
  await settleMatchWrites();
  const ordered = [...matches].sort(
    (a, b) =>
      a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  const grouped = groupSessionRecords(ordered, settings.sessionGapMinutes);
  const appearances = ordered.flatMap((match) =>
    match.participants.map((player) => appearance(match, player)),
  );
  const profileMatches = ordered.flatMap((match) =>
    profileMatchRecords(match, grouped.byMatch.get(match.id)!),
  );
  const events = ordered.flatMap((match) => match.events);
  const players = new Map<string, StoredPlayerRecord>();
  for (const item of appearances) {
    if (!item.playerKey) continue;
    const prior = players.get(item.playerKey);
    const latestName =
      !prior || item.startedAt >= prior.lastSeen ? item.name : prior.latestName;
    players.set(item.playerKey, {
      primaryId: item.playerKey,
      platformPrimaryId: playerPrimaryId(item.playerKey),
      identityKind: playerIdentityKind(item.playerKey)!,
      latestName,
      normalizedName: latestName.normalize('NFKC').trim().toLowerCase(),
      firstSeen:
        !prior || item.startedAt < prior.firstSeen
          ? item.startedAt
          : prior.firstSeen,
      lastSeen:
        !prior || item.startedAt > prior.lastSeen
          ? item.startedAt
          : prior.lastSeen,
    });
  }
  await db.transaction(
    'rw',
    [
      db.matches,
      db.events,
      db.rawEvents,
      db.appearances,
      db.profileMatches,
      db.players,
      db.pairs,
      db.relationships,
      db.sessions,
      db.settings,
      db.profiles,
      db.metadata,
    ],
    async () => {
      await Promise.all([
        db.matches.clear(),
        db.events.clear(),
        db.rawEvents.clear(),
        db.appearances.clear(),
        db.profileMatches.clear(),
        db.players.clear(),
        db.pairs.clear(),
        db.relationships.clear(),
        db.sessions.clear(),
        db.profiles.clear(),
      ]);
      await db.settings.put({ key: 'settings', value: settings });
      if (profile) await db.profiles.put({ key: 'profile', ...profile });
      if (ordered.length)
        await db.matches.bulkPut(
          ordered.map((match) =>
            storedMatch(match, grouped.byMatch.get(match.id)!),
          ),
        );
      if (events.length) {
        await db.events.bulkPut(events.map(semanticEvent));
        await db.rawEvents.bulkPut(
          events.map((event) => ({
            id: event.id,
            matchId: event.matchId,
            receivedAt: event.receivedAt,
            payload: event.payload,
          })),
        );
      }
      if (appearances.length) await db.appearances.bulkPut(appearances);
      if (profileMatches.length)
        await db.profileMatches.bulkPut(profileMatches);
      if (players.size) await db.players.bulkPut([...players.values()]);
      const pairs = ordered.flatMap(pairRecords);
      if (pairs.length) await db.pairs.bulkPut(pairs);
      const relationships = relationshipRecords(pairs);
      if (relationships.length) await db.relationships.bulkPut(relationships);
      if (grouped.records.length) await db.sessions.bulkPut(grouped.records);
      await db.metadata.bulkPut([
        { key: schemaMarker, value: true },
        { key: 'eventCatalog', value: buildCatalog(events) },
      ]);
    },
  );
  await compactRawEvents();
}

async function compactRawEvents(now = new Date()): Promise<number> {
  const cutoff = new Date(
    now.getTime() - rawRetentionDays * 86_400_000,
  ).toISOString();
  let deleted = 0;
  while (true) {
    const ids = await db.rawEvents
      .where('[receivedAt+id]')
      .below([cutoff, stringMaxKey])
      .limit(500)
      .primaryKeys();
    if (!ids.length) break;
    await db.rawEvents.bulkDelete(ids);
    deleted += ids.length;
  }
  return deleted;
}

export const historyRepository: HistoryRepository = {
  async initialize() {
    if (!db.isOpen()) await db.open();
    await normalizeExistingData();
    await this.compactRawEvents();
  },
  countMatches: (profileKey) =>
    profileKey
      ? db.profileMatches.where('playerKey').equals(profileKey).count()
      : db.matches.count(),
  async countSessions(profileKey) {
    if (!profileKey) return db.sessions.count();
    return (
      await db.profileMatches
        .where('[playerKey+sessionId]')
        .between([profileKey, stringMinKey], [profileKey, stringMaxKey])
        .uniqueKeys()
    ).length;
  },
  async firstMatchStartedAt(profileKey) {
    if (profileKey)
      return (
        await db.profileMatches
          .where('[playerKey+startedAt+matchId]')
          .between(
            [profileKey, stringMinKey, stringMinKey],
            [profileKey, stringMaxKey, stringMaxKey],
          )
          .first()
      )?.startedAt;
    return (await db.matches.orderBy('[startedAt+id]').first())?.startedAt;
  },
  /** Pages only sessions containing matches linked to the selected profile. */
  async listSessions(profileKey, cursor, limit = 25) {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    const parsed = parseCursor(cursor);
    const collection = parsed
      ? db.sessions.where('[startedAt+id]').below(parsed).reverse()
      : db.sessions.orderBy('[startedAt+id]').reverse();
    const selected: Array<{
      record: SessionRecord;
      matchIds: string[];
    }> = [];
    let offset = 0;
    while (selected.length <= pageSize) {
      const records = await collection.offset(offset).limit(100).toArray();
      if (!records.length) break;
      offset += records.length;
      for (const record of records) {
        const matchIds = profileKey
          ? (
              await db.profileMatches
                .where('[playerKey+sessionId]')
                .equals([profileKey, record.id])
                .toArray()
            ).map((item) => item.matchId)
          : record.matchIds;
        if (matchIds.length) selected.push({ record, matchIds });
        if (selected.length > pageSize) break;
      }
      if (records.length < 100 || selected.length > pageSize) break;
    }
    const page = selected.slice(0, pageSize);
    const groups = await Promise.all(
      page.map(async ({ record, matchIds }): Promise<SessionGroup> => {
        const matches = await hydrateSummariesByIds(matchIds);
        const ordered = matches.sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt),
        );
        return {
          id: record.id,
          startedAt: ordered[0]!.startedAt,
          endedAt: ordered.at(-1)!.endedAt ?? ordered.at(-1)!.lastEventAt,
          matches: ordered,
          endedManually:
            record.matchIds.at(-1) === ordered.at(-1)?.id &&
            ordered.at(-1)?.sessionEndedAfter === true,
        };
      }),
    );
    return {
      items: groups,
      nextCursor:
        selected.length > pageSize && page.length
          ? cursorFor(page.at(-1)!.record.startedAt, page.at(-1)!.record.id)
          : undefined,
    };
  },
  async getSession(id, profileKey) {
    const record = await db.sessions.get(id);
    if (!record) return undefined;
    const matchIds = profileKey
      ? (
          await db.profileMatches
            .where('[playerKey+sessionId]')
            .equals([profileKey, record.id])
            .toArray()
        ).map((item) => item.matchId)
      : record.matchIds;
    if (!matchIds.length) return undefined;
    const matches = (await hydrateSummariesByIds(matchIds)).sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt),
    );
    return {
      id: record.id,
      startedAt: matches[0]!.startedAt,
      endedAt: matches.at(-1)!.endedAt ?? matches.at(-1)!.lastEventAt,
      matches,
      endedManually:
        record.matchIds.at(-1) === matches.at(-1)?.id &&
        matches.at(-1)?.sessionEndedAfter === true,
    };
  },
  listMatches(query = {}) {
    if (query.playerKey) return listPlayerMatches(query);
    if (query.profileKey)
      return listProfileMatches(
        query as MatchHistoryQuery & { profileKey: string },
      );
    return listPlainMatches(query);
  },
  async getMatch(id, profileKey) {
    if (
      profileKey &&
      !(await db.profileMatches.get(`${profileKey}\u0000${id}`))
    )
      return undefined;
    return (await hydrateByIds([id]))[0];
  },
  async loadLatestMatch() {
    const latest = await db.matches.orderBy('[startedAt+id]').last();
    return latest ? (await hydrateByIds([latest.id]))[0] : undefined;
  },
  async loadLiveMatches() {
    return hydrateMatches(
      await db.matches.where('lifecycle').equals('live').toArray(),
    );
  },
  endCurrentSession,
  async searchPlayers(query = '', limit = 100, identityKind) {
    const normalized = normalizePlayerName(query) ?? '';
    const records = identityKind
      ? normalized
        ? await db.players
            .where('[identityKind+normalizedName]')
            .between(
              [identityKind, normalized],
              [identityKind, `${normalized}${stringMaxKey}`],
            )
            .limit(limit)
            .toArray()
        : await db.players
            .where('[identityKind+lastSeen]')
            .between([identityKind, stringMinKey], [identityKind, stringMaxKey])
            .reverse()
            .limit(limit)
            .toArray()
      : !normalized
        ? await db.players.orderBy('lastSeen').reverse().limit(limit).toArray()
        : await db.players
            .where('normalizedName')
            .startsWith(normalized)
            .limit(limit)
            .toArray();
    return records.map((record): PlayerRecord => ({
      playerKey: record.primaryId,
      primaryId: record.platformPrimaryId,
      identityKind: record.identityKind,
      latestName: record.latestName,
      normalizedName: record.normalizedName,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
    }));
  },
  /**
   * Builds a profile-relative relationship summary and filtered match page for
   * a stable platform identity or a name-based bot identity.
   */
  async getPlayerHistory(
    profileKey,
    playerKey,
    query = {},
  ): Promise<PlayerHistoryResult> {
    const [a, b] =
      profileKey.localeCompare(playerKey) <= 0
        ? [profileKey, playerKey]
        : [playerKey, profileKey];
    const relationship = await db.relationships.get(`${a}\u0000${b}`);
    const player = await db.players.get(playerKey);
    const profileIsA = relationship?.playerAKey === profileKey;
    const summary = relationship
      ? ({
          playerKey,
          primaryId: player?.platformPrimaryId,
          identityKind: player?.identityKind ?? playerIdentityKind(playerKey)!,
          latestName: player?.latestName ?? playerKey,
          gamesTogether: relationship.gamesTogether,
          winsTogether: profileIsA
            ? relationship.winsTogetherA
            : relationship.winsTogetherB,
          lossesTogether: profileIsA
            ? relationship.lossesTogetherA
            : relationship.lossesTogetherB,
          gamesOpposed: relationship.gamesOpposed,
          winsAgainst: profileIsA
            ? relationship.winsAgainstA
            : relationship.winsAgainstB,
          lossesAgainst: profileIsA
            ? relationship.lossesAgainstA
            : relationship.lossesAgainstB,
          firstSeen: relationship.firstSeen,
          lastSeen: relationship.lastSeen,
        } satisfies EncounterSummary)
      : undefined;
    return {
      summary,
      matches: await listPlayerMatches({ ...query, profileKey, playerKey }),
    };
  },
  async listPlayerKeysWithHistory(profileKey, playerKeys, excludingMatchId) {
    const candidates = [...new Set(playerKeys)].filter(
      (playerKey) => playerKey !== profileKey,
    );
    if (!candidates.length) return [];
    const pairs = candidates.map((playerKey): [string, string] =>
      profileKey.localeCompare(playerKey) <= 0
        ? [profileKey, playerKey]
        : [playerKey, profileKey],
    );
    return db.transaction('r', db.relationships, db.pairs, async () => {
      const [relationships, excludedPairs] = await Promise.all([
        db.relationships.bulkGet(pairs.map(([a, b]) => `${a}\u0000${b}`)),
        db.pairs.bulkGet(
          pairs.map(([a, b]) => `${a}\u0000${b}\u0000${excludingMatchId}`),
        ),
      ]);
      return candidates.filter((_, index) => {
        const relationship = relationships[index];
        if (!relationship) return false;
        const meetings = relationship.gamesTogether + relationship.gamesOpposed;
        return meetings - (excludedPairs[index] ? 1 : 0) > 0;
      });
    });
  },
  async getTimelineCatalog() {
    return ((await db.metadata.get('eventCatalog'))?.value ?? {}) as Record<
      string,
      string[]
    >;
  },
  async *iterateMatches(pageSize = 100, profileKey) {
    let cursor: string | undefined;
    do {
      const query = {
        cursor,
        limit: Math.min(pageSize, 100),
        ...(profileKey ? { profileKey } : {}),
      };
      const page = profileKey
        ? await listProfileMatches(
            query as MatchHistoryQuery & { profileKey: string },
          )
        : await listPlainMatches(query);
      const detailed = await hydrateByIds(page.items.map((match) => match.id));
      for (const match of detailed) yield match;
      cursor = page.nextCursor;
    } while (cursor);
  },
  saveMatch,
  deleteMatch,
  clearHistory,
  replaceAll,
  compactRawEvents,
  async storageStatistics(): Promise<StorageStatistics> {
    const [matches, semanticEvents, rawEvents, players] = await Promise.all([
      db.matches.count(),
      db.events.count(),
      db.rawEvents.count(),
      db.players.count(),
    ]);
    const estimate =
      typeof navigator !== 'undefined' && navigator.storage?.estimate
        ? await navigator.storage.estimate()
        : undefined;
    const persisted =
      typeof navigator !== 'undefined' && navigator.storage?.persisted
        ? await navigator.storage.persisted()
        : undefined;
    return {
      matches,
      semanticEvents,
      rawEvents,
      players,
      usage: estimate?.usage,
      quota: estimate?.quota,
      persisted,
      rawRetentionDays,
    };
  },
};
