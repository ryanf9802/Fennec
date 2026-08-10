import type {
  FeedConnectionState,
  FennecProfile,
  FennecSettings,
  MatchState,
  StatsEnvelope,
} from '../domain/types';

export interface CompanionSyncStatus {
  mode:
    | 'browser-only'
    | 'connecting'
    | 'restoring'
    | 'reconciling'
    | 'synchronized'
    | 'unavailable'
    | 'error';
  completedMatches?: number;
  totalMatches?: number;
  pendingFrames?: number;
  lastSyncedAt?: string;
  error?: string;
}

export interface StatsFeedHandlers {
  onState(state: FeedConnectionState): void;
  /** Reports authoritative Stats API access, not merely companion transport connectivity. */
  onStatsApiVerified?(): void;
  onEnvelope(envelope: StatsEnvelope): void | Promise<void>;
  onCanonicalReset?(): void | Promise<void>;
  onCheckpoint?(match: MatchState): void | Promise<void>;
  onTombstone?(matchId: string, deletedAt: string): void | Promise<void>;
  onPreferences?(
    settings?: FennecSettings,
    profile?: FennecProfile,
  ): void | Promise<void>;
  onSyncStatus?(status: CompanionSyncStatus): void;
  onDiagnostic?(message: string): void;
}

export interface StatsFeedAdapter {
  start(handlers: StatsFeedHandlers): void;
  stop(): void;
  checkpoint?(match: MatchState): void;
  tombstone?(matchId: string): void;
  preferences?(settings: FennecSettings, profile?: FennecProfile): void;
}
