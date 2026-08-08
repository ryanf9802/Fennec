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

function touchActor(
  participants: ParticipantState[],
  event: TimelineEvent,
): TouchActor | undefined {
  if (event.eventName !== 'BallHit' || !Array.isArray(event.payload.Players))
    return undefined;
  if (event.payload.Players.length !== 1) return undefined;
  const value = event.payload.Players[0];
  const index = participantIndex(participants, value);
  if (index === undefined) return undefined;
  return {
    participantIndex: index,
    teamNumber:
      finite(record(value)?.TeamNum) ?? participants[index]!.teamNumber,
  };
}

/**
 * Rebuilds per-player pass totals from chronological ball-hit telemetry. A pass
 * belongs to the prior toucher when the next unambiguous touch is by a distinct
 * teammate; dead-ball transitions and ambiguous touches break the sequence.
 */
export function recalculatePasses(match: MatchState): void {
  const passes = match.participants.map(() => 0);
  let pending: TouchActor | undefined;
  let activePlay = true;
  for (const event of [...match.events].sort(
    (a, b) => a.sequence - b.sequence,
  )) {
    if (playStops.has(event.eventName)) {
      pending = undefined;
      activePlay = false;
      continue;
    }
    if (playStarts.has(event.eventName)) {
      pending = undefined;
      activePlay = true;
      continue;
    }
    if (event.eventName !== 'BallHit') continue;
    const current = touchActor(match.participants, event);
    if (!activePlay || current === undefined) {
      pending = undefined;
      continue;
    }
    if (
      pending !== undefined &&
      pending.participantIndex !== current.participantIndex &&
      pending.teamNumber === current.teamNumber
    ) {
      passes[pending.participantIndex] =
        (passes[pending.participantIndex] ?? 0) + 1;
    }
    pending = current;
  }
  match.participants = match.participants.map((participant, index) => ({
    ...participant,
    passes: passes[index] ?? 0,
  }));
}
