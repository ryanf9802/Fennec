import {
  companionCursor,
  companionPairingToken,
  saveCompanionCursor,
} from '../companion/client';
import { historyRepository } from '../data/database';
import { parseEnvelope } from '../domain/envelope';
import type { MatchState } from '../domain/types';
import type { StatsFeedAdapter, StatsFeedHandlers } from './StatsFeedAdapter';
import { WebSocketStatsFeed } from './WebSocketStatsFeed';

interface CompanionFrame {
  type: 'frame';
  id: number;
  payload: string;
}

interface CompanionCheckpoint {
  type: 'checkpoint';
  match: MatchState;
}

interface CompanionTombstone {
  type: 'tombstone';
  matchId: string;
  deletedAt: string;
}

const pendingTombstonesKey = 'fennec-companion-pending-tombstones';

export class HybridStatsFeed implements StatsFeedAdapter {
  private companion?: WebSocket;
  private direct?: WebSocketStatsFeed;
  private retryTimer?: number;
  private stopped = true;
  private handlers?: StatsFeedHandlers;

  constructor(private readonly directEndpoint: string) {}

  start(handlers: StatsFeedHandlers): void {
    this.stop();
    this.stopped = false;
    this.handlers = handlers;
    this.connectCompanion();
  }

  private startDirect(): void {
    if (this.stopped || this.direct) return;
    this.direct = new WebSocketStatsFeed(this.directEndpoint);
    this.direct.start(this.handlers!);
  }

  private connectCompanion(): void {
    if (this.stopped) return;
    const token = companionPairingToken();
    if (!token) {
      this.startDirect();
      return;
    }
    const cursor = companionCursor();
    const socket = new WebSocket(
      `ws://127.0.0.1:49125/ws?token=${encodeURIComponent(token)}&cursor=${encodeURIComponent(cursor)}`,
    );
    this.companion = socket;
    const fallback = window.setTimeout(() => {
      if (socket.readyState !== WebSocket.OPEN) this.startDirect();
    }, 1_500);
    socket.addEventListener('open', () => {
      window.clearTimeout(fallback);
      this.direct?.stop();
      this.direct = undefined;
      this.handlers?.onState('waiting');
      this.flushPendingTombstones();
      void this.uploadLocalHistory();
    });
    socket.addEventListener('message', (event) => {
      void this.handleCompanionMessage(String(event.data));
    });
    socket.addEventListener('close', () => {
      window.clearTimeout(fallback);
      if (this.companion === socket) this.companion = undefined;
      if (this.stopped) return;
      this.startDirect();
      this.retryTimer = window.setTimeout(() => this.connectCompanion(), 5_000);
    });
    socket.addEventListener('error', () => socket.close());
  }

  /** Routes replayed frames, replicated checkpoints, and tombstones without allowing malformed companion data to stop failover. */
  private async handleCompanionMessage(text: string): Promise<void> {
    try {
      const message = JSON.parse(text) as
        CompanionFrame | CompanionCheckpoint | CompanionTombstone;
      if (message.type === 'checkpoint') {
        await this.handlers?.onCheckpoint?.(message.match);
        return;
      }
      if (message.type === 'tombstone') {
        await this.handlers?.onTombstone?.(message.matchId, message.deletedAt);
        return;
      }
      await this.handlers?.onEnvelope(parseEnvelope(message.payload));
      saveCompanionCursor(message.id);
    } catch (error) {
      this.handlers?.onDiagnostic?.(
        `Could not process companion data: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async uploadLocalHistory(): Promise<void> {
    for await (const match of historyRepository.iterateMatches())
      this.checkpoint(match);
  }

  checkpoint(match: MatchState): void {
    if (this.companion?.readyState !== WebSocket.OPEN) return;
    const revision =
      (match.capture?.updateStatePackets ?? 0) + match.events.length + 1;
    this.companion.send(
      JSON.stringify({
        type: 'checkpoint',
        match_id: match.id,
        revision,
        payload: match,
      }),
    );
  }

  tombstone(matchId: string): void {
    const tombstone = { matchId, deletedAt: new Date().toISOString() };
    if (this.companion?.readyState === WebSocket.OPEN) {
      this.sendTombstone(tombstone);
    } else {
      this.savePendingTombstones([
        ...this.pendingTombstones().filter((item) => item.matchId !== matchId),
        tombstone,
      ]);
    }
  }

  private sendTombstone(tombstone: {
    matchId: string;
    deletedAt: string;
  }): void {
    this.companion?.send(
      JSON.stringify({
        type: 'tombstone',
        match_id: tombstone.matchId,
        deleted_at: tombstone.deletedAt,
      }),
    );
  }

  private pendingTombstones(): Array<{ matchId: string; deletedAt: string }> {
    try {
      if (typeof window.localStorage?.getItem !== 'function') return [];
      const value = JSON.parse(
        window.localStorage.getItem(pendingTombstonesKey) ?? '[]',
      );
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  }

  private savePendingTombstones(
    tombstones: Array<{ matchId: string; deletedAt: string }>,
  ): void {
    try {
      if (typeof window.localStorage?.setItem === 'function')
        window.localStorage.setItem(
          pendingTombstonesKey,
          JSON.stringify(tombstones),
        );
    } catch {
      // An unavailable outbox must not interrupt direct browser capture.
    }
  }

  private flushPendingTombstones(): void {
    const pending = this.pendingTombstones();
    for (const tombstone of pending) this.sendTombstone(tombstone);
    if (pending.length) this.savePendingTombstones([]);
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.direct?.stop();
    this.direct = undefined;
    this.companion?.close();
    this.companion = undefined;
  }
}
