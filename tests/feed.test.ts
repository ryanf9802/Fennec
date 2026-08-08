import { WebSocketStatsFeed } from '../src/feed/WebSocketStatsFeed';

type Listener = (event: any) => void;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  private listeners = new Map<string, Listener[]>();
  constructor(readonly url: string) { FakeWebSocket.instances.push(this); }
  addEventListener(name: string, listener: Listener) { this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]); }
  emit(name: string, event: any = {}) { for (const listener of this.listeners.get(name) ?? []) listener(event); }
  close() { this.emit('close'); }
}

describe('browser Stats API feed', () => {
  beforeEach(() => { FakeWebSocket.instances = []; vi.stubGlobal('WebSocket', FakeWebSocket); });
  afterEach(() => vi.unstubAllGlobals());

  it('reports connection states and ignores malformed packets', async () => {
    const states: string[] = [];
    const events: string[] = [];
    const diagnostics: string[] = [];
    const feed = new WebSocketStatsFeed('ws://127.0.0.1:49124');
    feed.start({
      onState: (state) => { states.push(state); },
      onEnvelope: (envelope) => { events.push(envelope.event); },
      onDiagnostic: (message) => { diagnostics.push(message); },
    });
    const socket = FakeWebSocket.instances[0]!;
    expect(socket.url).toBe('ws://127.0.0.1:49124');
    socket.emit('open');
    socket.emit('message', { data: '{}' });
    socket.emit('message', { data: '{"Event":"GoalScored","Data":{}}' });
    await Promise.resolve();
    expect(states).toEqual(['connecting', 'waiting', 'live']);
    expect(events).toEqual(['GoalScored']);
    expect(diagnostics[0]).toMatch(/malformed/);
    feed.stop();
  });
});
