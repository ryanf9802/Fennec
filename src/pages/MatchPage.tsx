import { ArrowLeft, History, Trophy } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { PlayerName } from '../components/PlayerName';
import { PlayerProfileDialog } from '../components/PlayerProfileDialog';
import { Timeline } from '../components/Timeline';
import { formatClock, matchElapsedSeconds } from '../domain/timeline';
import { MatchAnalytics } from '../components/MatchAnalytics';
import { TeamSwatch } from '../components/TeamSwatch';
import {
  playerIdentityKind,
  playerKeyFor,
  playerKeyForPrimaryId,
} from '../domain/playerIdentity';
import {
  formatTeamScore,
  orderedTeams,
  profileTeamNumber,
  resolveTeamPresentation,
  type TeamPresentation,
} from '../domain/teamPresentation';
import type { MatchState, ParticipantState } from '../domain/types';
import { isTrainingMatch } from '../domain/playlists';
import { useMatch, usePlayerHistoryAvailability } from '../data/historyQueries';

const stats: Array<{
  key: keyof ParticipantState;
  full: string;
  short: string;
}> = [
  { key: 'score', full: 'Score', short: 'S' },
  { key: 'goals', full: 'Goals', short: 'G' },
  { key: 'assists', full: 'Assists', short: 'A' },
  { key: 'passes', full: 'Passes', short: 'P' },
  { key: 'fifties', full: '50s', short: '50' },
  { key: 'saves', full: 'Saves', short: 'SV' },
  { key: 'shots', full: 'Shots', short: 'SH' },
  { key: 'touches', full: 'Touches', short: 'T' },
  { key: 'demos', full: 'Demos', short: 'D' },
];

function PlayerRow({
  player,
  team,
  profileId,
  hasHistory,
  onInspect,
}: {
  player: ParticipantState;
  team: TeamPresentation;
  profileId?: string;
  hasHistory: boolean;
  onInspect(playerKey: string, playerName: string): void;
}) {
  const playerKey = playerKeyFor(player);
  const inspectable =
    !!playerKey && playerKey !== playerKeyForPrimaryId(profileId);
  const bot = playerIdentityKind(playerKey) === 'name';
  const profileLabel = `View profile for ${player.name}${player.isPresent === false ? ' (no longer in match)' : ''}`;
  return (
    <tr className="border-t border-ui text-center text-sm">
      <th
        scope="row"
        className="scoreboard-player-cell w-56 min-w-56 px-3 py-3 text-left"
      >
        {inspectable ? (
          <button
            aria-label={profileLabel}
            title={profileLabel}
            className="hover-surface group/player -mx-2 inline-flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:text-fennec-cyan"
            onClick={() => onInspect(playerKey, player.name)}
          >
            <span className="min-w-0 flex-1">
              <PlayerName
                name={player.name}
                team={team}
                present={player.isPresent !== false}
                bot={bot}
                nameWeight="medium"
                fill
              />
            </span>
            {hasHistory && (
              <History
                aria-hidden="true"
                className="text-muted size-3.5 shrink-0 group-hover/player:text-fennec-cyan"
              />
            )}
          </button>
        ) : (
          <PlayerName
            name={player.name}
            team={team}
            present={player.isPresent !== false}
            you={player.primaryId === profileId}
            bot={bot}
            nameWeight="medium"
            fill
          />
        )}
      </th>
      {stats.map(({ key }) => (
        <td
          key={key}
          className={`px-2 py-3 ${key === 'score' ? 'font-bold' : ''}`}
        >
          {player[key] ?? 0}
        </td>
      ))}
    </tr>
  );
}

