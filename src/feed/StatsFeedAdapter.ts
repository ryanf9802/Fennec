import type { FeedConnectionState, StatsEnvelope } from '../domain/types';

export interface StatsFeedHandlers {
  onState(state: FeedConnectionState): void;
  onEnvelope(envelope: StatsEnvelope): void | Promise<void>;
  onDiagnostic?(message: string): void;
}

export interface StatsFeedAdapter {
  start(handlers: StatsFeedHandlers): void;
  stop(): void;
}
