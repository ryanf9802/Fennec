import { ArrowUpRight, CalendarDays, Radio, Square } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { EmptyState } from '../components/EmptyState';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { MatchRow } from '../components/MatchRow';
import { MetricsGrid } from '../components/MetricsGrid';
import { sessionMetrics } from '../domain/metrics';
import { formatClock, matchElapsedSeconds } from '../domain/timeline';
import { formatTeamScore, profileTeamNumber } from '../domain/teamPresentation';
import { useSessions } from '../data/historyQueries';

function sessionTitle(startedAt: string, current: boolean): string {
  if (current) return 'Current session';
  const date = new Date(startedAt);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Earlier today';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(date);
}

/**
 * Presents live and historical sessions, selecting the active session while
 * coordinating loading, pagination, and empty-history states.
 */
export function GamesPage() {
  const { activeMatch, profile, connection, endSession } = useFennec();
  const [endingSession, setEndingSession] = useState(false);
  const [sessionMessage, setSessionMessage] = useState<string>();
  const sessionsQuery = useSessions();
  const orderedSessions =
    sessionsQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const current = orderedSessions[0];
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
            : activeMatch
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

      {sessionsQuery.isError && (
        <div className="surface-flat text-fennec-orange rounded-2xl p-5">
          Match history could not be loaded.
        </div>
      )}

      {activeMatch && (
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
                <div className="eyebrow text-fennec-cyan">Live now</div>
                <h2 className="mt-0.5 text-xl font-extrabold sm:text-2xl">
                  {activeMatch.playlistName}
                </h2>
                <p className="text-muted mt-1 text-sm">
                  {activeMatch.arena || 'Waiting for match state'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-3xl font-black">
                  {formatTeamScore(
                    activeMatch.teams,
                    profileTeamNumber(activeMatch, profile?.primaryId),
                  )}
                </div>
                <div className="text-fennec-orange text-sm font-bold">
                  {formatClock(matchElapsedSeconds(activeMatch))}
                </div>
              </div>
              <ArrowUpRight className="text-muted size-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
          </div>
        </Link>
      )}

      {!sessionsQuery.isLoading && !orderedSessions.length && !activeMatch ? (
        <EmptyState />
      ) : (
        current && (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="eyebrow text-fennec-cyan">In focus</div>
                <h2 className="mt-1 text-2xl font-extrabold">
                  {current.endedManually && !activeMatch
                    ? 'Latest session'
                    : 'Current session'}
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                {current.endedManually && !activeMatch ? (
                  <span className="text-muted text-sm font-bold">
                    Session ended
                  </span>
                ) : (
                  <button
                    className="button-secondary"
                    disabled={endingSession}
                    onClick={() => void handleEndSession()}
                  >
                    <Square className="size-3.5 fill-current" />
                    {endingSession ? 'Ending…' : 'End session'}
                  </button>
                )}
                <Link
                  className="text-fennec-cyan flex items-center gap-1 text-sm font-bold"
                  to={`/sessions/${current.id}`}
                >
                  Full session <ArrowUpRight className="size-4" />
                </Link>
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
            <div className="surface rounded-3xl p-5 sm:p-6">
              <MetricsGrid
                metrics={sessionMetrics(current.matches, profile?.primaryId)}
              />
            </div>
            <div className="space-y-2">
              {[...current.matches].reverse().map((match) => (
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

      {orderedSessions.slice(1).length > 0 && (
        <section className="space-y-4">
          <div>
            <div className="eyebrow">History</div>
            <h2 className="mt-1 text-2xl font-extrabold">Past sessions</h2>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {orderedSessions.slice(1).map((session) => {
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
                        {sessionTitle(session.startedAt, false)}
                      </div>
                      <div className="text-muted mt-1 text-sm">
                        {session.matches.length} game
                        {session.matches.length === 1 ? '' : 's'} ·{' '}
                        {metrics.record} · {metrics.winRate}
                      </div>
                    </div>
                    <ArrowUpRight className="text-muted size-5 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                  </div>
                  <div className="mt-4">
                    <MetricsGrid metrics={metrics} compact />
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