function TeamScoreboard({
  team,
  score,
  winner,
  players,
  profileId,
  playersWithHistory,
  onInspect,
}: {
  team: TeamPresentation;
  score: number;
  winner: boolean;
  players: ParticipantState[];
  profileId?: string;
  playersWithHistory: Set<string>;
  onInspect(playerKey: string, playerName: string): void;
}) {
  const titleId = `scoreboard-team-${team.teamNumber}`;
  return (
    <section
      aria-labelledby={titleId}
      data-scoreboard-team={team.teamNumber}
      className="scoreboard-team-panel"
      style={
        {
          '--scoreboard-team-primary': team.primaryColor,
        } as CSSProperties
      }
    >
      <div className="scoreboard-team-header flex items-center justify-between gap-4 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <TeamSwatch team={team} />
          <h3
            id={titleId}
            className="truncate text-sm font-black uppercase tracking-[0.14em]"
          >
            {team.name}
          </h3>
          {winner && (
            <Trophy
              aria-label="Winner"
              className="size-4 shrink-0 text-amber-400"
            />
          )}
        </div>
        <div
          aria-label={`${team.name} score ${score}`}
          className="scoreboard-team-score text-2xl font-black tabular-nums"
        >
          {score}
        </div>
      </div>
      <table className="scoreboard-table w-full">
        <caption className="sr-only">{team.name} scoreboard</caption>
        <colgroup>
          <col className="w-56" />
          {stats.map(({ key }) => (
            <col key={key} />
          ))}
        </colgroup>
        <thead className="scoreboard-stat-header eyebrow">
          <tr>
            <th
              scope="col"
              className="scoreboard-player-cell w-56 min-w-56 px-3 py-2.5 text-left"
            >
              Player
            </th>
            {stats.map(({ key, full, short }) => (
              <th key={key} scope="col" className="px-2 py-2.5 text-center">
                <span className="stat-label-full">{full}</span>
                <abbr title={full} className="stat-label-short no-underline">
                  {short}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, index) => (
            <PlayerRow
              key={`${player.shortcut ?? playerKeyFor(player) ?? player.name}:${index}`}
              player={player}
              team={team}
              profileId={profileId}
              hasHistory={playersWithHistory.has(playerKeyFor(player) ?? '')}
              onInspect={onInspect}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function DeleteMatchDialog({
  match,
  deleting,
  error,
  onClose,
  onConfirm,
}: {
  match: MatchState;
  deleting: boolean;
  error?: string;
  onClose(): void;
  onConfirm(): void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="delete-match-title"
      aria-describedby="delete-match-description"
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-3xl bg-transparent p-0 text-main backdrop:bg-black/65"
      onCancel={(event) => {
        if (deleting) event.preventDefault();
      }}
      onClose={() => {
        if (!deleting) onClose();
      }}
      onClick={(event) => {
        if (!deleting && event.target === event.currentTarget) onClose();
      }}
    >
      <div className="surface rounded-3xl p-5 sm:p-7">
        <div className="eyebrow text-fennec-orange">Permanent deletion</div>
        <h2 id="delete-match-title" className="mt-2 text-2xl font-black">
          Delete this match?
        </h2>
        <p id="delete-match-description" className="text-muted mt-3">
          {match.playlistName} from {new Date(match.startedAt).toLocaleString()}{' '}
          will be removed from history and all stats. This cannot be undone.
        </p>
        {error && (
          <div
            role="alert"
            className="surface-flat text-fennec-orange mt-4 rounded-2xl p-4"
          >
            {error}
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className="button-secondary"
            disabled={deleting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? 'Deleting…' : 'Delete match'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * Resolves a supplied, live, or persisted match and presents its scoreboard,
 * analytics, event timeline, and profile-relative player history dialog.
 */
export function MatchPage({ match: supplied }: { match?: MatchState }) {
  const { matchId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { settings, profile, deleteMatch, updateSettings } = useFennec();
  const [profilePlayer, setProfilePlayer] = useState<{
    key: string;
    name: string;
  }>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string>();
  const profileKey = playerKeyForPrimaryId(profile?.primaryId);
  const matchQuery = useMatch(supplied ? undefined : matchId, profileKey);
  const match = supplied ?? matchQuery.data;
  const scoreboardPlayerKeys = (match?.participants ?? [])
    .map(playerKeyFor)
    .filter((playerKey): playerKey is string => !!playerKey);
  const historyAvailabilityQuery = usePlayerHistoryAvailability(
    profileKey,
    scoreboardPlayerKeys,
    match?.id,
  );
  const playersWithHistory = new Set(historyAvailabilityQuery.data ?? []);
  const matchOrigin = (location.state as { matchOrigin?: unknown } | null)
    ?.matchOrigin;
  const sessionOrigin =
    typeof matchOrigin === 'string' && /^\/sessions\/[^/]+$/.test(matchOrigin)
      ? matchOrigin
      : undefined;
  if (!supplied && matchQuery.isLoading)
    return <div className="surface rounded-3xl p-8">Loading match…</div>;
  if (!supplied && matchQuery.isError)
    return (
      <div className="surface rounded-3xl p-8">
        Match history could not be loaded.
      </div>
    );
  if (!match)
    return (
      <div className="surface rounded-3xl p-8">
        <h1 className="text-2xl font-extrabold">Match not found</h1>
        <Link className="button-secondary mt-5" to="/">
          Back to games
        </Link>
      </div>
    );
  const preferredTeamNumber = profileTeamNumber(match, profile?.primaryId);
  const training = isTrainingMatch(match);
  const teams = orderedTeams(match.teams, preferredTeamNumber);
  const canDelete = !supplied && match.lifecycle !== 'live';
  const removeMatch = async () => {
    setDeleting(true);
    setDeleteError(undefined);
    try {
      await deleteMatch(match.id);
      navigate('/', { replace: true });
    } catch (error) {
      setDeleteError(
        `Could not delete match: ${error instanceof Error ? error.message : String(error)}`,
      );
      setDeleting(false);
    }
  };
  return (
    <div className="space-y-6 xl:grid xl:h-[calc(100dvh-4rem)] xl:grid-rows-[auto_auto_minmax(0,1fr)] xl:gap-6 xl:space-y-0">
      <Link
        to={sessionOrigin ?? '/'}
        className="text-muted inline-flex items-center gap-2 text-sm font-bold hover:text-fennec-cyan"
      >
        <ArrowLeft className="size-4" />
        {sessionOrigin ? 'Session detail' : 'Game timeline'}
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          {training && <div className="eyebrow">Live training</div>}
          <h1
            className={`${training ? 'mt-1' : ''} text-3xl font-black sm:text-4xl`}
          >
            {match.playlistName}
          </h1>
          <p className="text-muted mt-2 flex flex-wrap items-center gap-x-1.5">
            {match.arena || 'Arena unavailable'} ·{' '}
            {new Date(match.startedAt).toLocaleString()}
            {canDelete && (
              <>
                <span aria-hidden="true">•</span>
                <button
                  type="button"
                  className="decoration-fennec-orange/70 cursor-pointer underline-offset-4 hover:text-fennec-orange hover:underline"
                  onClick={() => {
                    setDeleteError(undefined);
                    setDeleteOpen(true);
                  }}
                >
                  Delete match
                </button>
              </>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-4xl font-black">
            {formatTeamScore(match.teams, preferredTeamNumber)}
          </div>
          <div className="text-fennec-orange mt-1 font-bold">
            {formatClock(matchElapsedSeconds(match))}
          </div>
        </div>
      </header>
      <div className="grid min-w-0 gap-6 xl:min-h-0 xl:grid-cols-[minmax(0,7fr)_minmax(16.5rem,3fr)]">
        <section className="scoreboard-container min-w-0 xl:min-h-0 xl:overflow-y-auto">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-extrabold">Scoreboard</h2>
            {profile ? (
              <span className="text-muted inline-flex items-center gap-1.5 text-xs font-bold">
                <History className="size-3.5" />
                Select another player to view their profile
              </span>
            ) : (
              <Link
                to="/profile"
                className="text-fennec-cyan text-xs font-bold hover:underline"
              >
                Choose your profile to compare players
              </Link>
            )}
          </div>
          <div className="scoreboard-scroller overflow-x-auto pb-1">
            <div className="scoreboard-stack min-w-[47.25rem] space-y-3">
              {teams.map((team) => {
                const presentation = resolveTeamPresentation(
                  match.teams,
                  team.teamNumber,
                );
                return (
                  <TeamScoreboard
                    key={team.teamNumber}
                    team={presentation}
                    score={team.score}
                    winner={match.winnerTeamNumber === team.teamNumber}
                    players={match.participants
                      .filter((player) => player.teamNumber === team.teamNumber)
                      .sort((a, b) => b.score - a.score)}
                    profileId={profile?.primaryId}
                    playersWithHistory={playersWithHistory}
                    onInspect={(key, name) => setProfilePlayer({ key, name })}
                  />
                );
              })}
            </div>
          </div>
          {!match.participants.length && (
            <div className="surface-flat text-muted mt-3 rounded-2xl p-8 text-center">
              Waiting for player data…
            </div>
          )}
          <div className="mt-6 border-t border-ui pt-6">
            <MatchAnalytics
              match={match}
              profileId={profile?.primaryId}
              speedUnit={settings.speedUnit}
              view={settings.matchAnalyticsView}
              onViewChange={(matchAnalyticsView) =>
                updateSettings({ ...settings, matchAnalyticsView })
              }
            />
          </div>
        </section>
        <section className="flex min-w-0 flex-col xl:min-h-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-extrabold">Event timeline</h2>
            <span className="eyebrow">{settings.timelinePreset}</span>
          </div>
          <div className="timeline-scroller min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-2">
            <Timeline match={match} settings={settings} />
          </div>
        </section>
      </div>
      {profilePlayer && (
        <PlayerProfileDialog
          playerKey={profilePlayer.key}
          playerName={profilePlayer.name}
          onClose={() => setProfilePlayer(undefined)}
        />
      )}
      {deleteOpen && (
        <DeleteMatchDialog
          match={match}
          deleting={deleting}
          error={deleteError}
          onClose={() => {
            if (deleting) return;
            setDeleteOpen(false);
            setDeleteError(undefined);
          }}
          onConfirm={() => void removeMatch()}
        />
      )}
    </div>
  );
}
