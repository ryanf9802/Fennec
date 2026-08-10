import type { MatchState, ParticipantState, TimelineEvent } from './types';
import { arenaProfile } from './arenaProfiles';
import { derivedFiftyFacts } from './passes';

export type SpatialEventKind = 'touch' | 'goal' | 'fifty' | 'crossbar';

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
  sequence: number;
  sourceEventIds: string[];
  goalNumber?: number;
  associatedPointId?: string;
  isScoringTouch?: boolean;
  isSave?: boolean;
  scoringTeamNumber?: number;
  x: number;
  y: number;
  z: number;
  elapsedSeconds?: number;
  actors: SpatialActor[];
  preHitSpeed?: number;
  postHitSpeed?: number;
  speed?: number;
}

const saveEventNames = new Set(['save', 'epicsave']);

export interface PlayerTouchAnalytics {
  touches: number;
  teamTouches: number;
  touchShare?: number;
  averagePostHitSpeed?: number;
  maximumPostHitSpeed?: number;
  averageSpeedChange?: number;
}

export interface TerritorialTeamAnalytics {
  teamNumber: number;
  pressureTouches: number;
  fieldPressureShare?: number;
  territorySamples: number;
  averageNetTerritoryPercent?: number;
}

export interface TerritorialPlayerAnalytics {
  actor: SpatialActor;
  pressureTouches: number;
  pressureContribution?: number;
  territorySamples: number;
  averageNetTerritoryPercent?: number;
}

export interface TerritorialImpactAnalytics {
  teams: TerritorialTeamAnalytics[];
  players: TerritorialPlayerAnalytics[];
}

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

function isScoredGoal(event: TimelineEvent): boolean {
  return (
    event.eventName === 'GoalScored' &&
    !(
      finite(event.payload.GoalSpeed) === 0 &&
      finite(event.payload.GoalTime) === 0
    )
  );
}

function sameMatchGuid(first: TimelineEvent, second: TimelineEvent): boolean {
  const firstGuid = first.payload.MatchGuid;
  const secondGuid = second.payload.MatchGuid;
  return (
    typeof firstGuid !== 'string' ||
    typeof secondGuid !== 'string' ||
    firstGuid === secondGuid
  );
}

function isGoalLocationCompanion(event: TimelineEvent): boolean {
  const scorer = record(event.payload.Scorer);
  return (
    event.eventName === 'GoalScored' &&
    finite(event.payload.GoalSpeed) === 0 &&
    finite(event.payload.GoalTime) === 0 &&
    scorer?.Name === ''
  );
}

function vector(
  value: unknown,
): { x: number; y: number; z: number } | undefined {
  const item = record(value);
  if (!item) return undefined;
  const x = finite(item.X);
  const y = finite(item.Y);
  const z = finite(item.Z);
  return x === undefined || y === undefined || z === undefined
    ? undefined
    : { x, y, z };
}

function participantFor(
  match: MatchState,
  value: Record<string, unknown>,
): ParticipantState | undefined {
  const shortcut = finite(value.Shortcut);
  if (shortcut !== undefined) {
    const found = match.participants.find(
      (player) => player.shortcut === shortcut,
    );
    if (found) return found;
  }
  const name = typeof value.Name === 'string' ? value.Name : undefined;
  const teamNumber = finite(value.TeamNum);
  return match.participants.find(
    (player) =>
      player.name === name &&
      (teamNumber === undefined || player.teamNumber === teamNumber),
  );
}

function actor(match: MatchState, value: unknown): SpatialActor | undefined {
  const item = record(value);
  if (!item || typeof item.Name !== 'string') return undefined;
  const participant = participantFor(match, item);
  const shortcut = finite(item.Shortcut);
  const teamNumber = finite(item.TeamNum) ?? participant?.teamNumber ?? 0;
  const primaryId = participant?.primaryId;
  return {
    key: primaryId
      ? `id:${primaryId}`
      : shortcut !== undefined
        ? `shortcut:${shortcut}`
        : `name:${teamNumber}:${item.Name}`,
    name: item.Name,
    teamNumber,
    shortcut,
    primaryId,
  };
}

