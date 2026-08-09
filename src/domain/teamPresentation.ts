import type { MatchState, TeamState } from './types';

export interface TeamPresentation {
  teamNumber: number;
  name: string;
  primaryColor: string;
  secondaryColor: string;
}

const defaultTeamColors: Record<
  number,
  Pick<TeamPresentation, 'primaryColor' | 'secondaryColor'>
> = {
  0: { primaryColor: '#36d7ff', secondaryColor: '#2563eb' },
  1: { primaryColor: '#ff8a3d', secondaryColor: '#c2410c' },
};

const neutralTeamColors = {
  primaryColor: '#94a3b8',
  secondaryColor: '#475569',
};

export function normalizeTeamColor(value?: string): string | undefined {
  const normalized = value?.trim().replace(/^#/, '');
  return normalized && /^[\da-f]{6}$/i.test(normalized)
    ? `#${normalized.toLowerCase()}`
    : undefined;
}

/**
 * Resolves untrusted, optional Stats API team identity into a complete UI
 * presentation while preserving valid colors and legacy blue/orange labels.
 */
export function resolveTeamPresentation(
  teams: TeamState[],
  teamNumber: number,
): TeamPresentation {
  const team = teams.find((candidate) => candidate.teamNumber === teamNumber);
  const defaults = defaultTeamColors[teamNumber] ?? neutralTeamColors;
  const primaryColor = normalizeTeamColor(team?.colorPrimary);
  const fallbackName = team
    ? `Team ${teamNumber + 1}`
    : teamNumber === 0
      ? 'Blue'
      : teamNumber === 1
        ? 'Orange'
        : `Team ${teamNumber + 1}`;
  return {
    teamNumber,
    name: team?.name.trim() || fallbackName,
    primaryColor: primaryColor ?? defaults.primaryColor,
    secondaryColor:
      normalizeTeamColor(team?.colorSecondary) ??
      primaryColor ??
      defaults.secondaryColor,
  };
}

export function profileTeamNumber(
  match: MatchState,
  profileId?: string,
): number | undefined {
  return match.participants.find((player) => player.primaryId === profileId)
    ?.teamNumber;
}

export function orderedTeams(
  teams: TeamState[],
  preferredTeamNumber?: number,
): TeamState[] {
  return [...teams].sort((a, b) => {
    const aIsPreferred = a.teamNumber === preferredTeamNumber;
    const bIsPreferred = b.teamNumber === preferredTeamNumber;
    if (aIsPreferred !== bIsPreferred) return aIsPreferred ? -1 : 1;
    return a.teamNumber - b.teamNumber;
  });
}

export function formatTeamScore(
  teams: TeamState[],
  preferredTeamNumber?: number,
  separator = ' – ',
): string {
  const ordered = orderedTeams(teams, preferredTeamNumber);
  return ordered.length >= 2
    ? `${ordered[0]!.score}${separator}${ordered.at(-1)!.score}`
    : '—';
}
