import type { TerritorialImpactAnalytics } from '../domain/analytics';
import { resolveTeamPresentation } from '../domain/teamPresentation';
import type { MatchState } from '../domain/types';

function percentage(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function territory(value: number | undefined): string {
  if (value === undefined) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/** Presents transparent team and player territorial-impact metrics. */
export function PressureAnalytics({
  match,
  analytics,
}: {
  match: MatchState;
  analytics: TerritorialImpactAnalytics;
}) {
  const teams = analytics.teams.map((team) => ({
    ...team,
    presentation: resolveTeamPresentation(match.teams, team.teamNumber),
  }));
  const players = [...analytics.players].sort(
    (left, right) =>
      left.actor.teamNumber - right.actor.teamNumber ||
      right.pressureTouches - left.pressureTouches ||
      left.actor.name.localeCompare(right.actor.name),
  );

  return (
    <div className="space-y-4">
      <p className="text-muted text-xs">
        Pressure counts unambiguous touches made in the opponent&apos;s
        defensive third. Territory is the average signed field progress after
        each eligible touch. Neither metric estimates possession or off-ball
        influence.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <article
            key={team.teamNumber}
            className="surface-flat rounded-xl border-l-4 p-4"
            style={{ borderLeftColor: team.presentation.primaryColor }}
          >
            <h3 className="font-extrabold">{team.presentation.name}</h3>
            <dl className="mt-3 grid grid-cols-3 gap-3">
              <div>
                <dt className="eyebrow">Pressure touches</dt>
                <dd className="metric-value mt-1">{team.pressureTouches}</dd>
              </div>
              <div>
                <dt className="eyebrow">Field pressure</dt>
                <dd className="metric-value mt-1">
                  {percentage(team.fieldPressureShare)}
                </dd>
              </div>
              <div>
                <dt className="eyebrow">Avg territory</dt>
                <dd className="metric-value mt-1">
                  {territory(team.averageNetTerritoryPercent)}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <div className="surface-flat overflow-x-auto rounded-xl">
        <table className="w-full min-w-[38rem] text-left text-sm">
          <caption className="sr-only">
            Pressure and territory contribution by player
          </caption>
          <thead className="text-muted text-xs uppercase tracking-wider">
            <tr>
              <th className="px-4 py-3">Player</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3 text-right">Pressure touches</th>
              <th className="px-4 py-3 text-right">Team contribution</th>
              <th className="px-4 py-3 text-right">Avg territory</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const team = teams.find(
                (value) => value.teamNumber === player.actor.teamNumber,
              );
              return (
                <tr key={player.actor.key} className="border-main/10 border-t">
                  <th className="px-4 py-3 font-bold">{player.actor.name}</th>
                  <td className="px-4 py-3">
                    {team?.presentation.name ??
                      `Team ${player.actor.teamNumber}`}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {player.pressureTouches}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {percentage(player.pressureContribution)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {territory(player.averageNetTerritoryPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
