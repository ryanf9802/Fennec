import type { EncounterSummary, MatchState } from '../domain/types';
import { recurringTeammates } from '../domain/encounters';

export interface RecurringTeammateSelection {
  playerKey: string;
  playerName: string;
}

/** Shows session-local recurring teammates as text or inspectable player names. */
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
    <div className={className}>
      <div className="text-muted text-sm font-bold">Recurring teammates</div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
        {visible.map((teammate: EncounterSummary) =>
          onSelect ? (
            <button
              key={teammate.playerKey}
              type="button"
              className="hover-surface cursor-pointer rounded-lg px-2 py-1 font-bold text-fennec-cyan"
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
            <span key={teammate.playerKey} className="font-bold text-main">
              {teammate.latestName}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
