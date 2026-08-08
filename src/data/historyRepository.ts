import type { PlayerIdentityKind } from '../domain/playerIdentity';
import type {
  EncounterSummary,
  FennecProfile,
  FennecSettings,
  MatchState,
  SessionGroup,
} from '../domain/types';

export type MatchResultFilter = 'win' | 'loss' | 'incomplete';
export type RelationshipFilter = 'together' | 'against';

export interface MatchHistoryQuery {
  playerKey?: string;
  profileKey?: string;
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
  playerKey: string;
  primaryId?: string;
  identityKind: PlayerIdentityKind;
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
  listSessions(
    cursor?: string,
    limit?: number,
  ): Promise<HistoryPage<SessionGroup>>;
  getSession(id: string): Promise<SessionGroup | undefined>;
  listMatches(query?: MatchHistoryQuery): Promise<HistoryPage<MatchState>>;
  getMatch(id: string): Promise<MatchState | undefined>;
  loadLiveMatches(): Promise<MatchState[]>;
  searchPlayers(query?: string, limit?: number): Promise<PlayerRecord[]>;
  getPlayerHistory(
    profileKey: string,
    playerKey: string,
    query?: Omit<MatchHistoryQuery, 'profileKey' | 'playerKey'>,
  ): Promise<PlayerHistoryResult>;
  getTimelineCatalog(): Promise<Record<string, string[]>>;
  iterateMatches(pageSize?: number): AsyncIterable<MatchState>;
  saveMatch(match: MatchState, sessionGapMinutes: number): Promise<void>;
  deleteMatch(id: string): Promise<boolean>;
  endCurrentSession(activeMatchId?: string): Promise<EndSessionResult>;
  clearHistory(): Promise<void>;
  replaceAll(
    matches: MatchState[],
    settings: FennecSettings,
    profile?: FennecProfile,
  ): Promise<void>;
  compactRawEvents(now?: Date): Promise<number>;
  storageStatistics(): Promise<StorageStatistics>;
}

export type EndSessionResult = 'ended' | 'split-live' | 'unchanged';
