import type { FennecSettings, MatchState, TimelineEvent } from './types';

export const curatedEvents = ['GoalScored', 'CrossbarHit', 'PlayerJoined', 'PlayerLeft', 'CountdownBegin', 'RoundStarted', 'MatchEnded', 'StatfeedEvent'];

export function flattenPayload(value: unknown, prefix = '', output: Record<string, string> = {}): Record<string, string> {
  if (Array.isArray(value)) {
    if (prefix) output[prefix] = JSON.stringify(value);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) flattenPayload(child, prefix ? `${prefix}.${key}` : key, output);
  } else if (prefix) {
    output[prefix] = value == null ? '—' : String(value);
  }
  return output;
}

export function timelineCatalog(matches: MatchState[]): Record<string, string[]> {
  const result: Record<string, Set<string>> = {};
  for (const event of matches.flatMap((match) => match.events)) {
    result[event.eventName] ??= new Set();
    for (const key of Object.keys(flattenPayload(event.payload))) result[event.eventName]!.add(key);
  }
  return Object.fromEntries(Object.entries(result).sort().map(([event, attributes]) => [event, [...attributes].sort()]));
}

export function visibleEvents(match: MatchState, settings: FennecSettings): TimelineEvent[] {
  return match.events.filter((event) => {
    if (settings.timelinePreset === 'everything') return true;
    if (settings.timelinePreset === 'curated') return curatedEvents.includes(event.eventName);
    return settings.enabledTimelineEvents.includes(event.eventName);
  }).sort((a, b) => b.sequence - a.sequence);
}

export function eventDetails(event: TimelineEvent, settings: FennecSettings): string {
  const flattened = flattenPayload(event.payload);
  let keys: string[];
  if (settings.timelinePreset === 'custom') keys = settings.timelineAttributes[event.eventName] ?? [];
  else if (settings.timelinePreset === 'curated') {
    const curated: Record<string, string[]> = {
      GoalScored: ['Scorer.Name', 'Assister.Name', 'GoalSpeed'],
      CrossbarHit: ['BallLastTouch.Player.Name', 'BallSpeed', 'ImpactForce'],
      StatfeedEvent: ['Type', 'MainTarget.Name', 'SecondaryTarget.Name'],
      PlayerJoined: ['PlayerName'],
      PlayerLeft: ['PlayerName'],
    };
    keys = curated[event.eventName] ?? [];
  } else keys = Object.keys(flattened);
  return keys.filter((key) => flattened[key] !== undefined).map((key) => `${key.split('.').at(-1)}: ${flattened[key]}`).join(' · ');
}

export function formatClock(seconds?: number): string {
  if (seconds === undefined) return '—';
  return `${Math.floor(seconds / 60)}:${String(Math.max(0, seconds % 60)).padStart(2, '0')}`;
}
