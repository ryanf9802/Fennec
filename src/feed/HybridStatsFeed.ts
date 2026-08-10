import {
  companionCursor,
  companionPairingToken,
  saveCompanionCursor,
} from '../companion/client';
import { historyRepository, loadProfile, loadSettings } from '../data/database';
import { parseEnvelope } from '../domain/envelope';
import type {
  FennecProfile,
  FennecSettings,
  MatchState,
} from '../domain/types';
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
  completed?: number;
  total?: number;
}

interface CompanionTombstone {
  type: 'tombstone';
  matchId: string;
  deletedAt: string;
}

interface CompanionSyncStart {
  type: 'sync_start';
  totalMatches: number;
  settings?: FennecSettings;
  profile?: FennecProfile;
  status?: {
    instanceId?: string;
    datasetGeneration?: number;
    pendingFrames?: number;
    lastSyncedAt?: string;
  };
}

interface CompanionSyncComplete {
  type: 'sync_complete';
}

interface CompanionPreferences {
  type: 'preferences';
  settings: FennecSettings;
  profile?: FennecProfile;
}

interface CompanionResync {
  type: 'resync';
}

const pendingTombstonesKey = 'fennec-companion-pending-tombstones';
const pendingPreferencesKey = 'fennec-companion-pending-preferences';
const syncMetadataKey = 'fennec-companion-sync-metadata';

interface SyncMetadata {
  instanceId: string;
  datasetGeneration: number;
}

export class HybridStatsFeed implements StatsFeedAdapter {
  private companion?: WebSocket;
  private direct?: WebSocketStatsFeed;
  private retryTimer?: number;
  private stopped = true;
  private handlers?: StatsFeedHandlers;
  private messageQueue = Promise.resolve();
  private currentFrameId?: number;
  private checkpointedFrameId?: number;
  private syncStart?: CompanionSyncStart;
  private localHistory: MatchState[] = [];
  private uploadLocalState = true;
  private datasetGeneration?: number;
  private remainingFrames = 0;

  constructor(private readonly directEndpoint: string) {}

  start(handlers: StatsFeedHandlers): void {
    this.stop();
    this.stopped = false;
    this.handlers = handlers;
    this.handlers.onSyncStatus?.({ mode: 'connecting' });
    if (!companionPairingToken()) {
      this.handlers.onSyncStatus?.({ mode: 'browser-only' });
      this.startDirect();
      return;
    }
    void this.captureLocalHistory()
      .catch((error) =>
        this.handlers?.onDiagnostic?.(
          `Could not read the browser cache before synchronization: ${error instanceof Error ? error.message : String(error)}`,
        ),
      )
      .finally(() => this.connectCompanion());
  }