function normalizedEventName(value: unknown): string | undefined {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9]/g, '')
    : undefined;
}

function isSaveEvent(event: TimelineEvent): boolean {
  if (event.eventName !== 'StatfeedEvent') return false;
  return [event.payload.EventName, event.payload.Type].some((value) => {
    const normalized = normalizedEventName(value);
    return normalized !== undefined && saveEventNames.has(normalized);
  });
}

function receivedAt(event: TimelineEvent): number | undefined {
  const value = Date.parse(event.receivedAt);
  return Number.isFinite(value) ? value : undefined;
}

function spatialElapsedSeconds(
  match: MatchState,
  event: TimelineEvent,
): number | undefined {
  const elapsed = finite(event.elapsedSeconds);
  if (
    elapsed === 0 &&
    event.matchClockSeconds === 0 &&
    (match.regulationDurationSeconds ?? 0) > 0
  )
    return undefined;
  return elapsed;
}

function nearbyAward(award: TimelineEvent, touch: TimelineEvent): boolean {
  if (Math.abs(award.sequence - touch.sequence) > 4) return false;
  if (
    award.matchClockSeconds !== undefined &&
    touch.matchClockSeconds !== undefined
  )
    return award.matchClockSeconds === touch.matchClockSeconds;
  const awardTime = receivedAt(award);
  const touchTime = receivedAt(touch);
  return (
    awardTime !== undefined &&
    touchTime !== undefined &&
    Math.abs(awardTime - touchTime) <= 2_000
  );
}

/**
 * Correlates coordinate-free save awards with the same player's nearby hit,
 * accepting either event order because BallHit telemetry arrives a frame late.
 */
function savedTouchIds(match: MatchState): Set<string> {
  const events = [...match.events].sort(
    (first, second) => first.sequence - second.sequence,
  );
  const segmentById = new Map<string, number>();
  let segment = 0;
  for (const event of events) {
    if (playStarts.has(event.eventName)) segment++;
    segmentById.set(event.id, segment);
    if (playStops.has(event.eventName)) segment++;
  }
  const touches = events.filter((event) => event.eventName === 'BallHit');
  const saved = new Set<string>();
  for (const award of events.filter(isSaveEvent)) {
    const saver = actor(match, award.payload.MainTarget);
    if (!saver) continue;
    const matchedTouch = touches
      .filter(
        (touch) =>
          segmentById.get(touch.id) === segmentById.get(award.id) &&
          nearbyAward(award, touch) &&
          (Array.isArray(touch.payload.Players)
            ? touch.payload.Players
            : []
          ).some((value) => actor(match, value)?.key === saver.key),
      )
      .sort((first, second) => {
        const sequenceDifference =
          Math.abs(first.sequence - award.sequence) -
          Math.abs(second.sequence - award.sequence);
        if (sequenceDifference) return sequenceDifference;
        const firstTime = receivedAt(first);
        const secondTime = receivedAt(second);
        const awardTime = receivedAt(award);
        return awardTime === undefined
          ? first.sequence - second.sequence
          : Math.abs((firstTime ?? awardTime) - awardTime) -
              Math.abs((secondTime ?? awardTime) - awardTime);
      })[0];
    if (matchedTouch) saved.add(matchedTouch.id);
  }
  return saved;
}

function participantActor(
  participant: ParticipantState,
  index: number,
): SpatialActor {
  return {
    key: participant.primaryId
      ? `id:${participant.primaryId}`
      : participant.shortcut !== undefined
        ? `shortcut:${participant.shortcut}`
        : `participant:${index}`,
    name: participant.name,
    teamNumber: participant.teamNumber,
    shortcut: participant.shortcut,
    primaryId: participant.primaryId,
  };
}

/**
 * Interprets supported telemetry payloads as normalized spatial points,
 * rejecting events that lack the coordinates or actors needed for display.
 */
