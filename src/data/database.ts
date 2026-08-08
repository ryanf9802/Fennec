import Dexie, { type EntityTable, type Table } from 'dexie';
import { flattenPayload } from '../domain/timeline';
import {
  normalizePlayerName,
  playerIdentityKind,
  playerKeyFor,
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
import type {
  HistoryPage,
  HistoryRepository,
  MatchHistoryQuery,
  PlayerHistoryResult,
  PlayerRecord,
  StorageStatistics,
} from './historyRepository';

const rawRetentionDays = 90;
const schemaMarker = 'normalized-v4';
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
    Pick<MatchState, 'id' | 'startedAt' | 'endedAt' | 'lastEventAt'>
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
      !current ||
      !prior ||
      new Date(match.startedAt).getTime() -
        new Date(prior.endedAt ?? prior.lastEventAt).getTime() >=
        idleMinutes * 60_000;
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
      const grouped = groupSessionRecords(hydrated, settings.sessionGapMinutes);
      const appearances = hydrated.flatMap((match) =>
        match.participants.map((player) => appearance(match, player)),
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
  if (
    prior &&
    new Date(match.startedAt).getTime() -
      new Date(prior.endedAt ?? prior.lastEventAt).getTime() <
      idleMinutes * 60_000
  )
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

export async function loadMatches(): Promise<MatchState[]> {
  await historyRepository.initialize();
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
  await db.transaction('rw', db.matches, db.sessions, db.settings, async () => {
    await db.sessions.clear();
    if (grouped.records.length) await db.sessions.bulkPut(grouped.records);
    if (matches.length)
      await db.matches.bulkPut(
        matches.map((match) => ({
          ...match,
          sessionId: grouped.byMatch.get(match.id)!,
        })),
      );
    await db.settings.put({ key: 'settings', value: settings });
  });
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
  countMatches: () => db.matches.count(),
  countSessions: () => db.sessions.count(),
  async firstMatchStartedAt() {
    return (await db.matches.orderBy('[startedAt+id]').first())?.startedAt;
  },
  async listSessions(cursor, limit = 25) {
    const pageSize = Math.min(Math.max(limit, 1), 50);
    const parsed = parseCursor(cursor);
    const collection = parsed
      ? db.sessions.where('[startedAt+id]').below(parsed).reverse()
      : db.sessions.orderBy('[startedAt+id]').reverse();
    const records = await collection.limit(pageSize + 1).toArray();
    const page = records.slice(0, pageSize);
    const groups = await Promise.all(
      page.map(async (record): Promise<SessionGroup> => ({
        id: record.id,
        startedAt: record.startedAt,
        endedAt: record.endedAt,
        matches: await hydrateSummariesByIds(record.matchIds),
      })),
    );
    return {
      items: groups,
      nextCursor:
        records.length > pageSize && page.length
          ? cursorFor(page.at(-1)!.startedAt, page.at(-1)!.id)
          : undefined,
    };
  },
  async getSession(id) {
    const record = await db.sessions.get(id);
    return record
      ? {
          id: record.id,
          startedAt: record.startedAt,
          endedAt: record.endedAt,
          matches: await hydrateSummariesByIds(record.matchIds),
        }
      : undefined;
  },
  listMatches(query = {}) {
    return query.playerKey ? listPlayerMatches(query) : listPlainMatches(query);
  },
  async getMatch(id) {
    return (await hydrateByIds([id]))[0];
  },
  async loadLiveMatches() {
    return hydrateMatches(
      await db.matches.where('lifecycle').equals('live').toArray(),
    );
  },
  async searchPlayers(query = '', limit = 100) {
    const normalized = normalizePlayerName(query) ?? '';
    const records = !normalized
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
  async getTimelineCatalog() {
    return ((await db.metadata.get('eventCatalog'))?.value ?? {}) as Record<
      string,
      string[]
    >;
  },
  async *iterateMatches(pageSize = 100) {
    let cursor: string | undefined;
    do {
      const page = await listPlainMatches({
        cursor,
        limit: Math.min(pageSize, 100),
      });
      const detailed = await hydrateByIds(page.items.map((match) => match.id));
      for (const match of detailed) yield match;
      cursor = page.nextCursor;
    } while (cursor);
  },
  saveMatch,
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
