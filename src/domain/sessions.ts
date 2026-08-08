import type { MatchState, SessionGroup } from './types';

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
    const priorEnd = new Date(prior.endedAt ?? prior.lastEventAt).getTime();
    if (new Date(match.startedAt).getTime() - priorEnd >= idleMinutes * 60_000)
      groups.push([]);
    groups.at(-1)!.push(match);
  }
  return groups.map((items) => ({
    id: `${new Date(items[0]!.startedAt).getTime().toString(16)}-${items[0]!.id}`,
    startedAt: items[0]!.startedAt,
    endedAt: items.at(-1)!.endedAt ?? items.at(-1)!.lastEventAt,
    matches: items,
  }));
}
