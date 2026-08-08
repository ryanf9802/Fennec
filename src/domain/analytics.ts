import type { MatchState, ParticipantState, TimelineEvent } from './types';

export type SpatialEventKind = 'touch' | 'goal' | 'crossbar';

export interface SpatialActor {
  key: string;
  name: string;
  teamNumber: number;
  shortcut?: number;
  primaryId?: string;
}

export interface SpatialEventPoint {
  id: string;
  kind: SpatialEventKind;
  x: number;
  y: number;
  z: number;
  matchClockSeconds?: number;
  actors: SpatialActor[];
  preHitSpeed?: number;
  postHitSpeed?: number;
  speed?: number;
}

export interface PlayerTouchAnalytics {
  touches: number;
  teamTouches: number;
  touchShare?: number;
  averagePostHitSpeed?: number;
  maximumPostHitSpeed?: number;
  averageSpeedChange?: number;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function vector(value: unknown): { x: number; y: number; z: number } | undefined {
  const item = record(value);
  if (!item) return undefined;
  const x = finite(item.X); const y = finite(item.Y); const z = finite(item.Z);
  return x === undefined || y === undefined || z === undefined ? undefined : { x, y, z };
}

function participantFor(match: MatchState, value: Record<string, unknown>): ParticipantState | undefined {
  const shortcut = finite(value.Shortcut);
  if (shortcut !== undefined) {
    const found = match.participants.find((player) => player.shortcut === shortcut);
    if (found) return found;
  }
  const name = typeof value.Name === 'string' ? value.Name : undefined;
  const teamNumber = finite(value.TeamNum);
  return match.participants.find((player) => player.name === name && (teamNumber === undefined || player.teamNumber === teamNumber));
}

function actor(match: MatchState, value: unknown): SpatialActor | undefined {
  const item = record(value);
  if (!item || typeof item.Name !== 'string') return undefined;
  const participant = participantFor(match, item);
  const shortcut = finite(item.Shortcut);
  const teamNumber = finite(item.TeamNum) ?? participant?.teamNumber ?? 0;
  const primaryId = participant?.primaryId;
  return {
    key: primaryId ? `id:${primaryId}` : shortcut !== undefined ? `shortcut:${shortcut}` : `name:${teamNumber}:${item.Name}`,
    name: item.Name,
    teamNumber,
    shortcut,
    primaryId,
  };
}

function eventPoint(match: MatchState, event: TimelineEvent): SpatialEventPoint | undefined {
  if (event.eventName === 'BallHit') {
    const ball = record(event.payload.Ball);
    const location = vector(ball?.Location);
    if (!ball || !location) return undefined;
    const players = Array.isArray(event.payload.Players) ? event.payload.Players : [];
    return {
      id: event.id, kind: 'touch', ...location, matchClockSeconds: event.matchClockSeconds,
      actors: players.map((value) => actor(match, value)).filter((value): value is SpatialActor => !!value),
      preHitSpeed: finite(ball.PreHitSpeed), postHitSpeed: finite(ball.PostHitSpeed),
    };
  }
  if (event.eventName === 'GoalScored') {
    const location = vector(event.payload.ImpactLocation);
    if (!location) return undefined;
    const scorer = actor(match, event.payload.Scorer);
    return { id: event.id, kind: 'goal', ...location, matchClockSeconds: event.matchClockSeconds, actors: scorer ? [scorer] : [], speed: finite(event.payload.GoalSpeed) };
  }
  if (event.eventName === 'CrossbarHit') {
    const location = vector(event.payload.BallLocation);
    if (!location) return undefined;
    const lastTouch = record(event.payload.BallLastTouch);
    const player = actor(match, lastTouch?.Player);
    return { id: event.id, kind: 'crossbar', ...location, matchClockSeconds: event.matchClockSeconds, actors: player ? [player] : [], speed: finite(event.payload.BallSpeed) };
  }
  return undefined;
}

export function spatialEventPoints(match: MatchState): SpatialEventPoint[] {
  return match.events.map((event) => eventPoint(match, event)).filter((value): value is SpatialEventPoint => !!value);
}

export function playerTouchAnalytics(match: MatchState, primaryId?: string): PlayerTouchAnalytics {
  const player = match.participants.find((value) => value.primaryId === primaryId);
  const touches = spatialEventPoints(match).filter((point) => point.kind === 'touch');
  const selected = primaryId ? touches.filter((point) => point.actors.some((value) => value.primaryId === primaryId)) : [];
  const teamTouches = player ? touches.filter((point) => point.actors.some((value) => value.teamNumber === player.teamNumber)).length : 0;
  const postSpeeds = selected.map((point) => point.postHitSpeed).filter((value): value is number => value !== undefined);
  const changes = selected.map((point) => point.preHitSpeed !== undefined && point.postHitSpeed !== undefined ? point.postHitSpeed - point.preHitSpeed : undefined).filter((value): value is number => value !== undefined);
  return {
    touches: selected.length,
    teamTouches,
    touchShare: teamTouches ? selected.length / teamTouches : undefined,
    averagePostHitSpeed: postSpeeds.length ? postSpeeds.reduce((sum, value) => sum + value, 0) / postSpeeds.length : undefined,
    maximumPostHitSpeed: postSpeeds.length ? Math.max(...postSpeeds) : undefined,
    averageSpeedChange: changes.length ? changes.reduce((sum, value) => sum + value, 0) / changes.length : undefined,
  };
}

export function observedBallSpeed(match: MatchState): { average?: number; maximum?: number } {
  const aggregate = match.capture?.ballSpeed;
  return aggregate?.samples ? { average: aggregate.sum / aggregate.samples, maximum: aggregate.max } : {};
}
