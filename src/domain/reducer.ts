import { resolvePlaylist } from './playlists';
import type { MatchState, ParticipantState, StatsEnvelope, TeamState, TimelineEvent } from './types';

export interface ReduceResult {
  current: MatchState;
  superseded?: MatchState;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : 0;
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
    teams: [],
    participants: [],
    events: [],
  };
}

function participant(value: Record<string, unknown>): ParticipantState {
  return {
    name: stringValue(value.Name) ?? 'Unknown player',
    primaryId: stringValue(value.PrimaryId),
    teamNumber: numberValue(value.TeamNum),
    score: numberValue(value.Score),
    goals: numberValue(value.Goals),
    assists: numberValue(value.Assists),
    saves: numberValue(value.Saves),
    shots: numberValue(value.Shots),
    touches: numberValue(value.Touches),
    demos: numberValue(value.Demos),
  };
}

function team(value: Record<string, unknown>): TeamState {
  return {
    teamNumber: numberValue(value.TeamNum),
    name: stringValue(value.Name) ?? '',
    score: numberValue(value.Score),
    colorPrimary: stringValue(value.ColorPrimary) ?? '',
  };
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    : [];
}

function storeEvent(match: MatchState, envelope: StatsEnvelope, now: string): TimelineEvent {
  const sequence = Math.max(0, ...match.events.map((item) => item.sequence)) + 1;
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

export function reduceStatsEnvelope(previous: MatchState | undefined, envelope: StatsEnvelope, now = new Date().toISOString()): ReduceResult {
  const guid = stringValue(envelope.data.MatchGuid);
  if (previous?.lifecycle === 'completed' && envelope.event === 'UpdateState' && (!guid || guid === previous.matchGuid)) {
    return { current: previous };
  }
  const needsNew = !previous ||
    (!!guid && !!previous.matchGuid && guid !== previous.matchGuid) ||
    (previous.lifecycle !== 'live' && (envelope.event === 'MatchCreated' || envelope.event === 'MatchInitialized'));

  let superseded: MatchState | undefined;
  let match: MatchState;
  if (needsNew) {
    if (previous?.lifecycle === 'live') superseded = { ...previous, lifecycle: 'incomplete', endedAt: now };
    match = createMatch(guid, now);
  } else {
    match = structuredClone(previous);
  }

  match.lastEventAt = now;
  if (guid) match.matchGuid = guid;

  if (envelope.event === 'UpdateState') {
    match.lifecycle = 'live';
    delete match.endedAt;
    match.participants = recordArray(envelope.data.Players).map(participant);
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
      match.arena = stringValue(gameRecord.Arena) ?? '';
      match.teams = recordArray(gameRecord.Teams).map(team);
    }
  } else if (envelope.event === 'ClockUpdatedSeconds') {
    match.timeSeconds = numberValue(envelope.data.TimeSeconds);
    match.isOvertime = envelope.data.bOvertime === true;
    match.events.push(storeEvent(match, envelope, now));
  } else if (envelope.event === 'MatchEnded') {
    const winner = envelope.data.WinnerTeamNum;
    if (typeof winner === 'number') match.winnerTeamNumber = Math.trunc(winner);
    match.lifecycle = 'completed';
    match.endedAt = now;
    match.events.push(storeEvent(match, envelope, now));
  } else if (envelope.event === 'MatchDestroyed') {
    if (match.lifecycle === 'live') match.lifecycle = 'incomplete';
    match.endedAt ??= now;
    match.events.push(storeEvent(match, envelope, now));
  } else {
    match.events.push(storeEvent(match, envelope, now));
  }

  return { current: match, superseded };
}

export function recoverActiveMatch(matches: MatchState[], now = Date.now()): MatchState | undefined {
  const liveMatches = matches.filter((match) => match.lifecycle === 'live').sort((a, b) => b.lastEventAt.localeCompare(a.lastEventAt));
  const active = liveMatches[0];
  if (!active) return undefined;
  for (const superseded of liveMatches.slice(1)) {
    superseded.lifecycle = 'incomplete';
    superseded.endedAt = superseded.lastEventAt;
  }
  if (now - new Date(active.lastEventAt).getTime() <= 15 * 60_000) return active;
  active.lifecycle = 'incomplete';
  active.endedAt = active.lastEventAt;
  return undefined;
}
