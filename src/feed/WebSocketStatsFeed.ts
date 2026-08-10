import { parseEnvelope } from '../domain/envelope';
import {
  reportDevFeedTelemetry,
  type FeedTelemetryReporter,
} from './devTelemetry';
import type { StatsFeedAdapter, StatsFeedHandlers } from './StatsFeedAdapter';

const previewLimit = 4_000;

function preview(text: string): string {
  return text.length <= previewLimit
    ? text
    : `${text.slice(0, previewLimit)}...[${text.length - previewLimit} more characters]`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class WebSocketStatsFeed implements StatsFeedAdapter {
  private socket?: WebSocket;
  private stopped = true;
  private retryTimer?: number;
  private retryMs = 1000;
  private connectionSequence = 0;

  constructor(
    private readonly endpoint: string,
    private readonly telemetry: FeedTelemetryReporter = reportDevFeedTelemetry,
  ) {}

  start(handlers: StatsFeedHandlers): void {
    this.stop();
    this.stopped = false;
    const connect = () => {
      if (this.stopped) return;
      const connection = ++this.connectionSequence;
      let frames = 0;
      let lastFrameAt: string | undefined;
      let feedLive = false;
      handlers.onState('connecting');
      this.telemetry('connecting', {
        connection,
        endpoint: this.endpoint,
        retryMs: this.retryMs,
      });
      const socket = new WebSocket(this.endpoint);
      this.socket = socket;
      socket.addEventListener('open', () => {
        this.retryMs = 1000;
        handlers.onStatsApiVerified?.();
        handlers.onState('waiting');
        this.telemetry('connected', { connection, endpoint: this.endpoint });
      });
      socket.addEventListener('message', async (event) => {
        let text: string;
        try {
          text =
            typeof event.data === 'string'
              ? event.data
              : await (event.data as Blob).text();
        } catch (error) {
          const message = errorMessage(error);
          handlers.onDiagnostic?.(
            `Could not read Stats API message: ${message}`,
          );
          this.telemetry('frame_read_failed', { connection, error: message });
          return;
        }

        frames += 1;
        lastFrameAt = new Date().toISOString();
        let envelope;
        try {
          envelope = parseEnvelope(text);
        } catch (error) {
          const message = errorMessage(error);
          handlers.onDiagnostic?.(
            `Ignored malformed Stats API message: ${message}`,
          );
          this.telemetry('frame_rejected', {
            connection,
            frame: frames,
            bytes: text.length,
            error: message,
            preview: preview(text),
          });
          return;
        }

        const shouldSample =
          frames <= 3 || frames % 150 === 0 || envelope.event !== 'UpdateState';
        if (shouldSample) {
          this.telemetry('frame_received', {
            connection,
            frame: frames,
            bytes: text.length,
            transport:
              typeof event.data === 'string'
                ? 'text'
                : (event.data?.constructor?.name ?? typeof event.data),
            statsEvent: envelope.event,
            dataKeys: Object.keys(envelope.data),
            preview:
              frames <= 3 || envelope.event !== 'UpdateState'
                ? preview(text)
                : undefined,
          });
        }

        try {
          await handlers.onEnvelope(envelope);
          if (!feedLive) {
            feedLive = true;
            this.telemetry('feed_live', {
              connection,
              firstEvent: envelope.event,
              frame: frames,
            });
          }
        } catch (error) {
          const message = errorMessage(error);
          handlers.onDiagnostic?.(
            `Failed to process Stats API event ${envelope.event}: ${message}`,
          );
          this.telemetry('frame_processing_failed', {
            connection,
            frame: frames,
            statsEvent: envelope.event,
            error: message,
            preview: preview(text),
          });
        }
      });
      socket.addEventListener('close', (event) => {
        this.telemetry('disconnected', {
          connection,
          frames,
          lastFrameAt,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          stopped: this.stopped,
        });
        if (this.stopped) return;
        handlers.onState('unavailable');
        this.retryTimer = window.setTimeout(connect, this.retryMs);
        this.retryMs = Math.min(this.retryMs * 2, 15_000);
      });
      socket.addEventListener('error', () => {
        this.telemetry('socket_error', { connection, frames, lastFrameAt });
        socket.close();
      });
    };
    connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) window.clearTimeout(this.retryTimer);
    this.telemetry('stopped', {
      endpoint: this.endpoint,
      connection: this.connectionSequence,
    });
    this.socket?.close();
    this.socket = undefined;
  }
}
