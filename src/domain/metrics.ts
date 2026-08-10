import type { MatchState, SessionMetrics } from './types';
import { territorialImpactAnalytics } from './analytics';

export function isWin(match: MatchState, profileId?: string): boolean {
  const player = match.participants.find(
    (item) => item.primaryId === profileId,
  );
  return (
    !!player &&
    match.lifecycle === 'completed' &&
    match.winnerTeamNumber === player.teamNumber
  );
}

/**
 * Pools profile-relative outcomes and involvement across a session while
 * excluding matches without eligible spatial telemetry from pressure ratios.
 */
export function sessionMetrics(
  matches: MatchState[],
  profileId?: string,
): SessionMetrics {
  const profiles = matches
    .map((match) => ({
      match,
      player: match.participants.find((item) => item.primaryId === profileId),
    }))
    .filter((item) => item.player);
  const completed = profiles.filter(
    ({ match }) => match.lifecycle === 'completed',
  );
  const wins = completed.filter(({ match }) => isWin(match, profileId)).length;
  const losses = completed.length - wins;
  const goalsFor = profiles.reduce(
    (total, { match, player }) =>
      total +
      (match.teams.find((team) => team.teamNumber === player!.teamNumber)
        ?.score ?? 0),
    0,
  );
  const goalsAgainst = profiles.reduce(
    (total, { match, player }) =>
      total +
      match.teams
        .filter((team) => team.teamNumber !== player!.teamNumber)
        .reduce((sum, team) => sum + team.score, 0),
    0,
  );
  const goals = profiles.reduce((total, item) => total + item.player!.goals, 0);
  const shots = profiles.reduce((total, item) => total + item.player!.shots, 0);
  let eligibleTerritorialMatches = 0;
  let teamPressureTouches = 0;
  let totalPressureTouches = 0;
  let playerPressureTouches = 0;
  let playerTerritorySamples = 0;
  let playerTerritorySum = 0;
  for (const { match, player } of profiles) {
    const analytics = territorialImpactAnalytics(match);
    if (!analytics) continue;
    eligibleTerritorialMatches += 1;
    const team = analytics.teams.find(
      (value) => value.teamNumber === player!.teamNumber,
    );
    const selected = analytics.players.find(
      (value) => value.actor.primaryId === profileId,
    );
    teamPressureTouches += team?.pressureTouches ?? 0;
    totalPressureTouches += analytics.teams.reduce(
      (sum, value) => sum + value.pressureTouches,
      0,
    );
    playerPressureTouches += selected?.pressureTouches ?? 0;
    if (
      selected?.averageNetTerritoryPercent !== undefined &&
      selected.territorySamples
    ) {
      playerTerritorySamples += selected.territorySamples;
      playerTerritorySum +=
        selected.averageNetTerritoryPercent * selected.territorySamples;
    }
  }
  let streak = '—';
  if (completed.length) {
    const last = isWin(completed.at(-1)!.match, profileId);
    let count = 0;
    for (const item of [...completed].reverse()) {
      if (isWin(item.match, profileId) !== last) break;
      count++;
    }
    streak = `${last ? 'W' : 'L'}${count}`;
  }
  return {
    resultDifference: wins - losses,
    record: `${wins}–${losses}`,
    winRate: completed.length
      ? `${Math.round((wins * 100) / completed.length)}%`
      : '—',
    games: matches.length,
    streak,
    goalDifference: goalsFor - goalsAgainst,
    goalsFor,
    goalsAgainst,
    goals,
    assists: profiles.reduce((total, item) => total + item.player!.assists, 0),
    passes: profiles.reduce((total, item) => total + item.player!.passes, 0),
    fifties: profiles.reduce((total, item) => total + item.player!.fifties, 0),
    saves: profiles.reduce((total, item) => total + item.player!.saves, 0),
    shots,
    shootingPercentage: shots ? Math.round((goals * 100) / shots) : undefined,
    averageScore: profiles.length
      ? Math.round(
          profiles.reduce((total, item) => total + item.player!.score, 0) /
            profiles.length,
        )
      : 0,
    demos: profiles.reduce((total, item) => total + item.player!.demos, 0),
    touches: profiles.reduce((total, item) => total + item.player!.touches, 0),
    territorialImpact: eligibleTerritorialMatches
      ? {
          eligibleMatches: eligibleTerritorialMatches,
          teamFieldPressure: totalPressureTouches
            ? teamPressureTouches / totalPressureTouches
            : undefined,
          playerPressureContribution: teamPressureTouches
            ? playerPressureTouches / teamPressureTouches
            : undefined,
          averageNetTerritoryPercent: playerTerritorySamples
            ? playerTerritorySum / playerTerritorySamples
            : undefined,
        }
      : undefined,
  };
}
