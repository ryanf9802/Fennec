import type { FennecSettings, MatchState, TimelineEvent } from './types';

export const curatedEvents = ['GoalScored', 'CrossbarHit', 'PlayerJoined', 'PlayerLeft', 'MatchPaused', 'MatchUnpaused', 'GoalReplayStart', 'GoalReplayEnd', 'MatchEnded', 'StatfeedEvent'];

export interface TimelineMessagePart {
  text: string;
  player?: { name: string; teamNumber?: number };
}

export interface TimelineDisplayItem {
  id: string;
  sequence: number;
  clockSeconds?: number;
  parts: TimelineMessagePart[];
  details?: string;
  technicalDetails?: string;
}

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

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function playerFrom(value: unknown, match: MatchState): TimelineMessagePart['player'] | undefined {
  const valueRecord = record(value);
  const name = string(valueRecord?.Name) ?? string(valueRecord?.PlayerName);
  if (!name) return undefined;
  const explicitTeam = number(valueRecord?.TeamNum);
  const participant = match.participants.find((item) => item.name === name);
  return { name, teamNumber: explicitTeam === undefined ? participant?.teamNumber : Math.trunc(explicitTeam) };
}

function playerName(value: unknown): string | undefined {
  const valueRecord = record(value);
  return string(valueRecord?.Name) ?? string(valueRecord?.PlayerName);
}

function playerPart(player: TimelineMessagePart['player'] | undefined): TimelineMessagePart {
  return player ? { text: player.name, player } : { text: 'Unknown player' };
}

function words(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function nearby(first: TimelineEvent, second: TimelineEvent): boolean {
  return first.matchClockSeconds === second.matchClockSeconds && Math.abs(first.sequence - second.sequence) <= 4;
}

function validGoal(event: TimelineEvent): boolean {
  if (!playerName(event.payload.Scorer)) return false;
  return !(number(event.payload.GoalSpeed) === 0 && number(event.payload.GoalTime) === 0);
}

function relatedGoalEvent(event: TimelineEvent, events: TimelineEvent[]): TimelineEvent | undefined {
  const targetName = playerName(event.payload.MainTarget);
  const type = string(event.payload.Type);
  return events.find((candidate) => {
    if (candidate.eventName !== 'GoalScored' || !validGoal(candidate) || !nearby(event, candidate)) return false;
    const name = type === 'Assist'
      ? playerName(candidate.payload.Assister)
      : playerName(candidate.payload.Scorer);
    return !!targetName && name === targetName;
  });
}

function semanticParts(event: TimelineEvent, match: MatchState, allEvents: TimelineEvent[]): TimelineMessagePart[] | undefined {
  if (event.eventName === 'GoalScored') {
    if (!validGoal(event)) return undefined;
    const scorer = playerFrom(event.payload.Scorer, match);
    const assister = playerFrom(event.payload.Assister, match);
    return [playerPart(scorer), { text: ' scored' }, ...(assister ? [{ text: ' — assisted by ' }, playerPart(assister)] : [])];
  }
  if (event.eventName === 'StatfeedEvent') {
    const type = string(event.payload.Type) ?? string(event.payload.EventName) ?? 'Statfeed event';
    if ((type === 'Goal' || type === 'Assist') && relatedGoalEvent(event, allEvents)) return undefined;
    const main = playerFrom(event.payload.MainTarget, match);
    const secondary = playerFrom(event.payload.SecondaryTarget, match);
    if (type === 'Shot on Goal') return [playerPart(main), { text: ' shot on goal' }];
    if (type === 'Save') return [playerPart(main), { text: ' made a save' }];
    if (type === 'Epic Save') return [playerPart(main), { text: ' made an epic save' }];
    if (type === 'Goal') return [playerPart(main), { text: ' scored' }];
    if (type === 'Assist') return [playerPart(main), { text: ' assisted a goal' }];
    if (type === 'Demolition' || type === 'Demolish') return [playerPart(main), { text: ' demolished ' }, playerPart(secondary)];
    return main ? [playerPart(main), { text: ` — ${type}` }] : [{ text: type }];
  }
  if (event.eventName === 'CrossbarHit') {
    const lastTouch = record(event.payload.BallLastTouch);
    return [playerPart(playerFrom(record(lastTouch?.Player), match)), { text: ' hit the crossbar' }];
  }
  if (event.eventName === 'PlayerJoined' || event.eventName === 'PlayerLeft') {
    const player = playerFrom(event.payload.Player ?? event.payload, match);
    return [playerPart(player), { text: event.eventName === 'PlayerJoined' ? ' joined' : ' left' }];
  }
  if (event.eventName === 'MatchEnded') {
    const winnerNumber = number(event.payload.WinnerTeamNum);
    const winner = match.teams.find((team) => team.teamNumber === winnerNumber);
    return [{ text: winner ? `${winner.name || `Team ${winner.teamNumber + 1}`} won the match` : 'Match ended' }];
  }
  return [{ text: words(event.eventName) }];
}

export function timelineDisplayItems(match: MatchState, settings: FennecSettings): TimelineDisplayItem[] {
  const events = visibleEvents(match, settings);
  return events.flatMap((event) => {
    const parts = semanticParts(event, match, events)
      ?? (settings.timelinePreset === 'curated' ? undefined : [{ text: words(event.eventName) }]);
    if (!parts) return [];
    const details = settings.timelinePreset === 'curated' ? undefined : eventDetails(event, settings) || undefined;
    return [{
      id: event.id,
      sequence: event.sequence,
      clockSeconds: event.matchClockSeconds,
      parts,
      details,
      technicalDetails: settings.timelinePreset === 'everything' ? JSON.stringify(event.payload, null, 2) : undefined,
    }];
  });
}
