import type { EncounterSummary, FennecProfile, FennecSettings, MatchState, SessionGroup } from '../domain/types';

export type MatchResultFilter = 'win' | 'loss' | 'incomplete';
export type RelationshipFilter = 'together' | 'against';

export interface MatchHistoryQuery {
  playerId?: string;
  profileId?: string;
  from?: string;
  to?: string;
  playlistId?: number;
  playlistCategory?: MatchState['playlistCategory'];
  relationship?: RelationshipFilter;
  result?: MatchResultFilter;
  cursor?: string;
  limit?: number;
}

export interface HistoryPage<T> {
  items: T[];
  nextCursor?: string;
}

export interface PlayerRecord {
  primaryId: string;
  latestName: string;
  normalizedName: string;
  firstSeen: string;
  lastSeen: string;
}

export interface PlayerHistoryResult {
  summary?: EncounterSummary;
  matches: HistoryPage<MatchState>;
}

export interface StorageStatistics {
  matches: number;
  semanticEvents: number;
  rawEvents: number;
  players: number;
  usage?: number;
  quota?: number;
  persisted?: boolean;
  rawRetentionDays: number;
}

export interface HistoryRepository {
  initialize(): Promise<void>;
  countMatches(): Promise<number>;
  countSessions(): Promise<number>;
  firstMatchStartedAt(): Promise<string | undefined>;
  listSessions(cursor?: string, limit?: number): Promise<HistoryPage<SessionGroup>>;
  getSession(id: string): Promise<SessionGroup | undefined>;
  listMatches(query?: MatchHistoryQuery): Promise<HistoryPage<MatchState>>;
  getMatch(id: string): Promise<MatchState | undefined>;
  loadLiveMatches(): Promise<MatchState[]>;
  searchPlayers(query?: string, limit?: number): Promise<PlayerRecord[]>;
  getPlayerHistory(profileId: string, playerId: string, query?: Omit<MatchHistoryQuery, 'profileId' | 'playerId'>): Promise<PlayerHistoryResult>;
  getTimelineCatalog(): Promise<Record<string, string[]>>;
  iterateMatches(pageSize?: number): AsyncIterable<MatchState>;
  saveMatch(match: MatchState, sessionGapMinutes: number): Promise<void>;
  clearHistory(): Promise<void>;
  replaceAll(matches: MatchState[], settings: FennecSettings, profile?: FennecProfile): Promise<void>;
  compactRawEvents(now?: Date): Promise<number>;
  storageStatistics(): Promise<StorageStatistics>;
}
