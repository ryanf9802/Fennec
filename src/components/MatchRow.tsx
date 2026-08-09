import { ChevronRight, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isWin } from '../domain/metrics';
import {
  formatTeamScore,
  profileTeamNumber,
  resolveTeamPresentation,
} from '../domain/teamPresentation';
import type { MatchState } from '../domain/types';
import { TeamSwatch } from './TeamSwatch';

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function Roster({
  match,
  profileId,
}: {
  match: MatchState;
  profileId?: string;
}) {
  const profile = match.participants.find(
    (item) => item.primaryId === profileId,
  );
  if (profile) {
    const profileTeam = resolveTeamPresentation(
      match.teams,
      profile.teamNumber,
    );
    const teammates = match.participants.filter(
      (player) =>
        player.primaryId !== profileId &&
        player.teamNumber === profile.teamNumber,
    );
    const opponents = match.participants.filter(
      (player) => player.teamNumber !== profile.teamNumber,
    );
    const opponentTeam = resolveTeamPresentation(
      match.teams,
      opponents[0]?.teamNumber ?? (profile.teamNumber === 0 ? 1 : 0),
    );
    return (
      <div className="text-muted mt-1 truncate text-sm">
        <span className="inline-flex items-center gap-2">
          <TeamSwatch team={profileTeam} />
          <span>Teammates:</span>
        </span>{' '}
        <span className="text-main font-bold">
          {teammates.map((player) => player.name).join(', ') || '—'}
        </span>
        <span className="mx-2">·</span>
        <span className="inline-flex items-center gap-2">
          <TeamSwatch team={opponentTeam} />
          <span>Opponents:</span>
        </span>{' '}
        <span className="text-main font-bold">
          {opponents.map((player) => player.name).join(', ') || '—'}
        </span>
      </div>
    );
  }
  const teamNumbers = [
    ...new Set([
      ...match.teams.map((team) => team.teamNumber),
      ...match.participants.map((player) => player.teamNumber),
    ]),
  ].sort((a, b) => a - b);
  return (
    <div className="text-muted mt-1 truncate text-sm">
      {teamNumbers.map((teamNumber, index) => {
        const presentation = resolveTeamPresentation(match.teams, teamNumber);
        return (
          <span key={teamNumber}>
            {index > 0 && <span className="mx-2">·</span>}
            <span className="inline-flex items-center gap-2">
              <TeamSwatch team={presentation} />
              <span>{presentation.name}:</span>
            </span>{' '}
            <span className="text-main font-bold">
              {match.participants
                .filter((player) => player.teamNumber === teamNumber)
                .map((player) => player.name)
                .join(', ') || '—'}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/**
 * Renders a match navigation row with profile-relative results and roster
 * labels, falling back to team data when no tracked profile participated.
 */
export function MatchRow({
  match,
  profileId,
  onNavigate,
}: {
  match: MatchState;
  profileId?: string;
  onNavigate?(): void;
}) {
  const profile = match.participants.find(
    (item) => item.primaryId === profileId,
  );
  const score = formatTeamScore(
    match.teams,
    profileTeamNumber(match, profileId),
  );
  const result =
    match.lifecycle === 'live'
      ? 'LIVE'
      : match.lifecycle === 'incomplete'
        ? 'INCOMPLETE'
        : !profile
          ? '—'
          : isWin(match, profileId)
            ? 'WIN'
            : 'LOSS';
  return (
    <Link
      to={match.lifecycle === 'live' ? '/live' : `/matches/${match.id}`}
      onClick={onNavigate}
      className="surface-flat hover-surface group grid min-w-0 gap-3 rounded-2xl p-4 transition sm:grid-cols-[7rem_1fr_auto] sm:items-center"
    >
      <div className="flex items-center gap-3">
        <span
          className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black tracking-wider ${result === 'WIN' || result === 'LIVE' ? 'bg-cyan-400/15 text-fennec-cyan' : result === 'LOSS' ? 'bg-orange-400/15 text-fennec-orange' : 'surface-strong text-muted'}`}
        >
          {result === 'LIVE' && <Radio className="mr-1 inline size-3" />}
          {result}
        </span>
        <span className="font-extrabold sm:hidden">{score}</span>
      </div>
      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="hidden text-xl font-extrabold sm:inline">
            {score}
          </span>
          <span className="truncate font-bold">{match.playlistName}</span>
          <span className="text-muted text-sm">
            {formatWhen(match.startedAt)}
          </span>
        </div>
        <Roster match={match} profileId={profile?.primaryId} />
      </div>
      <ChevronRight className="text-muted hidden size-5 transition group-hover:translate-x-0.5 sm:block" />
    </Link>
  );
}