function eventPoint(
  match: MatchState,
  event: TimelineEvent,
  goalNumber?: number,
  goalLocationEvent?: TimelineEvent,
): SpatialEventPoint | undefined {
  if (event.eventName === 'BallHit') {
    const ball = record(event.payload.Ball);
    const location = vector(ball?.Location);
    if (!ball || !location) return undefined;
    const players = Array.isArray(event.payload.Players)
      ? event.payload.Players
      : [];
    return {
      id: event.id,
      kind: 'touch',
      sequence: event.sequence,
      sourceEventIds: [event.id],
      ...location,
      elapsedSeconds: spatialElapsedSeconds(match, event),
      actors: players
        .map((value) => actor(match, value))
        .filter((value): value is SpatialActor => !!value),
      preHitSpeed: finite(ball.PreHitSpeed),
      postHitSpeed: finite(ball.PostHitSpeed),
    };
  }
  if (event.eventName === 'GoalScored') {
    if (!isScoredGoal(event)) return undefined;
    const location = vector(
      (goalLocationEvent ?? event).payload.ImpactLocation,
    );
    if (!location) return undefined;
    const scorer = actor(match, event.payload.Scorer);
    return {
      id: event.id,
      kind: 'goal',
      sequence: event.sequence,
      sourceEventIds: goalLocationEvent
        ? [event.id, goalLocationEvent.id]
        : [event.id],
      goalNumber,
      ...location,
      elapsedSeconds: spatialElapsedSeconds(match, event),
      actors: scorer ? [scorer] : [],
      speed: finite(event.payload.GoalSpeed),
    };
  }
  if (event.eventName === 'CrossbarHit') {
    const location = vector(event.payload.BallLocation);
    if (!location) return undefined;
    const lastTouch = record(event.payload.BallLastTouch);
    const player = actor(match, lastTouch?.Player);
    return {
      id: event.id,
      kind: 'crossbar',
      sequence: event.sequence,
      sourceEventIds: [event.id],
      ...location,
      elapsedSeconds: spatialElapsedSeconds(match, event),
      actors: player ? [player] : [],
      speed: finite(event.payload.BallSpeed),
    };
  }
  return undefined;
}

/**
 * The Stats API can emit a scored-goal record with stale coordinates followed
 * by a zeroed companion record containing the actual impact location.
 */
function goalLocationEvents(match: MatchState): Map<string, TimelineEvent> {
  const events = [...match.events].sort(
    (first, second) => first.sequence - second.sequence,
  );
  const result = new Map<string, TimelineEvent>();
  for (const event of events) {
    if (!isScoredGoal(event)) continue;
    const companion = events.find(
      (candidate) =>
        candidate.sequence > event.sequence &&
        candidate.sequence - event.sequence <= 4 &&
        event.matchClockSeconds !== undefined &&
        candidate.matchClockSeconds === event.matchClockSeconds &&
        isGoalLocationCompanion(candidate) &&
        sameMatchGuid(event, candidate) &&
        !!vector(candidate.payload.ImpactLocation),
    );
    if (companion) result.set(event.id, companion);
  }
  return result;
}

function goalNumbers(match: MatchState): Map<string, number> {
  return new Map(
    match.events
      .filter(isScoredGoal)
      .sort((first, second) => first.sequence - second.sequence)
      .map((event, index) => [event.id, index + 1]),
  );
}

function rawSpatialEventPoints(match: MatchState): SpatialEventPoint[] {
  const numbers = goalNumbers(match);
  const locations = goalLocationEvents(match);
  return match.events
    .map((event) =>
      eventPoint(match, event, numbers.get(event.id), locations.get(event.id)),
    )
    .filter((value): value is SpatialEventPoint => !!value);
}

const playStops = new Set([
  'CountdownBegin',
  'GoalScored',
  'GoalReplayStart',
  'MatchEnded',
  'MatchDestroyed',
  'MatchPaused',
]);
const playStarts = new Set(['RoundStarted', 'MatchUnpaused']);

function playSegments(events: TimelineEvent[]): Map<string, number> {
  const result = new Map<string, number>();
  let segment = 0;
  for (const event of [...events].sort(
    (first, second) => first.sequence - second.sequence,
  )) {
    if (playStarts.has(event.eventName)) segment++;
    result.set(event.id, segment);
    if (playStops.has(event.eventName)) segment++;
  }
  return result;
}

function actorKeys(point: SpatialEventPoint): string[] {
  return [...new Set(point.actors.map((value) => value.key))].sort();
}

