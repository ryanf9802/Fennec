import type { MatchState } from '../src/domain/types';
import type { CompanionSyncStatus } from '../src/feed/StatsFeedAdapter';

const localMatch: MatchState = {
  id: 'browser-only',
  lifecycle: 'completed',
  startedAt: '2026-08-10T00:00:00Z',
  lastEventAt: '2026-08-10T00:05:00Z',
  endedAt: '2026-08-10T00:05:00Z',
  playlistId: 13,
  playlistName: 'Ranked Doubles',
  playlistCategory: 'ranked',
  arena: 'DFH Stadium',
  timeSeconds: 0,
  isOvertime: false,
  isReplay: false,
  teams: [],
  participants: [],
  events: [],
};

vi.mock('../src/data/database', () => ({
  historyRepository: {
    async *iterateMatches() {
      yield localMatch;
    },
  },
  loadSettings: vi.fn(async () => ({
    webSocketPort: 49124,
    sessionGapMinutes: 30,
    autoOpenLiveMatch: false,
    theme: 'dark',
    speedUnit: 'kmh',
    timelinePreset: 'curated',
    enabledTimelineEvents: [],
    timelineAttributes: {},
    sidebarCollapsed: false,
    matchAnalyticsView: 'analytics',
    analytics: { playlistMode: 'ranked', groupByPlaylist: true },
  })),
  loadProfile: vi.fn(async () => undefined),
}));

vi.mock('../src/feed/WebSocketStatsFeed', () => ({
  WebSocketStatsFeed: class {
    start() {}
    stop() {}
  },
}));

type Listener = (event: { data?: string }) => void;

class FakeWebSocket {
  static OPEN = 1;
  static instances: FakeWebSocket[] = [];
  readyState = FakeWebSocket.OPEN;
  sent: string[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  emit(name: string, value: unknown = {}) {
    const event =
      name === 'message' ? { data: JSON.stringify(value) } : (value as object);
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }

  send(value: string) {
    this.sent.push(value);
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

import { HybridStatsFeed } from '../src/feed/HybridStatsFeed';

describe('companion durable synchronization', () => {
  const browserValues = new Map<string, string>();

  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
    browserValues.clear();
    browserValues.set('fennec-companion-token', 'paired');
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => browserValues.get(key) ?? null,
        setItem: (key: string, value: string) => browserValues.set(key, value),
        removeItem: (key: string) => browserValues.delete(key),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('restores canonical state before uploading browser-only history', async () => {
    const checkpoints: string[] = [];
    const statuses: CompanionSyncStatus[] = [];
    const preferences: string[] = [];
    const feed = new HybridStatsFeed('ws://127.0.0.1:49124');
    feed.start({
      onState: vi.fn(),
      onEnvelope: vi.fn(),
      onCheckpoint: async (match) => {
        checkpoints.push(match.id);
      },
      onPreferences: async (_settings, profile) => {
        preferences.push(profile?.displayName ?? 'none');
      },
      onSyncStatus: (status) => statuses.push(status),
    });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toContain('data_sync=1');
    socket.emit('open');
    socket.emit('message', {
      type: 'sync_start',
      totalMatches: 1,
      settings: { theme: 'dark' },
      profile: { primaryId: 'Steam|1|0', displayName: 'Canonical' },
      status: { pendingFrames: 0 },
    });
    socket.emit('message', {
      type: 'checkpoint',
      match: { ...localMatch, id: 'canonical' },
      completed: 1,
      total: 1,
    });
    socket.emit('message', { type: 'sync_complete' });

    await vi.waitFor(() =>
      expect(
        socket.sent
          .map((value) => JSON.parse(value))
          .find(
            (value) =>
              value.type === 'checkpoint' && value.match_id === 'browser-only',
          ),
      ).toBeTruthy(),
    );
    expect(preferences).toEqual(['Canonical']);
    expect(checkpoints).toEqual(['canonical']);
    expect(statuses.at(-1)?.mode).toBe('synchronized');
    feed.stop();
  });

  it('acknowledges a frame only after its resulting checkpoint is sent', async () => {
    const feed = new HybridStatsFeed('ws://127.0.0.1:49124');
    feed.start({
      onState: vi.fn(),
      onEnvelope: async () => {
        feed.checkpoint({ ...localMatch, id: 'captured' });
      },
    });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    socket.emit('open');
    socket.emit('message', {
      type: 'sync_start',
      totalMatches: 0,
      status: { pendingFrames: 1 },
    });
    socket.emit('message', { type: 'sync_complete' });
    socket.emit('message', {
      type: 'frame',
      id: 42,
      payload: JSON.stringify({
        Event: 'UpdateState',
        Data: { MatchGuid: 'match-42', Game: { PlaylistId: 13 } },
      }),
    });

    await vi.waitFor(() =>
      expect(
        socket.sent
          .map((value) => JSON.parse(value))
          .find(
            (value) =>
              value.type === 'checkpoint' && value.through_frame_id === 42,
          ),
      ).toBeTruthy(),
    );
    expect(
      socket.sent
        .map((value) => JSON.parse(value))
        .filter((value) => value.type === 'acknowledge_frame'),
    ).toEqual([]);
    feed.stop();
  });

  it('does not resurrect an older browser cache after a canonical reset', async () => {
    browserValues.set(
      'fennec-companion-sync-metadata',
      JSON.stringify({ instanceId: 'companion-a', datasetGeneration: 4 }),
    );
    browserValues.set(
      'fennec-companion-pending-tombstones',
      JSON.stringify([
        { matchId: 'canonical', deletedAt: '2026-08-10T00:06:00Z' },
      ]),
    );
    const reset = vi.fn(async () => undefined);
    const feed = new HybridStatsFeed('ws://127.0.0.1:49124');
    feed.start({
      onState: vi.fn(),
      onEnvelope: vi.fn(),
      onCanonicalReset: reset,
    });
    await vi.waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
    const socket = FakeWebSocket.instances[0]!;
    socket.emit('open');
    socket.emit('message', {
      type: 'sync_start',
      totalMatches: 1,
      status: {
        instanceId: 'companion-a',
        datasetGeneration: 5,
        pendingFrames: 0,
      },
    });
    socket.emit('message', { type: 'sync_complete' });

    await vi.waitFor(() =>
      expect(
        JSON.parse(browserValues.get('fennec-companion-sync-metadata') ?? '{}')
          .datasetGeneration,
      ).toBe(5),
    );
    expect(socket.sent).toEqual([]);
    expect(reset).toHaveBeenCalledOnce();
    expect(browserValues.get('fennec-companion-pending-tombstones')).toBe('[]');
    feed.stop();
  });
});
