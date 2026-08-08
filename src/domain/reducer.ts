import { resolvePlaylist } from './playlists';
import { isTrackablePrimaryId, normalizePlayerName } from './playerIdentity';
import type {
  MatchState,
  ParticipantState,
  StatsEnvelope,
  TeamState,
  TimelineEvent,
} from './types';

export interface ReduceResult {
  current: MatchState;
  superseded?: MatchState;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.trunc(value)
    : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function createMatch(guid: string | undefined, now: string): MatchState {
  return {
    id: guid ?? crypto.randomUUID().replaceAll('-', ''),
    matchGuid: guid,
    lifecycle: 'live',
    startedAt: now,
    lastEventAt: now,
    playlistId: 0,
    playlistName: 'Unknown playlist',
    playlistCategory: 'unknown',
    arena: '',
    timeSeconds: 0,
    isOvertime: false,
    isReplay: false,
    roundActive: false,
    roundPhaseObserved: false,
    isPaused: false,
    hasWinner: false,
    capture: {
      version: 1,
      updateStatePackets: 0,
      activePlayPackets: 0,
      ballSpeed: { samples: 0, sum: 0 },
      lastTouchSamplesByTeam: {},
    },
    teams: [],
    participants: [],
    events: [],
  };
}

function participant(value: Record<string, unknown>): ParticipantState {
  return {
    name: stringValue(value.Name) ?? 'Unknown player',
    primaryId: stringValue(value.PrimaryId),
    shortcut: optionalNumber(value.Shortcut),
    teamNumber: numberValue(value.TeamNum),
    score: numberValue(value.Score),
    goals: numberValue(value.Goals),
    assists: numberValue(value.Assists),
    saves: numberValue(value.Saves),
    shots: numberValue(value.Shots),
    touches: numberValue(value.Touches),
    carTouches: numberValue(value.CarTouches),
    demos: numberValue(value.Demos),
    loadout: stringArray(value.Loadout),
    isPresent: true,
  };
}

function team(value: Record<string, unknown>): TeamState {
  return {
    teamNumber: numberValue(value.TeamNum),
    name: stringValue(value.Name) ?? '',
    score: numberValue(value.Score),
    colorPrimary: stringValue(value.ColorPrimary) ?? '',
    colorSecondary: stringValue(value.ColorSecondary) ?? '',
  };
}

function playerReference(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined;
  const record = value as Record<string, unknown>;
  const name = stringValue(record.Name);
  if (!name) return undefined;
  return {
    name,
    shortcut: optionalNumber(record.Shortcut),
    teamNumber: numberValue(record.TeamNum),
  };
}

function mergeParticipants(
  previous: ParticipantState[],
  current: ParticipantState[],
): ParticipantState[] {
  const merged: ParticipantState[] = previous.map((value) => ({
    ...value,
    isPresent: false,
  }));
  for (const value of current) {
    let index = isTrackablePrimaryId(value.primaryId)
      ? merged.findIndex((candidate) => candidate.primaryId === value.primaryId)
      : -1;
    if (index < 0 && value.shortcut !== undefined)
      index = merged.findIndex(
        (candidate) => candidate.shortcut === value.shortcut,
      );
    const normalizedName = normalizePlayerName(value.name);
    if (index < 0 && normalizedName)
      index = merged.findIndex(
        (candidate) =>
          candidate.teamNumber === value.teamNumber &&
          normalizePlayerName(candidate.name) === normalizedName,
      );
    if (index < 0) merged.push(value);
    else merged[index] = { ...merged[index], ...value, isPresent: true };
  }
  return merged;
}

/**
 * Accumulates derived speed, control, and positional samples from the latest
 * match snapshot without replacing previously captured event telemetry.
 */
function accumulateSnapshot(match: MatchState): void {
  const capture = (match.capture ??= {
    version: 1,
    updateStatePackets: 0,
    activePlayPackets: 0,
    ballSpeed: { samples: 0, sum: 0 },
    lastTouchSamplesByTeam: {},
  });
  capture.updateStatePackets += 1;
  if (!match.roundActive || match.isPaused || match.isReplay || !match.ball)
    return;
  capture.activePlayPackets += 1;
  const speed = match.ball.speed;
  capture.ballSpeed.samples += 1;
  capture.ballSpeed.sum += speed;
  capture.ballSpeed.min =
    capture.ballSpeed.min === undefined
      ? speed
      : Math.min(capture.ballSpeed.min, speed);
  capture.ballSpeed.max =
    capture.ballSpeed.max === undefined
      ? speed
      : Math.max(capture.ballSpeed.max, speed);
  const team = match.ball.lastTouchTeamNumber;
  if (team !== undefined && team !== 255)
    capture.lastTouchSamplesByTeam[String(team)] =
      (capture.lastTouchSamplesByTeam[String(team)] ?? 0) + 1;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          !!item && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

function storeEvent(
  match: MatchState,
  envelope: StatsEnvelope,
  now: string,
): TimelineEvent {
  const sequence = (match.events.at(-1)?.sequence ?? 0) + 1;
  return {
    id: `${match.id}:${sequence}`,
    matchId: match.id,
    sequence,
    eventName: envelope.event,
    receivedAt: now,
    matchClockSeconds: match.timeSeconds,
    payload: structuredClone(envelope.data),
  };
}

/**
 * Applies Stats API snapshots and events to the match state machine, handling
 * lifecycle transitions, match rollover, participant merging, and finalization.
 */
export function reduceStatsEnvelope(
  previous: MatchState | undefined,
  envelope: StatsEnvelope,
  now = new Date().toISOString(),
): ReduceResult {
  const guid = stringValue(envelope.data.MatchGuid);
  if (
    previous?.lifecycle === 'completed' &&
    envelope.event === 'UpdateState' &&
    (!guid || guid === previous.matchGuid)
  ) {
    return { current: previous };
  }
  const needsNew =
    !previous ||
    (!!guid && !!previous.matchGuid && guid !== previous.matchGuid) ||
    (previous.lifecycle !== 'live' &&
      (envelope.event === 'MatchCreated' ||
        envelope.event === 'MatchInitialized'));

  let superseded: MatchState | undefined;
  let match: MatchState;
  if (needsNew) {
    if (previous?.lifecycle === 'live')
      superseded = { ...previous, lifecycle: 'incomplete', endedAt: now };
    match = createMatch(guid, now);
  } else {
    const { events, ...state } = previous;
    match = { ...structuredClone(state), events };
  }

  match.lastEventAt = now;
  if (guid) match.matchGuid = guid;

  if (envelope.event === 'UpdateState') {
    match.lifecycle = 'live';
    delete match.endedAt;
    match.participants = mergeParticipants(
      match.participants,
      recordArray(envelope.data.Players).map(participant),
    );
    const game = envelope.data.Game;
    if (game && typeof game === 'object' && !Array.isArray(game)) {
      const gameRecord = game as Record<string, unknown>;
      match.playlistId = numberValue(gameRecord.PlaylistId);
      const playlist = resolvePlaylist(match.playlistId);
      match.playlistName = playlist.name;
      match.playlistCategory = playlist.category;
      match.timeSeconds = numberValue(gameRecord.TimeSeconds);
      match.isOvertime = gameRecord.bOvertime === true;
      match.isReplay = gameRecord.bReplay === true;
      match.hasWinner = gameRecord.bHasWinner === true;
      match.winnerName = stringValue(gameRecord.Winner);
      match.arena = stringValue(gameRecord.Arena) ?? '';
      match.teams = recordArray(gameRecord.Teams).map(team);
      const ball = gameRecord.Ball;
      if (ball && typeof ball === 'object' && !Array.isArray(ball)) {
        const ballRecord = ball as Record<string, unknown>;
        match.ball = {
          speed: optionalNumber(ballRecord.Speed) ?? 0,
          lastTouchTeamNumber: optionalNumber(ballRecord.TeamNum),
        };
      }
      match.viewTarget =
        gameRecord.bHasTarget === true
          ? playerReference(gameRecord.Target)
          : undefined;
    }
    if (!match.roundPhaseObserved && !match.isReplay) match.roundActive = true;
    accumulateSnapshot(match);
  } else if (envelope.event === 'ClockUpdatedSeconds') {
    match.timeSeconds = numberValue(envelope.data.TimeSeconds);
    match.isOvertime = envelope.data.bOvertime === true;
    match.events = [...match.events, storeEvent(match, envelope, now)];
  } else if (envelope.event === 'MatchEnded') {
    const winner = envelope.data.WinnerTeamNum;
    if (typeof winner === 'number') match.winnerTeamNumber = Math.trunc(winner);
    match.lifecycle = 'completed';
    match.roundActive = false;
    match.endedAt = now;
    match.events = [...match.events, storeEvent(match, envelope, now)];
  } else if (envelope.event === 'MatchDestroyed') {
    if (match.lifecycle === 'live') match.lifecycle = 'incomplete';
    match.endedAt ??= now;
    match.roundActive = false;
    match.events = [...match.events, storeEvent(match, envelope, now)];
  } else {
    if (
      envelope.event === 'CountdownBegin' ||
      envelope.event === 'GoalScored' ||
      envelope.event === 'GoalReplayStart'
    ) {
      match.roundActive = false;
      match.roundPhaseObserved = true;
    } else if (envelope.event === 'RoundStarted') {
      match.roundActive = true;
      match.roundPhaseObserved = true;
    } else if (envelope.event === 'MatchPaused') match.isPaused = true;
    else if (envelope.event === 'MatchUnpaused') match.isPaused = false;
    else if (envelope.event === 'PlayerLeft') {
      const primaryId = stringValue(envelope.data.PrimaryId);
      const shortcut = optionalNumber(envelope.data.Shortcut);
      const teamNumber = optionalNumber(envelope.data.TeamNum);
      const playerName = stringValue(envelope.data.PlayerName);
      const normalizedName = normalizePlayerName(playerName);
      let leaving = isTrackablePrimaryId(primaryId)
        ? match.participants.find((value) => value.primaryId === primaryId)
        : undefined;
      if (!leaving && shortcut !== undefined)
        leaving = match.participants.find(
          (value) => value.shortcut === shortcut,
        );
      if (!leaving && normalizedName)
        leaving = match.participants.find(
          (value) =>
            normalizePlayerName(value.name) === normalizedName &&
            (teamNumber === undefined || value.teamNumber === teamNumber),
        );
      if (leaving) leaving.isPresent = false;
    }
    match.events = [...match.events, storeEvent(match, envelope, now)];
  }

  return { current: match, superseded };
}

export function recoverActiveMatch(
  matches: MatchState[],
  now = Date.now(),
): MatchState | undefined {
  const liveMatches = matches
    .filter((match) => match.lifecycle === 'live')
    .sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
  const active = liveMatches[0];
  if (!active) return undefined;
  for (const superseded of liveMatches.slice(1)) {
    superseded.lifecycle = 'incomplete';
    superseded.endedAt = superseded.lastEventAt;
  }
  if (now - new Date(active.lastEventAt).getTime() <= 15 * 60_000)
    return active;
  active.lifecycle = 'incomplete';
  active.endedAt = active.lastEventAt;
  return undefined;
}
