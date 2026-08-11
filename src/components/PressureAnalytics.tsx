import type { CSSProperties } from 'react';
import type {
  TerritorialImpactAnalytics,
  TerritorialPlayerAnalytics,
} from '../domain/analytics';
import {
  profileTeamNumber,
  resolveTeamPresentation,
} from '../domain/teamPresentation';
import type { MatchState } from '../domain/types';
import { PlayerName } from './PlayerName';
import { TeamSwatch } from './TeamSwatch';

function percentage(value: number | undefined): string {
  return value === undefined ? '—' : `${Math.round(value * 100)}%`;
}

function territory(value: number | undefined): string {
  if (value === undefined) return '—';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function ContributionBar({
  player,
  color,
}: {
  player: TerritorialPlayerAnalytics;
  color: string;
}) {
  const contribution = player.pressureContribution;
  const label = `${player.actor.name} team pressure contribution`;
  return (
    <div className="pressure-contribution">
      <span className="font-bold tabular-nums">{percentage(contribution)}</span>
      <span
        className="pressure-contribution-track"
        {...(contribution === undefined
          ? { role: 'img', 'aria-label': `${label} unavailable` }
          : {
              role: 'meter',
              'aria-label': label,
              'aria-valuemin': 0,
              'aria-valuemax': 100,
              'aria-valuenow': Math.round(contribution * 100),
            })}
      >
        {contribution !== undefined && (
          <span
            className="pressure-contribution-fill"
            style={{
              width: `${Math.max(0, Math.min(1, contribution)) * 100}%`,
              backgroundColor: color,
              color,
            }}
          />
        )}
      </span>
    </div>
  );
}

/** Presents transparent team and player territorial-impact metrics. */
export function PressureAnalytics({
  match,
  analytics,
  profileId,
}: {
  match: MatchState;
  analytics: TerritorialImpactAnalytics;
  profileId?: string;
}) {
  const preferredTeam = profileTeamNumber(match, profileId);
  const teams = analytics.teams
    .map((team) => ({
      ...team,
      presentation: resolveTeamPresentation(match.teams, team.teamNumber),
    }))
    .sort((left, right) => {
      const leftPreferred = left.teamNumber === preferredTeam;
      const rightPreferred = right.teamNumber === preferredTeam;
      if (leftPreferred !== rightPreferred) return leftPreferred ? -1 : 1;
      return left.teamNumber - right.teamNumber;
    });
  const teamOrder = new Map(
    teams.map((team, index) => [team.teamNumber, index]),
  );
  const players = [...analytics.players].sort(
    (left, right) =>
      (teamOrder.get(left.actor.teamNumber) ?? Number.MAX_SAFE_INTEGER) -
        (teamOrder.get(right.actor.teamNumber) ?? Number.MAX_SAFE_INTEGER) ||
      right.pressureTouches - left.pressureTouches ||
      left.actor.name.localeCompare(right.actor.name),
  );
  const pressureAvailable = teams.every(
    (team) => team.fieldPressureShare !== undefined,
  );

  const playerTeam = (teamNumber: number) =>
    teams.find((team) => team.teamNumber === teamNumber)?.presentation;

  return (
    <div className="pressure-view space-y-4">
      <section
        aria-label="Team pressure comparison"
        className="pressure-comparison"
      >
        <div className="pressure-team-grid">
          {teams.map((team) => (
            <article
              key={team.teamNumber}
              data-pressure-team={team.teamNumber}
              className="pressure-team-summary"
              style={
                {
                  '--pressure-team-primary': team.presentation.primaryColor,
                } as CSSProperties
              }
            >
              <h3 className="pressure-team-name">
                <TeamSwatch team={team.presentation} className="size-3" />
                <span className="truncate">{team.presentation.name}</span>
              </h3>
              <div className="pressure-touch-total">{team.pressureTouches}</div>
              <div className="eyebrow">Pressure touches</div>
            </article>
          ))}
        </div>

        <div className="pressure-share-block">
          <div className="pressure-share-labels">
            <span className="font-black tabular-nums">
              {percentage(teams[0]?.fieldPressureShare)}
            </span>
            <span className="eyebrow">Field pressure</span>
            <span className="font-black tabular-nums">
              {percentage(teams[1]?.fieldPressureShare)}
            </span>
          </div>
          <div
            className={`pressure-share-track ${pressureAvailable ? '' : 'pressure-share-track--empty'}`}
            role="img"
            aria-label={`Field pressure: ${teams.map((team) => `${team.presentation.name} ${percentage(team.fieldPressureShare)}`).join(', ')}`}
          >
            {pressureAvailable &&
              teams.map((team) => (
                <span
                  key={team.teamNumber}
                  className="pressure-share-fill"
                  style={{
                    width: `${(team.fieldPressureShare ?? 0) * 100}%`,
                    backgroundColor: team.presentation.primaryColor,
                  }}
                />
              ))}
          </div>
        </div>

        <div className="pressure-territory-grid">
          {teams.map((team) => (
            <dl key={team.teamNumber}>
              <dt className="eyebrow">Avg territory</dt>
              <dd className="mt-1 text-lg font-black tabular-nums">
                {territory(team.averageNetTerritoryPercent)}
              </dd>
            </dl>
          ))}
        </div>
      </section>

      <p className="pressure-explanation">
        A pressure touch is unambiguous and made in the opponent&apos;s
        defensive third. Territory measures signed field progress after an
        eligible touch; neither estimates possession or off-ball influence.
      </p>

      <section aria-labelledby="pressure-player-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h3 id="pressure-player-heading" className="font-extrabold">
            Player contribution
          </h3>
          <span className="text-muted text-xs">
            Share of each team&apos;s pressure touches
          </span>
        </div>

        <div className="pressure-player-table surface-flat hidden overflow-hidden rounded-xl md:block">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Pressure and territory contribution by player
            </caption>
            <thead className="text-muted text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Player</th>
                <th className="px-4 py-3 text-right">Pressure touches</th>
                <th className="px-4 py-3">Team contribution</th>
                <th className="px-4 py-3 text-right">Avg territory</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const team = playerTeam(player.actor.teamNumber);
                return (
                  <tr
                    key={player.actor.key}
                    data-pressure-player={player.actor.key}
                    className="pressure-player-row"
                    style={
                      {
                        '--pressure-team-primary': team?.primaryColor,
                      } as CSSProperties
                    }
                  >
                    <th className="px-4 py-3 font-medium">
                      <PlayerName
                        name={player.actor.name}
                        team={team}
                        you={player.actor.primaryId === profileId}
                        nameWeight="medium"
                      />
                    </th>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {player.pressureTouches}
                    </td>
                    <td className="w-[36%] px-4 py-3">
                      <ContributionBar
                        player={player}
                        color={team?.primaryColor ?? '#94a3b8'}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums">
                      {territory(player.averageNetTerritoryPercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul
          aria-label="Pressure and territory contribution by player"
          className="pressure-player-list space-y-2 md:hidden"
        >
          {players.map((player) => {
            const team = playerTeam(player.actor.teamNumber);
            return (
              <li
                key={player.actor.key}
                data-pressure-player={player.actor.key}
                className="pressure-player-card"
                style={
                  {
                    '--pressure-team-primary': team?.primaryColor,
                  } as CSSProperties
                }
              >
                <PlayerName
                  name={player.actor.name}
                  team={team}
                  you={player.actor.primaryId === profileId}
                  nameWeight="medium"
                  fill
                />
                <dl className="pressure-player-metrics">
                  <div>
                    <dt>Pressure touches</dt>
                    <dd>{player.pressureTouches}</dd>
                  </div>
                  <div>
                    <dt>Avg territory</dt>
                    <dd>{territory(player.averageNetTerritoryPercent)}</dd>
                  </div>
                </dl>
                <div>
                  <div className="eyebrow mb-1.5">Team contribution</div>
                  <ContributionBar
                    player={player}
                    color={team?.primaryColor ?? '#94a3b8'}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
