import { parseEnvelope } from '../domain/envelope';
import type { StatsFeedAdapter, StatsFeedHandlers } from './StatsFeedAdapter';

export class WebSocketStatsFeed implements StatsFeedAdapter {
  private socket?: WebSocket;
  private stopped = true;
  private retryTimer?: number;
  private retryMs = 1000;

  constructor(private readonly endpoint: string) {}

  start(handlers: StatsFeedHandlers): void {
    this.stop();
    this.stopped = false;
    const connect = () => {
      if (this.stopped) return;
      handlers.onState('connecting');
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.retryMs = 1000;
        handlers.onState('waiting');
      });
      socket.addEventListener('message', async (event) => {
        try {
          const text = typeof event.data === 'string' ? event.data : await (event.data as Blob).text();
          await handlers.onEnvelope(parseEnvelope(text));
          handlers.onState('live');
        } catch (error) {
          handlers.onDiagnostic?.(`Ignored malformed Stats API message: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
      socket.addEventListener('close', () => {
        if (this.stopped) return;
        handlers.onState('unavailable');
        this.retryTimer = window.setTimeout(connect, this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 15_000);
      });
      socket.addEventListener('error', () => socket.close());
    };
    connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = undefined;
  }
}
