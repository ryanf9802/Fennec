import type { EncounterSummary, MatchState } from '../domain/types';
import { recurringTeammates } from '../domain/encounters';

export interface RecurringTeammateSelection {
  playerKey: string;
  playerName: string;
}

/** Shows session-local recurring teammates inline with existing session metadata. */
export function RecurringTeammates({
  matches,
  profileId,
  limit,
  onSelect,
  className = '',
}: {
  matches: MatchState[];
  profileId?: string;
  limit?: number;
  onSelect?(player: RecurringTeammateSelection): void;
  className?: string;
}) {
  const recurring = recurringTeammates(matches, profileId);
  const visible = limit === undefined ? recurring : recurring.slice(0, limit);
  if (!visible.length) return null;
  return (
    <span
      role="group"
      aria-label="Recurring teammates"
      className={`min-w-0 text-sm ${className}`}
    >
      <span className="text-muted">with </span>
      {visible.map((teammate: EncounterSummary, index) => (
        <span key={teammate.playerKey}>
          {index > 0 && <span className="text-muted">, </span>}
          {onSelect ? (
            <button
              type="button"
              className="cursor-pointer font-bold text-fennec-cyan hover:underline"
              aria-label={`View profile for ${teammate.latestName}`}
              onClick={() =>
                onSelect({
                  playerKey: teammate.playerKey,
                  playerName: teammate.latestName,
                })
              }
            >
              {teammate.latestName}
            </button>
          ) : (
            <span className="font-bold text-main">{teammate.latestName}</span>
          )}
        </span>
      ))}
    </span>
  );
}
