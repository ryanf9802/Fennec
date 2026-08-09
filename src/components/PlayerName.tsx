import type { TeamPresentation } from '../domain/teamPresentation';
import { TeamSwatch } from './TeamSwatch';

/**
 * Renders a participant name with team-aware styling and optional indicators
 * for the tracked profile and bot players.
 */
export function PlayerName({
  name,
  team,
  present = true,
  you = false,
  bot = false,
  nameWeight = 'bold',
  fill = false,
}: {
  name: string;
  team?: TeamPresentation;
  present?: boolean;
  you?: boolean;
  bot?: boolean;
  nameWeight?: 'medium' | 'bold';
  fill?: boolean;
}) {
  const teamName = team ? `${team.name} team` : 'Team unknown';
  const playerStatus = present ? teamName : `${teamName}, no longer in match`;
  return (
    <span
      className={`${fill ? 'flex w-full' : 'inline-flex'} max-w-full min-w-0 items-center gap-2`}
    >
      <span aria-label={playerStatus} title={playerStatus}>
        {team ? (
          <TeamSwatch team={team} present={present} />
        ) : (
          <span className="inline-block size-2.5 shrink-0 rounded-full bg-slate-400" />
        )}
      </span>
      <strong
        title={name}
        className={`min-w-0 truncate ${nameWeight === 'medium' ? 'font-medium' : ''}`}
      >
        {name}
      </strong>
      {you && (
        <span className="text-fennec-cyan inline-flex h-4 shrink-0 items-center text-[0.62rem] font-black leading-none tracking-wider">
          YOU
        </span>
      )}
      {bot && (
        <span className="text-fennec-orange shrink-0 text-[0.62rem] font-black tracking-wider">
          BOT
        </span>
      )}
    </span>
  );
}