function sameActors(
  first: SpatialEventPoint,
  second: SpatialEventPoint,
): boolean {
  const firstKeys = actorKeys(first);
  const secondKeys = actorKeys(second);
  return (
    firstKeys.length > 0 &&
    firstKeys.length === secondKeys.length &&
    firstKeys.every((value, index) => value === secondKeys[index])
  );
}

function compatibleNumber(
  first: number | undefined,
  second: number | undefined,
): boolean {
  return (
    first === undefined || second === undefined || Math.abs(first - second) <= 1
  );
}

/**
 * Applies the conservative identity, timing, play-segment, position, and speed
 * constraints required before two raw hit packets can represent one touch.
 */
function duplicateTouch(
  first: SpatialEventPoint,
  second: SpatialEventPoint,
  eventsById: Map<string, TimelineEvent>,
  segmentById: Map<string, number>,
): boolean {
  const firstEvent = eventsById.get(first.id);
  const secondEvent = eventsById.get(second.id);
  if (!firstEvent || !secondEvent) return false;
  const firstTime = receivedAt(firstEvent);
  const secondTime = receivedAt(secondEvent);
  return (
    first.kind === 'touch' &&
    second.kind === 'touch' &&
    Math.abs(first.sequence - second.sequence) <= 4 &&
    firstTime !== undefined &&
    secondTime !== undefined &&
    Math.abs(firstTime - secondTime) <= 250 &&
    segmentById.get(first.id) === segmentById.get(second.id) &&
    sameMatchGuid(firstEvent, secondEvent) &&
    sameActors(first, second) &&
    Math.abs(first.x - second.x) <= 1 &&
    Math.abs(first.y - second.y) <= 1 &&
    Math.abs(first.z - second.z) <= 1 &&
    compatibleNumber(first.preHitSpeed, second.preHitSpeed) &&
    compatibleNumber(first.postHitSpeed, second.postHitSpeed)
  );
}

interface CanonicalTouches {
  points: SpatialEventPoint[];
  canonicalIdBySourceId: Map<string, string>;
}

/**
 * Collapses duplicate telemetry for one physical hit while retaining every raw
 * source ID and preferring the latest event for downstream goal association.
 */
function canonicalTouches(
  match: MatchState,
  points: SpatialEventPoint[],
): CanonicalTouches {
  const eventsById = new Map(match.events.map((event) => [event.id, event]));
  const segmentById = playSegments(match.events);
  const canonical: SpatialEventPoint[] = [];
  const canonicalIdBySourceId = new Map<string, string>();
  for (const point of points
    .filter((value) => value.kind === 'touch')
    .sort((first, second) => first.sequence - second.sequence)) {
    const duplicateIndex = canonical.findIndex((candidate) =>
      duplicateTouch(candidate, point, eventsById, segmentById),
    );
    if (duplicateIndex < 0) {
      canonical.push(point);
      canonicalIdBySourceId.set(point.id, point.id);
      continue;
    }
    const previous = canonical[duplicateIndex]!;
    const elapsed = [previous.elapsedSeconds, point.elapsedSeconds].filter(
      (value): value is number => value !== undefined,
    );
    const merged: SpatialEventPoint = {
      ...point,
      sourceEventIds: [
        ...new Set([...previous.sourceEventIds, ...point.sourceEventIds]),
      ],
      isSave: previous.isSave || point.isSave || undefined,
      elapsedSeconds: elapsed.length ? Math.max(...elapsed) : undefined,
      preHitSpeed: point.preHitSpeed ?? previous.preHitSpeed,
      postHitSpeed: point.postHitSpeed ?? previous.postHitSpeed,
    };
    canonical[duplicateIndex] = merged;
    for (const sourceId of merged.sourceEventIds)
      canonicalIdBySourceId.set(sourceId, merged.id);
  }
  return { points: canonical, canonicalIdBySourceId };
}

/**
 * Correlates each valid goal with the scorer's latest touch in uninterrupted
 * active play, clearing candidates whenever telemetry marks a dead-ball edge.
 */
