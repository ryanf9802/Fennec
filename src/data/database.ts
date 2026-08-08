import Dexie, { type EntityTable } from 'dexie';
import { normalizeSettings, type FennecProfile, type FennecSettings, type MatchState, type TimelineEvent } from '../domain/types';

type StoredMatch = Omit<MatchState, 'events'>;
interface SettingRecord { key: 'settings'; value: FennecSettings }
interface ProfileRecord extends FennecProfile { key: 'profile' }

class FennecDatabase extends Dexie {
  matches!: EntityTable<StoredMatch, 'id'>;
  events!: EntityTable<TimelineEvent, 'id'>;
  settings!: EntityTable<SettingRecord, 'key'>;
  profiles!: EntityTable<ProfileRecord, 'key'>;

  constructor() {
    super('fennec');
    this.version(1).stores({
      matches: 'id, startedAt, lastEventAt, lifecycle, playlistCategory',
      events: 'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
      settings: 'key',
      profiles: 'key, primaryId',
    });
    this.version(2).stores({
      matches: 'id, startedAt, lastEventAt, lifecycle, playlistCategory',
      events: 'id, matchId, sequence, receivedAt, eventName, [matchId+sequence]',
      settings: 'key',
      profiles: 'key, primaryId',
    }).upgrade(async (transaction) => {
      await transaction.table<StoredMatch>('matches').toCollection().modify((match) => {
        match.participants = match.participants.map((player) => ({
          ...player,
          carTouches: player.carTouches ?? 0,
          loadout: player.loadout ?? [],
          isPresent: player.isPresent ?? true,
        }));
        match.teams = match.teams.map((team) => ({ ...team, colorSecondary: team.colorSecondary ?? '' }));
      });
    });
  }
}

export const db = new FennecDatabase();

export async function loadMatches(): Promise<MatchState[]> {
  const [matches, events] = await Promise.all([db.matches.toArray(), db.events.toArray()]);
  const byMatch = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const list = byMatch.get(event.matchId) ?? [];
    list.push(event);
    byMatch.set(event.matchId, list);
  }
  return matches.map((match) => ({ ...match, events: (byMatch.get(match.id) ?? []).sort((a, b) => a.sequence - b.sequence) }));
}

async function writeMatch(match: MatchState): Promise<void> {
  const { events, ...stored } = match;
  await db.transaction('rw', db.matches, db.events, async () => {
    await db.matches.put(stored);
    if (events.length) await db.events.bulkPut(events);
  });
}

const pendingMatches = new Map<string, MatchState>();
const matchDrains = new Map<string, Promise<void>>();

export function saveMatch(match: MatchState): Promise<void> {
  pendingMatches.set(match.id, match);
  const existing = matchDrains.get(match.id);
  if (existing) return existing;
  const drain = (async () => {
    while (pendingMatches.has(match.id)) {
      const latest = pendingMatches.get(match.id)!;
      pendingMatches.delete(match.id);
      await writeMatch(latest);
    }
  })().finally(() => matchDrains.delete(match.id));
  matchDrains.set(match.id, drain);
  return drain;
}

async function settleMatchWrites(): Promise<void> {
  while (matchDrains.size) await Promise.all([...matchDrains.values()]);
}

export async function loadSettings(): Promise<FennecSettings> {
  const stored = await db.settings.get('settings');
  return normalizeSettings(stored?.value);
}

export async function saveSettings(value: FennecSettings): Promise<void> {
  await db.settings.put({ key: 'settings', value });
}

export async function loadProfile(): Promise<FennecProfile | undefined> {
  const stored = await db.profiles.get('profile');
  return stored ? { primaryId: stored.primaryId, displayName: stored.displayName } : undefined;
}

export async function saveProfile(value: FennecProfile): Promise<void> {
  await db.profiles.put({ key: 'profile', ...value });
}

export async function clearHistory(): Promise<void> {
  await settleMatchWrites();
  await db.transaction('rw', db.matches, db.events, async () => {
    await Promise.all([db.matches.clear(), db.events.clear()]);
  });
}

export async function replaceAll(matches: MatchState[], settings: FennecSettings, profile?: FennecProfile): Promise<void> {
  await settleMatchWrites();
  await db.transaction('rw', db.matches, db.events, db.settings, db.profiles, async () => {
    await Promise.all([db.matches.clear(), db.events.clear(), db.settings.clear(), db.profiles.clear()]);
    const storedMatches = matches.map((match) => {
      const stored: Partial<MatchState> = { ...match };
      delete stored.events;
      return stored as StoredMatch;
    });
    const events = matches.flatMap((match) => match.events);
    if (storedMatches.length) await db.matches.bulkPut(storedMatches);
    if (events.length) await db.events.bulkPut(events);
    await db.settings.put({ key: 'settings', value: settings });
    if (profile) await db.profiles.put({ key: 'profile', ...profile });
  });
}
