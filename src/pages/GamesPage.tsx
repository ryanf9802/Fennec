import {
  ArrowUpRight,
  CalendarDays,
  Radio,
  Square,
  UserRound,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { EmptyState } from '../components/EmptyState';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { MatchRow } from '../components/MatchRow';
import { RecurringTeammates } from '../components/RecurringTeammates';
import { SessionSummaryStats } from '../components/SessionStats';
import { sessionMetrics } from '../domain/metrics';
import { sessionIdleGapElapsed } from '../domain/sessions';
import { formatClock, matchElapsedSeconds } from '../domain/timeline';
import { formatTeamScore, profileTeamNumber } from '../domain/teamPresentation';
import { playerKeyForPrimaryId } from '../domain/playerIdentity';
import { isTrainingMatch } from '../domain/playlists';
import { matchBelongsToProfile } from '../domain/profileScope';
import { useSessions } from '../data/historyQueries';

function sessionTitle(startedAt: string): string {
  const date = new Date(startedAt);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Earlier today';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

function sessionTimeRange(startedAt: string, endedAt: string): string {
  const format = (value: string) =>
    new Date(value).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
  return `${format(startedAt)} – ${format(endedAt)}`;
}

/**
 * Presents live and historical sessions, selecting the active session while
 * coordinating loading, pagination, and empty-history states.
 */
export function GamesPage() {
  const { activeMatch, profile, connection, endSession, settings } =
    useFennec();
  const [endingSession, setEndingSession] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string>();
  const [deadlineClock, setDeadlineClock] = useState(() => Date.now());
  const profileKey = playerKeyForPrimaryId(profile?.primaryId);
  const sessionsQuery = useSessions(profileKey);
  const visibleActiveMatch =
    activeMatch && matchBelongsToProfile(activeMatch, profile?.primaryId)
      ? activeMatch
      : undefined;
  const trainingActive = visibleActiveMatch
    ? isTrainingMatch(visibleActiveMatch)
    : false;
  const orderedSessions =
    sessionsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const current = orderedSessions[0];
  const idleDeadline = current
    ? new Date(current.endedAt).getTime() + settings.sessionGapMinutes * 60_000
    : undefined;
  useEffect(() => {
    if (
      visibleActiveMatch ||
      !current ||
      current.endedManually ||
      idleDeadline === undefined
    )
      return;
    const remaining = idleDeadline - Date.now();
    const timer = window.setTimeout(
      () => setDeadlineClock(Date.now()),
      remaining > 0 ? remaining + 25 : 0,
    );
    return () => window.clearTimeout(timer);
  }, [visibleActiveMatch, current, idleDeadline]);
  const currentIsClosed = Boolean(
    current &&
    !visibleActiveMatch &&
    (current.endedManually ||
      sessionIdleGapElapsed(
        current,
        settings.sessionGapMinutes,
        deadlineClock,
      )),
  );
  const focusedSession = currentIsClosed ? undefined : current;
  const pastSessions = currentIsClosed
    ? orderedSessions
    : orderedSessions.slice(1);
  const handleEndSession = async () => {
    setEndingSession(true);
    setSessionMessage(undefined);
    try {
      const result = await endSession();
      setSessionMessage(
        result === 'split-live'
          ? 'New session started for the live game.'
          : result === 'ended'
            ? 'Session ended. The next game will start a new session.'
            : visibleActiveMatch
              ? 'This live game already starts a new session.'
              : 'Session is already ended.',
      );
    } catch (error) {
      setSessionMessage(
        `Could not end the session: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setEndingSession(false);
    }
  };
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
            Game timeline
          </h1>
          <p className="text-muted mt-2">
            Every match, automatically grouped into sessions.
          </p>
        </div>
        <ConnectionStatus
          connection={connection}
          className="surface-flat rounded-xl px-3 py-2 text-sm"
        />
      </header>

      {!profile && (
        <section className="surface rounded-3xl border-cyan-300/30 px-6 py-12 text-center ring-2 ring-cyan-400/40">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-cyan-400/15 text-fennec-cyan">
            <UserRound className="size-7" />
          </div>
          <h2 className="mt-5 text-xl font-extrabold">Choose your player</h2>
          <p className="text-muted mx-auto mt-2 max-w-md">
            Select the player whose games and spectated matches you want Fennec
            to show.
          </p>
          <Link className="button-primary mt-6" to="/profile#player-selection">
            Select your player
          </Link>
        </section>
      )}

      {profile && sessionsQuery.isError && (
        <div className="surface-flat text-fennec-orange rounded-2xl p-5">
          Match history could not be loaded.
        </div>
      )}

      {visibleActiveMatch && (
        <Link
          to="/live"
          className="surface group relative block overflow-hidden rounded-3xl border-cyan-300/30 p-5 sm:p-6"
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-fennec-cyan to-blue-500" />
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              <span className="live-pulse flex size-11 items-center justify-center rounded-full bg-cyan-400/15 text-fennec-cyan">
                <Radio className="size-5" />
              </span>
              <div>
                <div className="eyebrow text-fennec-cyan">
                  {trainingActive ? 'Training now' : 'Live now'}
                </div>
                <h2 className="mt-0.5 text-xl font-extrabold sm:text-2xl">
                  {visibleActiveMatch.playlistName}
                </h2>
                <p className="text-muted mt-1 text-sm">
                  {visibleActiveMatch.arena || 'Waiting for match state'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-3xl font-black">
                  {formatTeamScore(
                    visibleActiveMatch.teams,
                    profileTeamNumber(visibleActiveMatch, profile?.primaryId),
                  )}
                </div>
                <div className="text-fennec-orange text-sm font-bold">
                  {formatClock(matchElapsedSeconds(visibleActiveMatch))}
                </div>
              </div>
              <ArrowUpRight className="text-muted size-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </Link>
      )}

      {profile &&
      !sessionsQuery.isLoading &&
      !orderedSessions.length &&
      !visibleActiveMatch ? (
        <EmptyState />
      ) : (
        profile &&
        focusedSession && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-fennec-cyan">In focus</div>
                <h2 className="mt-1 text-2xl font-extrabold">
                  Current session
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <button
                  className="button-secondary"
                  disabled={endingSession}
                  onClick={() => void handleEndSession()}
                >
                  <Square className="size-3.5 fill-current" />
                  {endingSession ? 'Ending…' : 'End session'}
                </button>
              </div>
            </div>
            {sessionMessage && (
              <p
                className="text-muted text-sm"
                role="status"
                aria-live="polite"
              >
                {sessionMessage}
              </p>
            )}
            <Link
              to={`/sessions/${focusedSession.id}`}
              aria-label="View current session details"
              className="surface hover-surface group relative block rounded-3xl p-5 transition sm:p-6"
            >
              <ArrowUpRight className="text-muted absolute top-5 right-5 size-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              <div className="pr-8">
                <SessionSummaryStats
                  metrics={sessionMetrics(
                    focusedSession.matches,
                    profile?.primaryId,
                  )}
                />
              </div>
              <RecurringTeammates
                className="mt-5 border-t border-ui pt-5"
                matches={focusedSession.matches}
                profileId={profile?.primaryId}
                limit={2}
              />
            </Link>
            <div className="space-y-2">
              {[...focusedSession.matches].reverse().map((match) => (
                <MatchRow
                  key={match.id}
                  match={match}
                  profileId={profile?.primaryId}
                />
              ))}
            </div>
          </section>
        )
      )}

      {currentIsClosed && (
        <section className="surface rounded-3xl p-5 sm:p-6">
          <div className="eyebrow text-fennec-cyan">Between sessions</div>
          <h2 className="mt-1 text-2xl font-extrabold">
            Ready for a new session?
          </h2>
          <p className="text-muted mt-2">
            Start a new match in Rocket League to begin a new session.
          </p>
          {sessionMessage && (
            <p className="text-muted mt-3 text-sm" role="status">
              {sessionMessage}
            </p>
          )}
        </section>
      )}

      {pastSessions.length > 0 && (
        <section className="space-y-4">
          <div>
            <div className="eyebrow">History</div>
            <h2 className="mt-1 text-2xl font-extrabold">Past sessions</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {pastSessions.map((session) => {
              const metrics = sessionMetrics(
                session.matches,
                profile?.primaryId,
              );
              return (
                <Link
                  key={session.id}
                  to={`/sessions/${session.id}`}
                  className="surface-flat hover-surface group rounded-2xl p-5 transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 font-extrabold">
                        <CalendarDays className="text-fennec-cyan size-4" />
                        {sessionTitle(session.startedAt)}
                      </div>
                      <div className="text-muted mt-1 text-sm">
                        {sessionTimeRange(session.startedAt, session.endedAt)}
                      </div>
                    </div>
                    <ArrowUpRight className="text-muted size-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <RecurringTeammates
                    className="mt-4 border-t border-ui pt-4"
                    matches={session.matches}
                    profileId={profile?.primaryId}
                    limit={2}
                  />
                  <div className="mt-4">
                    <SessionSummaryStats metrics={metrics} />
                  </div>
                </Link>
              );
            })}
          </div>
          {sessionsQuery.hasNextPage && (
            <button
              className="button-secondary mx-auto"
              disabled={sessionsQuery.isFetchingNextPage}
              onClick={() => void sessionsQuery.fetchNextPage()}
            >
              {sessionsQuery.isFetchingNextPage
                ? 'Loading…'
                : 'Load older sessions'}
            </button>
          )}
        </section>
      )}
    </div>
  );
}