function scoringTouches(match: MatchState): Map<string, string> {
  const result = new Map<string, string>();
  const lastTouchByActor = new Map<string, string>();
  let activePlay = true;
  for (const event of [...match.events].sort(
    (first, second) => first.sequence - second.sequence,
  )) {
    if (event.eventName === 'GoalScored') {
      if (activePlay && isScoredGoal(event)) {
        const scorer = actor(match, event.payload.Scorer);
        const touchId = scorer && lastTouchByActor.get(scorer.key);
        if (touchId) result.set(event.id, touchId);
      }
      lastTouchByActor.clear();
      activePlay = false;
      continue;
    }
    if (playStops.has(event.eventName)) {
      lastTouchByActor.clear();
      activePlay = false;
      continue;
    }
    if (playStarts.has(event.eventName)) {
      lastTouchByActor.clear();
      activePlay = true;
      continue;
    }
    if (event.eventName !== 'BallHit' || !activePlay) continue;
    const players = Array.isArray(event.payload.Players)
      ? event.payload.Players
      : [];
    for (const value of players) {
      const touchActor = actor(match, value);
      if (touchActor) lastTouchByActor.set(touchActor.key, event.id);
    }
  }
  return result;
}

/**
 * Builds presentation markers from raw telemetry while preserving source-event
 * identity for consolidated 50s and correlated scoring touches.
 */
export function spatialEventPoints(match: MatchState): SpatialEventPoint[] {
  const saved = savedTouchIds(match);
  const rawPoints = rawSpatialEventPoints(match).map((point) =>
    point.kind === 'touch' && saved.has(point.id)
      ? { ...point, isSave: true }
      : point,
  );
  const canonical = canonicalTouches(match, rawPoints);
  const normalizedPoints = [
    ...rawPoints.filter((point) => point.kind !== 'touch'),
    ...canonical.points,
  ];
  const rawById = new Map(normalizedPoints.map((point) => [point.id, point]));
  const eventsById = new Map(match.events.map((event) => [event.id, event]));
  const numbers = goalNumbers(match);
  const fiftyPoints = derivedFiftyFacts(match).flatMap((fact) => {
    const resolvedId =
      canonical.canonicalIdBySourceId.get(fact.resolvedEventId) ??
      fact.resolvedEventId;
    const resolved = rawById.get(resolvedId);
    if (!resolved || resolved.kind !== 'touch') return [];
    const sourceEventIds = [
      ...new Set(
        fact.touchEventIds.flatMap((eventId) => {
          const canonicalId =
            canonical.canonicalIdBySourceId.get(eventId) ?? eventId;
          return rawById.get(canonicalId)?.sourceEventIds ?? [eventId];
        }),
      ),
    ];
    return [
      {
        ...resolved,
        id: fact.id,
        kind: 'fifty' as const,
        sequence: fact.sequence,
        sourceEventIds,
        isSave: sourceEventIds.some((eventId) => saved.has(eventId)),
        actors: fact.participantIndexes.map((index) =>
          participantActor(match.participants[index]!, index),
        ),
      },
    ];
  });
  const fiftyIdByTouch = new Map(
    fiftyPoints.flatMap((point) =>
      point.sourceEventIds.map((eventId) => [eventId, point.id] as const),
    ),
  );
  const consumedTouches = new Set(fiftyIdByTouch.keys());
  const associations = scoringTouches(match);
  const markerIdByGoal = new Map<string, string>();
  const goalByMarkerId = new Map<
    string,
    { goalId?: string; goalNumber?: number; teamNumber?: number }
  >();
  for (const [goalId, touchId] of associations) {
    const canonicalTouchId =
      canonical.canonicalIdBySourceId.get(touchId) ?? touchId;
    const markerId =
      fiftyIdByTouch.get(touchId) ??
      fiftyIdByTouch.get(canonicalTouchId) ??
      (rawById.get(canonicalTouchId)?.kind === 'touch'
        ? canonicalTouchId
        : undefined);
    if (!markerId) continue;
    const goalPoint = rawById.get(goalId);
    const goalEvent = eventsById.get(goalId);
    markerIdByGoal.set(goalId, markerId);
    goalByMarkerId.set(markerId, {
      goalId: goalPoint?.id,
      goalNumber: numbers.get(goalId),
      teamNumber: goalEvent
        ? actor(match, goalEvent.payload.Scorer)?.teamNumber
        : undefined,
    });
  }
  const points = [
    ...normalizedPoints.filter(
      (point) =>
        point.kind !== 'touch' ||
        !point.sourceEventIds.some((eventId) => consumedTouches.has(eventId)),
    ),
    ...fiftyPoints,
  ].map((point) => {
    if (point.kind === 'goal') {
      const markerId = markerIdByGoal.get(point.id);
      return markerId
        ? {
            ...point,
            associatedPointId: markerId,
          }
        : point;
    }
    const goal = goalByMarkerId.get(point.id);
    return goal
      ? {
          ...point,
          associatedPointId: goal.goalId,
          goalNumber: goal.goalNumber,
          isScoringTouch: true,
          scoringTeamNumber: goal.teamNumber,
        }
      : point;
  });
  return points.sort((first, second) => first.sequence - second.sequence);
}

