import type { MatchState, TeamState } from './types';

export function profileTeamNumber(match: MatchState, profileId?: string): number | undefined {
  return match.participants.find((player) => player.primaryId === profileId)?.teamNumber;
}

export function orderedTeams(teams: TeamState[], preferredTeamNumber?: number): TeamState[] {
  return [...teams].sort((a, b) => {
    const aIsPreferred = a.teamNumber === preferredTeamNumber;
    const bIsPreferred = b.teamNumber === preferredTeamNumber;
    if (aIsPreferred !== bIsPreferred) return aIsPreferred ? -1 : 1;
    return a.teamNumber - b.teamNumber;
  });
}

export function formatTeamScore(teams: TeamState[], preferredTeamNumber?: number, separator = ' – '): string {
  const ordered = orderedTeams(teams, preferredTeamNumber);
  return ordered.length >= 2 ? `${ordered[0]!.score}${separator}${ordered.at(-1)!.score}` : '—';
}
