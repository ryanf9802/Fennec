import { ChevronRight, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { isWin } from '../domain/metrics';
import type { EncounterSummary, MatchState } from '../domain/types';

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

export function MatchRow({ match, profileId, encounters }: { match: MatchState; profileId?: string; encounters: EncounterSummary[] }) {
  const profile = match.participants.find((item) => item.primaryId === profileId);
  const teams = [...match.teams].sort((a, b) => a.teamNumber - b.teamNumber);
  const score = teams.length >= 2 ? `${teams[0]!.score} – ${teams.at(-1)!.score}` : '—';
  const result = match.lifecycle === 'live' ? 'LIVE' : match.lifecycle === 'incomplete' ? 'INCOMPLETE' : !profile ? '—' : isWin(match, profileId) ? 'WIN' : 'LOSS';
  const familiar = match.participants.flatMap((player) => {
    if (!player.primaryId || player.primaryId === profileId) return [];
    const summary = encounters.find((item) => item.primaryId === player.primaryId);
    if (!summary || summary.gamesTogether + summary.gamesOpposed <= 1) return [];
    return [player.teamNumber === profile?.teamNumber
      ? `${player.name}: ${summary.winsTogether}–${summary.lossesTogether} together`
      : `Faced ${player.name} before`];
  }).slice(0, 2);
  return <Link to={match.lifecycle === 'live' ? '/live' : `/matches/${match.id}`} className="surface-flat hover-surface group grid min-w-0 gap-3 rounded-2xl p-4 transition sm:grid-cols-[7rem_1fr_auto] sm:items-center">
    <div className="flex items-center gap-3">
      <span className={`rounded-full px-2.5 py-1 text-[0.68rem] font-black tracking-wider ${result === 'WIN' || result === 'LIVE' ? 'bg-cyan-400/15 text-fennec-cyan' : result === 'LOSS' ? 'bg-orange-400/15 text-fennec-orange' : 'surface-strong text-muted'}`}>
        {result === 'LIVE' && <Radio className="mr-1 inline size-3" />}{result}
      </span>
      <span className="font-extrabold sm:hidden">{score}</span>
    </div>
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="hidden text-xl font-extrabold sm:inline">{score}</span>
        <span className="truncate font-bold">{match.playlistName}</span>
        <span className="text-muted text-sm">{formatWhen(match.startedAt)}</span>
      </div>
      <div className="text-muted mt-1 truncate text-sm">{profile ? `${profile.goals}G · ${profile.assists}A · ${profile.saves}SV · ${profile.shots}SH` : 'Select your profile to see personal stats'}{familiar.length ? ` · ${familiar.join(' · ')}` : ''}</div>
    </div>
    <ChevronRight className="text-muted hidden size-5 transition group-hover:translate-x-0.5 sm:block" />
  </Link>;
}
