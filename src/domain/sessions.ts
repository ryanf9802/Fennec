import type { MatchState, SessionGroup } from './types';

export function sessionIdleGapElapsed(
  session: Pick<SessionGroup, 'endedAt'>,
  idleMinutes: number,
  now = Date.now(),
): boolean {
  return now >= new Date(session.endedAt).getTime() + idleMinutes * 60_000;
}

export function startsNewSession(
  prior: Pick<MatchState, 'endedAt' | 'lastEventAt' | 'sessionEndedAfter'>,
  match: Pick<MatchState, 'startedAt'>,
  idleMinutes: number,
): boolean {
  return (
    prior.sessionEndedAfter === true ||
    new Date(match.startedAt).getTime() -
      new Date(prior.endedAt ?? prior.lastEventAt).getTime() >=
      idleMinutes * 60_000
  );
}

export function groupSessions(
  source: MatchState[],
  idleMinutes: number,
): SessionGroup[] {
  if (idleMinutes <= 0)
    throw new RangeError('Session idle threshold must be positive.');
  const matches = [...source].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  );
  if (!matches.length) return [];
  const groups: MatchState[][] = [[matches[0]!]];
  for (const match of matches.slice(1)) {
    const current = groups.at(-1)!;
    const prior = current.at(-1)!;
    if (startsNewSession(prior, match, idleMinutes)) groups.push([]);
    groups.at(-1)!.push(match);
  }
  return groups.map((items) => ({
    id: `${new Date(items[0]!.startedAt).getTime().toString(16)}-${items[0]!.id}`,
    startedAt: items[0]!.startedAt,
    endedAt: items.at(-1)!.endedAt ?? items.at(-1)!.lastEventAt,
    matches: items,
    endedManually: items.at(-1)!.sessionEndedAfter === true,
  }));
}