function participantKey(player: ParticipantState): string {
  return player.primaryId
    ? `id:${player.primaryId}`
    : player.shortcut !== undefined
      ? `shortcut:${player.shortcut}`
      : `name:${player.teamNumber}:${player.name}`;
}

function attackingProgress(
  y: number,
  teamNumber: number,
  yMin: number,
  yMax: number,
): number | undefined {
  if (teamNumber !== 0 && teamNumber !== 1) return undefined;
  const length = yMax - yMin;
  if (length <= 0) return undefined;
  const bounded = Math.max(yMin, Math.min(yMax, y));
  return teamNumber === 0
    ? (bounded - yMin) / length
    : (yMax - bounded) / length;
}

/**
 * Derives conservative attacking-third pressure and signed territorial
 * progress from unambiguous spatial touches in Soccar and Hoops.
 */
export function territorialImpactAnalytics(
  match: MatchState,
): TerritorialImpactAnalytics | undefined {
  const arena = arenaProfile(match);
  if (arena.kind !== 'soccar' && arena.kind !== 'hoops') return undefined;

  const points = spatialEventPoints(match);
  const contacts = points.filter(
    (point) => point.kind === 'touch' || point.kind === 'fifty',
  );
  if (
    !contacts.some(
      (point) =>
        point.kind === 'touch' &&
        point.actors.length === 1 &&
        (point.actors[0]?.teamNumber === 0 ||
          point.actors[0]?.teamNumber === 1),
    )
  )
    return undefined;

  const segmentByEventId = playSegments(match.events);
  const segmentFor = (point: SpatialEventPoint) =>
    point.sourceEventIds
      .map((id) => segmentByEventId.get(id))
      .find((value) => value !== undefined);
  const goalsById = new Map(
    points
      .filter((point) => point.kind === 'goal')
      .map((point) => [point.id, point]),
  );
  const teamValues = new Map<
    number,
    { pressureTouches: number; territorySum: number; territorySamples: number }
  >();
  const playerValues = new Map<
    string,
    {
      actor: SpatialActor;
      pressureTouches: number;
      territorySum: number;
      territorySamples: number;
    }
  >();

  for (const teamNumber of [0, 1])
    teamValues.set(teamNumber, {
      pressureTouches: 0,
      territorySum: 0,
      territorySamples: 0,
    });
  for (const player of match.participants) {
    if (player.teamNumber !== 0 && player.teamNumber !== 1) continue;
    const key = participantKey(player);
    playerValues.set(key, {
      actor: {
        key,
        name: player.name,
        teamNumber: player.teamNumber,
        shortcut: player.shortcut,
        primaryId: player.primaryId,
      },
      pressureTouches: 0,
      territorySum: 0,
      territorySamples: 0,
    });
  }

  for (const [index, point] of contacts.entries()) {
    if (point.kind !== 'touch' || point.actors.length !== 1) continue;
    const touchActor = point.actors[0]!;
    const teamValue = teamValues.get(touchActor.teamNumber);
    if (!teamValue) continue;
    const playerValue = playerValues.get(touchActor.key) ?? {
      actor: touchActor,
      pressureTouches: 0,
      territorySum: 0,
      territorySamples: 0,
    };
    playerValues.set(touchActor.key, playerValue);

    const origin = attackingProgress(
      point.y,
      touchActor.teamNumber,
      arena.yMin,
      arena.yMax,
    );
    if (origin === undefined) continue;
    if (origin >= 2 / 3) {
      teamValue.pressureTouches += 1;
      playerValue.pressureTouches += 1;
    }

    let destination = point.associatedPointId
      ? goalsById.get(point.associatedPointId)
      : undefined;
    if (!destination) {
      const segment = segmentFor(point);
      const candidate = contacts[index + 1];
      if (candidate && segmentFor(candidate) === segment)
        destination = candidate;
    }
    if (
      !destination ||
      destination.kind === 'fifty' ||
      (destination.kind === 'touch' && destination.actors.length !== 1)
    )
      continue;
    const destinationProgress = attackingProgress(
      destination.y,
      touchActor.teamNumber,
      arena.yMin,
      arena.yMax,
    );
    if (destinationProgress === undefined) continue;
    const territory = (destinationProgress - origin) * 100;
    teamValue.territorySum += territory;
    teamValue.territorySamples += 1;
    playerValue.territorySum += territory;
    playerValue.territorySamples += 1;
  }

  const totalPressureTouches = [...teamValues.values()].reduce(
    (sum, value) => sum + value.pressureTouches,
    0,
  );
  const teams = [...teamValues.entries()].map(([teamNumber, value]) => ({
    teamNumber,
    pressureTouches: value.pressureTouches,
    fieldPressureShare: totalPressureTouches
      ? value.pressureTouches / totalPressureTouches
      : undefined,
    territorySamples: value.territorySamples,
    averageNetTerritoryPercent: value.territorySamples
      ? value.territorySum / value.territorySamples
      : undefined,
  }));
  const players = [...playerValues.values()].map((value) => {
    const teamPressureTouches =
      teamValues.get(value.actor.teamNumber)?.pressureTouches ?? 0;
    return {
      actor: value.actor,
      pressureTouches: value.pressureTouches,
      pressureContribution: teamPressureTouches
        ? value.pressureTouches / teamPressureTouches
        : undefined,
      territorySamples: value.territorySamples,
      averageNetTerritoryPercent: value.territorySamples
        ? value.territorySum / value.territorySamples
        : undefined,
    };
  });
  return { teams, players };
}

