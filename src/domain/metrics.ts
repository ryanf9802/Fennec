import type { MatchState, SessionMetrics } from './types';

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
    record: `${wins}–${completed.length - wins}`,
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
  };
}
