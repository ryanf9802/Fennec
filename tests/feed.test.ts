import { WebSocketStatsFeed } from '../src/feed/WebSocketStatsFeed';

type Listener = (event: any) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }
  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }
  emit(name: string, event: any = {}) {
    for (const listener of this.listeners.get(name) ?? []) listener(event);
  }
  close() {
    this.emit('close');
  }
}

describe('browser Stats API feed', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.stubGlobal('WebSocket', FakeWebSocket);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reports connection states and ignores malformed packets', async () => {
    const states: string[] = [];
    const events: string[] = [];
    const diagnostics: string[] = [];
    const telemetry: Array<{
      event: string;
      details?: Record<string, unknown>;
    }> = [];
    const feed = new WebSocketStatsFeed(
      'ws://127.0.0.1:49124',
      (event, details) => {
        telemetry.push({ event, details });
      },
    );
    feed.start({
      onState: (state) => {
        states.push(state);
      },
      onEnvelope: (envelope) => {
        events.push(envelope.event);
      },
      onDiagnostic: (message) => {
        diagnostics.push(message);
      },
    });
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toBe('ws://127.0.0.1:49124');
    socket.emit('open');
    socket.emit('message', { data: '{"Event":"MatchCreated","Data":null}' });
    socket.emit('message', { data: '{"Event":"GoalScored","Data":{}}' });
    await Promise.resolve();
    expect(states).toEqual(['connecting', 'waiting']);
    expect(events).toEqual(['GoalScored']);
    expect(diagnostics[0]).toMatch(/malformed/);
    expect(telemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'connected' }),
        expect.objectContaining({
          event: 'frame_rejected',
          details: expect.objectContaining({
            error: 'Stats API message requires an object Data.',
            preview: '{"Event":"MatchCreated","Data":null}',
          }),
        }),
        expect.objectContaining({
          event: 'frame_received',
          details: expect.objectContaining({
            statsEvent: 'GoalScored',
            dataKeys: [],
          }),
        }),
        expect.objectContaining({
          event: 'feed_live',
          details: expect.objectContaining({
            firstEvent: 'GoalScored',
            frame: 2,
          }),
        }),
      ]),
    );
    feed.stop();
  });

  it('distinguishes valid packets that fail during application processing', async () => {
    const diagnostics: string[] = [];
    const telemetry: Array<{
      event: string;
      details?: Record<string, unknown>;
    }> = [];
    const feed = new WebSocketStatsFeed(
      'ws://127.0.0.1:49124',
      (event, details) => {
        telemetry.push({ event, details });
      },
    );
    feed.start({
      onState: () => undefined,
      onEnvelope: () => {
        throw new Error('storage unavailable');
      },
      onDiagnostic: (message) => {
        diagnostics.push(message);
      },
    });

    FakeWebSocket.instances[0]!.emit('message', {
      data: '{"Event":"UpdateState","Data":{"Game":{}}}',
    });
    await Promise.resolve();

    expect(diagnostics).toEqual([
      'Failed to process Stats API event UpdateState: storage unavailable',
    ]);
    expect(telemetry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event: 'frame_processing_failed',
          details: expect.objectContaining({
            statsEvent: 'UpdateState',
            error: 'storage unavailable',
          }),
        }),
      ]),
    );
    feed.stop();
  });
});
