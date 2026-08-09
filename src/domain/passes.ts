import { isTrackablePrimaryId, normalizePlayerName } from './playerIdentity';
import type { MatchState, ParticipantState, TimelineEvent } from './types';

const playStops = new Set([
  'CountdownBegin',
  'GoalScored',
  'GoalReplayStart',
  'MatchEnded',
  'MatchDestroyed',
  'MatchPaused',
]);
const playStarts = new Set(['RoundStarted', 'MatchUnpaused']);

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function participantIndex(
  participants: ParticipantState[],
  value: unknown,
): number | undefined {
  const actor = record(value);
  if (!actor) return undefined;
  const primaryId =
    typeof actor.PrimaryId === 'string' ? actor.PrimaryId : undefined;
  if (isTrackablePrimaryId(primaryId)) {
    const index = participants.findIndex(
      (participant) => participant.primaryId === primaryId,
    );
    if (index >= 0) return index;
  }
  const shortcut = finite(actor.Shortcut);
  if (shortcut !== undefined) {
    const index = participants.findIndex(
      (participant) => participant.shortcut === shortcut,
    );
    if (index >= 0) return index;
  }
  const name =
    typeof actor.Name === 'string'
      ? normalizePlayerName(actor.Name)
      : undefined;
  const teamNumber = finite(actor.TeamNum);
  if (!name) return undefined;
  const matches = participants
    .map((participant, index) => ({ participant, index }))
    .filter(
      ({ participant }) =>
        normalizePlayerName(participant.name) === name &&
        (teamNumber === undefined || participant.teamNumber === teamNumber),
    );
  return matches.length === 1 ? matches[0]!.index : undefined;
}

interface TouchActor {
  participantIndex: number;
  teamNumber: number;
}

export interface FiftyFact {
  id: string;
  participantIndexes: number[];
  resolvedEventId: string;
  sequence: number;
  touchEventIds: string[];
}

interface DerivedTouchStats {
  passes: number[];
  fifties: number[];
  fiftyFacts: FiftyFact[];
}

function touchActors(
  participants: ParticipantState[],
  event: TimelineEvent,
): TouchActor[] {
  if (event.eventName !== 'BallHit' || !Array.isArray(event.payload.Players))
    return [];
  const actors = new Map<number, TouchActor>();
  for (const value of event.payload.Players) {
    const index = participantIndex(participants, value);
    if (index === undefined) continue;
    actors.set(index, {
      participantIndex: index,
      teamNumber:
        finite(record(value)?.TeamNum) ?? participants[index]!.teamNumber,
    });
  }
  return [...actors.values()];
}

function receivedAt(event: TimelineEvent): number | undefined {
  const value = Date.parse(event.receivedAt);
  return Number.isFinite(value) ? value : undefined;
}

function opposing(actors: TouchActor[]): boolean {
  return new Set(actors.map((actor) => actor.teamNumber)).size > 1;
}

function opposingAcross(
  previous: TouchActor[],
  current: TouchActor[],
): boolean {
  return previous.some((prior) =>
    current.some((actor) => actor.teamNumber !== prior.teamNumber),
  );
}

/**
 * Walks one chronological play stream to share the same pass, 50, cooldown,
 * and dead-ball decisions between aggregate totals and map presentation facts.
 */
function deriveTouchStats(match: MatchState): DerivedTouchStats {
  const passes = match.participants.map(() => 0);
  const fifties = match.participants.map(() => 0);
  const fiftyFacts: FiftyFact[] = [];
  let pendingPass: TouchActor | undefined;
  let previousTouch:
    { actors: TouchActor[]; eventId: string; receivedAt?: number } | undefined;
  let lastFiftyAt: number | undefined;
  let activePlay = true;
  for (const event of [...match.events].sort(
    (a, b) => a.sequence - b.sequence,
  )) {
    if (playStops.has(event.eventName)) {
      pendingPass = undefined;
      previousTouch = undefined;
      lastFiftyAt = undefined;
      activePlay = false;
      continue;
    }
    if (playStarts.has(event.eventName)) {
      pendingPass = undefined;
      previousTouch = undefined;
      lastFiftyAt = undefined;
      activePlay = true;
      continue;
    }
    if (event.eventName !== 'BallHit') continue;
    const actors = touchActors(match.participants, event);
    if (!activePlay || actors.length === 0) {
      pendingPass = undefined;
      previousTouch = undefined;
      continue;
    }
    const currentPass =
      Array.isArray(event.payload.Players) &&
      event.payload.Players.length === 1 &&
      actors.length === 1
        ? actors[0]
        : undefined;
    if (
      pendingPass !== undefined &&
      currentPass !== undefined &&
      pendingPass.participantIndex !== currentPass.participantIndex &&
      pendingPass.teamNumber === currentPass.teamNumber
    ) {
      passes[pendingPass.participantIndex] =
        (passes[pendingPass.participantIndex] ?? 0) + 1;
    }
    pendingPass = currentPass;

    const timestamp = receivedAt(event);
    let challengeActors: TouchActor[] | undefined;
    let challengeEventIds: string[] | undefined;
    if (opposing(actors)) {
      challengeActors = actors;
      challengeEventIds = [event.id];
    } else if (
      timestamp !== undefined &&
      previousTouch?.receivedAt !== undefined &&
      timestamp >= previousTouch.receivedAt &&
      timestamp - previousTouch.receivedAt <= 250 &&
      opposingAcross(previousTouch.actors, actors)
    ) {
      challengeActors = [...previousTouch.actors, ...actors];
      challengeEventIds = [previousTouch.eventId, event.id];
    }
    if (
      challengeActors &&
      challengeEventIds &&
      (timestamp === undefined ||
        lastFiftyAt === undefined ||
        timestamp - lastFiftyAt >= 500)
    ) {
      const participantIndexes = [
        ...new Set(challengeActors.map((actor) => actor.participantIndex)),
      ];
      for (const index of participantIndexes) {
        fifties[index] = (fifties[index] ?? 0) + 1;
      }
      fiftyFacts.push({
        id: `fifty:${event.id}`,
        participantIndexes,
        resolvedEventId: event.id,
        sequence: event.sequence,
        touchEventIds: challengeEventIds,
      });
      if (timestamp !== undefined) lastFiftyAt = timestamp;
    }
    previousTouch = { actors, eventId: event.id, receivedAt: timestamp };
  }
  return { passes, fifties, fiftyFacts };
}

export function derivedFiftyFacts(match: MatchState): FiftyFact[] {
  return deriveTouchStats(match).fiftyFacts;
}

/**
 * Rebuilds passes and 50s from chronological ball-hit telemetry. Sequential
 * opposing touches form a 50 within 250 ms, while a global 500 ms cooldown
 * collapses rapid exchanges into one challenge.
 */
export function recalculateDerivedTouchStats(match: MatchState): void {
  const { passes, fifties } = deriveTouchStats(match);
  match.participants = match.participants.map((participant, index) => ({
    ...participant,
    passes: passes[index] ?? 0,
    fifties: fifties[index] ?? 0,
  }));
}