export function playerTouchAnalytics(
  match: MatchState,
  primaryId?: string,
): PlayerTouchAnalytics {
  const player = match.participants.find(
    (value) => value.primaryId === primaryId,
  );
  const touches = canonicalTouches(match, rawSpatialEventPoints(match)).points;
  const selected = primaryId
    ? touches.filter((point) =>
        point.actors.some((value) => value.primaryId === primaryId),
      )
    : [];
  const teamTouches = player
    ? touches.filter((point) =>
        point.actors.some((value) => value.teamNumber === player.teamNumber),
      ).length
    : 0;
  const postSpeeds = selected
    .map((point) => point.postHitSpeed)
    .filter((value): value is number => value !== undefined);
  const changes = selected
    .map((point) =>
      point.preHitSpeed !== undefined && point.postHitSpeed !== undefined
        ? point.postHitSpeed - point.preHitSpeed
        : undefined,
    )
    .filter((value): value is number => value !== undefined);
  return {
    touches: selected.length,
    teamTouches,
    touchShare: teamTouches ? selected.length / teamTouches : undefined,
    averagePostHitSpeed: postSpeeds.length
      ? postSpeeds.reduce((sum, value) => sum + value, 0) / postSpeeds.length
      : undefined,
    maximumPostHitSpeed: postSpeeds.length
      ? Math.max(...postSpeeds)
      : undefined,
    averageSpeedChange: changes.length
      ? changes.reduce((sum, value) => sum + value, 0) / changes.length
      : undefined,
  };
}

export function observedBallSpeed(match: MatchState): {
  average?: number;
  maximum?: number;
} {
  const aggregate = match.capture?.ballSpeed;
  return aggregate?.samples
    ? { average: aggregate.sum / aggregate.samples, maximum: aggregate.max }
    : {};
}
