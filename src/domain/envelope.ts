import type { StatsEnvelope } from './types';

export function parseEnvelope(input: string): StatsEnvelope {
  const parsed: unknown = JSON.parse(input);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Stats API message must be an object.');
  const record = parsed as Record<string, unknown>;
  const event = record.Event;
  const data = record.Data;
  if (typeof event !== 'string' || event.length === 0) throw new Error('Stats API message requires a string Event.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Stats API message requires an object Data.');
  return { event, data: data as Record<string, unknown> };
}
