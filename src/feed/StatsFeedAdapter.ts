import type {
  FeedConnectionState,
  MatchState,
  StatsEnvelope,
} from '../domain/types';

export interface StatsFeedHandlers {
  onState(state: FeedConnectionState): void;
  onEnvelope(envelope: StatsEnvelope): void | Promise<void>;
  onCheckpoint?(match: MatchState): void | Promise<void>;
  onTombstone?(matchId: string, deletedAt: string): void | Promise<void>;
  onDiagnostic?(message: string): void;
}

export interface StatsFeedAdapter {
  start(handlers: StatsFeedHandlers): void;
  stop(): void;
  checkpoint?(match: MatchState): void;
  tombstone?(matchId: string): void;
}
