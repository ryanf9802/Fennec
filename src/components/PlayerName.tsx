/**
 * Renders a participant name with team-aware styling and optional indicators
 * for the tracked profile and bot players.
 */
export function PlayerName({
  name,
  teamNumber,
  present = true,
  you = false,
  bot = false,
  nameWeight = 'bold',
  fill = false,
}: {
  name: string;
  teamNumber?: number;
  present?: boolean;
  you?: boolean;
  bot?: boolean;
  nameWeight?: 'medium' | 'bold';
  fill?: boolean;
}) {
  const teamName =
    teamNumber === 0
      ? 'Blue team'
      : teamNumber === 1
        ? 'Orange team'
        : 'Team unknown';
  const playerStatus = present ? teamName : `${teamName}, no longer in match`;
  return (
    <span
      className={`${fill ? 'flex w-full' : 'inline-flex'} max-w-full min-w-0 items-center gap-2`}
    >
      <span
        aria-label={playerStatus}
        title={playerStatus}
        className={`inline-block size-2.5 shrink-0 rounded-full ${!present ? 'bg-slate-400' : teamNumber === 0 ? 'bg-fennec-cyan' : teamNumber === 1 ? 'bg-fennec-orange' : 'bg-slate-400'}`}
      />
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