  private async captureLocalHistory(): Promise<void> {
    this.localHistory = [];
    for await (const match of historyRepository.iterateMatches())
      this.localHistory.push(match);
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
      this.handlers?.onSyncStatus?.({ mode: 'browser-only' });
      this.startDirect();
      return;
    }
    const cursor = companionCursor();
    const socket = new WebSocket(
      `ws://127.0.0.1:49125/ws?token=${encodeURIComponent(token)}&cursor=${encodeURIComponent(cursor)}&data_sync=1`,
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
    });
    socket.addEventListener('message', (event) => {
      this.messageQueue = this.messageQueue.then(() =>
        this.handleCompanionMessage(String(event.data)),
      );
    });
    socket.addEventListener('close', () => {
      window.clearTimeout(fallback);
      if (this.companion === socket) this.companion = undefined;
      if (this.stopped) return;
      this.handlers?.onSyncStatus?.({ mode: 'unavailable' });
      this.startDirect();
      this.retryTimer = window.setTimeout(() => this.connectCompanion(), 5_000);
    });
    socket.addEventListener('error', () => socket.close());
  }

  /** Routes replayed frames, replicated checkpoints, and tombstones without allowing malformed companion data to stop failover. */
  private async handleCompanionMessage(text: string): Promise<void> {
    try {
      const message = JSON.parse(text) as
        | CompanionFrame
        | CompanionCheckpoint
        | CompanionTombstone
        | CompanionSyncStart
        | CompanionSyncComplete
        | CompanionPreferences
        | CompanionResync;
      if (message.type === 'sync_start') {
        const start = message as CompanionSyncStart;
        this.syncStart = {
          ...start,
          settings: start.settings ?? undefined,
          profile: start.profile ?? undefined,
        };
        const current = this.currentSyncMetadata();
        const previous = this.savedSyncMetadata();
        this.datasetGeneration = current?.datasetGeneration;
        this.remainingFrames = this.syncStart.status?.pendingFrames ?? 0;
        this.uploadLocalState =
          !previous ||
          (current !== undefined &&
            previous.instanceId === current.instanceId &&
            previous.datasetGeneration === current.datasetGeneration) ||
          (current !== undefined &&
            previous.instanceId !== current.instanceId &&
            this.syncStart.totalMatches === 0);
        if (!this.uploadLocalState) {
          this.localHistory = [];
          this.savePendingPreferences(undefined);
          this.savePendingTombstones([]);
          await this.handlers?.onCanonicalReset?.();
        }
        const pending = this.pendingPreferences();
        this.handlers?.onSyncStatus?.({
          mode: 'restoring',
          completedMatches: 0,
          totalMatches: this.syncStart.totalMatches,
          pendingFrames: this.syncStart.status?.pendingFrames,
          lastSyncedAt: this.syncStart.status?.lastSyncedAt,
        });
        if (
          !pending &&
          (!this.uploadLocalState ||
            this.syncStart.settings ||
            this.syncStart.profile)
        )
          await this.handlers?.onPreferences?.(
            this.syncStart.settings,
            this.syncStart.profile,
          );
        return;
      }
      if (message.type === 'checkpoint') {
        await this.handlers?.onCheckpoint?.(message.match);
        if (message.completed !== undefined)
          this.handlers?.onSyncStatus?.({
            mode: 'restoring',
            completedMatches: message.completed,
            totalMatches: message.total,
            pendingFrames: this.syncStart?.status?.pendingFrames,
          });
        return;
      }
      if (message.type === 'tombstone') {
        await this.handlers?.onTombstone?.(message.matchId, message.deletedAt);
        return;
      }
      if (message.type === 'preferences') {
        const preferences = message as CompanionPreferences;
        if (!this.pendingPreferences())
          await this.handlers?.onPreferences?.(
            preferences.settings ?? undefined,
            preferences.profile ?? undefined,
          );
        return;
      }
      if (message.type === 'sync_complete') {
        this.handlers?.onSyncStatus?.({
          mode:
            (this.syncStart?.status?.pendingFrames ?? 0) > 0
              ? 'reconciling'
              : 'synchronized',
          completedMatches: this.syncStart?.totalMatches,
          totalMatches: this.syncStart?.totalMatches,
          pendingFrames: this.syncStart?.status?.pendingFrames,
          lastSyncedAt: this.syncStart?.status?.lastSyncedAt,
        });
        if (this.uploadLocalState) {
          this.flushPendingTombstones();
          await this.uploadLocalHistory();
          await this.uploadPreferences();
        }
        const current = this.currentSyncMetadata();
        if (current) this.saveSyncMetadata(current);
        return;
      }
      if (message.type === 'resync') {
        this.companion?.close();
        return;
      }
      const frame = message as CompanionFrame;
      this.currentFrameId = frame.id;
      this.checkpointedFrameId = undefined;
      const envelope = parseEnvelope(frame.payload);
      this.handlers?.onStatsApiVerified?.();
      await this.handlers?.onEnvelope(envelope);
      if (this.checkpointedFrameId !== frame.id)
        this.send({
          type: 'acknowledge_frame',
          frame_id: frame.id,
          dataset_generation: this.datasetGeneration,
        });
      saveCompanionCursor(frame.id);
      this.remainingFrames = Math.max(0, this.remainingFrames - 1);
      this.handlers?.onSyncStatus?.({
        mode: this.remainingFrames > 0 ? 'reconciling' : 'synchronized',
        completedMatches: this.syncStart?.totalMatches,
        totalMatches: this.syncStart?.totalMatches,
        pendingFrames: this.remainingFrames,
        lastSyncedAt: this.syncStart?.status?.lastSyncedAt,
      });
      this.currentFrameId = undefined;
    } catch (error) {
      this.currentFrameId = undefined;
      this.handlers?.onDiagnostic?.(
        `Could not process companion data: ${error instanceof Error ? error.message : String(error)}`,
      );
      this.handlers?.onSyncStatus?.({
        mode: 'error',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async uploadLocalHistory(): Promise<void> {
    const uploaded = new Set<string>();
    for (const match of this.localHistory) {
      this.checkpoint(match);
      uploaded.add(match.id);
    }
    for await (const match of historyRepository.iterateMatches())
      if (!uploaded.has(match.id)) this.checkpoint(match);
    this.localHistory = [];
  }

  checkpoint(match: MatchState): void {
    if (this.companion?.readyState !== WebSocket.OPEN) return;
    const timestamp = Date.parse(match.lastEventAt || match.startedAt);
    const detailRevision =
      (match.capture?.updateStatePackets ?? 0) +
      match.events.length +
      (match.sessionEndedAfterByPrimaryIds?.length ?? 0) +
      (match.sessionEndedAfter ? 1 : 0);
    const revision =
      (Number.isFinite(timestamp) ? timestamp : 0) * 1_000 +
      Math.min(detailRevision, 999);
    this.send({
      type: 'checkpoint',
      match_id: match.id,
      revision,
      payload: match,
      through_frame_id: this.currentFrameId,
      dataset_generation: this.datasetGeneration,
    });
    this.checkpointedFrameId = this.currentFrameId;
  }

  preferences(settings: FennecSettings, profile?: FennecProfile): void {
    const value = { settings, profile };
    if (this.companion?.readyState === WebSocket.OPEN) {
      this.send({
        type: 'preferences',
        ...value,
        dataset_generation: this.datasetGeneration,
      });
      this.savePendingPreferences(undefined);
    } else this.savePendingPreferences(value);
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
    this.send({
      type: 'tombstone',
      match_id: tombstone.matchId,
      deleted_at: tombstone.deletedAt,
      dataset_generation: this.datasetGeneration,
    });
  }

  private send(value: unknown): void {
    if (this.companion?.readyState === WebSocket.OPEN)
      this.companion.send(JSON.stringify(value));
  }

  private pendingPreferences():
    { settings: FennecSettings; profile?: FennecProfile } | undefined {
    try {
      const raw = window.localStorage?.getItem(pendingPreferencesKey);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  private savePendingPreferences(value?: {
    settings: FennecSettings;
    profile?: FennecProfile;
  }): void {
    try {
      if (value)
        window.localStorage?.setItem(
          pendingPreferencesKey,
          JSON.stringify(value),
        );
      else window.localStorage?.removeItem(pendingPreferencesKey);
    } catch {
      // Browser-local persistence remains usable when the outbox is blocked.
    }
  }

  private async uploadPreferences(): Promise<void> {
    const pending = this.pendingPreferences();
    const settings = pending?.settings ?? (await loadSettings());
    const profile = pending?.profile ?? (await loadProfile());
    if (pending || (!this.syncStart?.settings && !this.syncStart?.profile))
      this.send({
        type: 'preferences',
        settings,
        profile,
        dataset_generation: this.datasetGeneration,
      });
    this.savePendingPreferences(undefined);
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

  private currentSyncMetadata(): SyncMetadata | undefined {
    const instanceId = this.syncStart?.status?.instanceId;
    const datasetGeneration = this.syncStart?.status?.datasetGeneration;
    if (!instanceId || datasetGeneration === undefined) return undefined;
    return { instanceId, datasetGeneration };
  }

  private savedSyncMetadata(): SyncMetadata | undefined {
    try {
      const raw = window.localStorage?.getItem(syncMetadataKey);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }

  private saveSyncMetadata(metadata: SyncMetadata): void {
    try {
      window.localStorage?.setItem(syncMetadataKey, JSON.stringify(metadata));
    } catch {
      // A blocked cache marker only affects the next reconciliation decision.
    }
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
