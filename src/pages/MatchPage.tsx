import { ArrowLeft, Radio, Trophy } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { Timeline } from '../components/Timeline';
import { calculateEncounters } from '../domain/encounters';
import type { EncounterSummary, MatchState, ParticipantState } from '../domain/types';

function PlayerRow({ player, match, encounter }: { player: ParticipantState; match: MatchState; encounter?: EncounterSummary }) {
  const { profile } = useFennec();
  const profilePlayer = match.participants.find((item) => item.primaryId === profile?.primaryId);
  const teammate = player.teamNumber === profilePlayer?.teamNumber;
  return <details className="surface-flat group rounded-xl">
    <summary className="grid cursor-pointer list-none grid-cols-[minmax(7rem,1fr)_repeat(5,2.35rem)] items-center gap-2 px-3 py-3 text-center text-sm sm:grid-cols-[minmax(9rem,1fr)_repeat(7,3rem)]">
      <span className="min-w-0 truncate text-left font-bold">{player.name}{player.primaryId === profile?.primaryId && <span className="ml-2 text-[0.65rem] font-black tracking-wider text-fennec-cyan">YOU</span>}</span>
      <span className="font-bold">{player.score}</span><span>{player.goals}</span><span>{player.assists}</span><span>{player.saves}</span><span>{player.shots}</span><span className="hidden sm:inline">{player.touches}</span><span className="hidden sm:inline">{player.demos}</span>
    </summary>
    <div className="text-muted border-t border-ui px-3 py-3 text-sm">{!encounter ? 'First recorded meeting with this player.' : teammate ? `${encounter.gamesTogether} games together · ${encounter.winsTogether}–${encounter.lossesTogether} record · last seen ${new Date(encounter.lastSeen).toLocaleDateString()}` : `Faced ${encounter.gamesOpposed} times · ${encounter.winsAgainst}–${encounter.lossesAgainst} against · first seen ${new Date(encounter.firstSeen).toLocaleDateString()}`}</div>
  </details>;
}

export function MatchPage({ match: supplied }: { match?: MatchState }) {
  const { matchId } = useParams();
  const { matches, settings, profile } = useFennec();
  const match = supplied ?? matches.find((item) => item.id === matchId);
  if (!match) return <div className="surface rounded-3xl p-8"><h1 className="text-2xl font-extrabold">Match not found</h1><Link className="button-secondary mt-5" to="/">Back to games</Link></div>;
  const priorEncounters = calculateEncounters(matches.filter((item) => item.startedAt < match.startedAt), profile?.primaryId);
  const teams = [...match.teams].sort((a, b) => a.teamNumber - b.teamNumber);
  return <div className="space-y-6">
    <Link to="/" className="text-muted inline-flex items-center gap-2 text-sm font-bold hover:text-fennec-cyan"><ArrowLeft className="size-4" />Game timeline</Link>
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><div className="eyebrow flex items-center gap-2">{match.lifecycle === 'live' && <Radio className="size-3 text-fennec-cyan" />}{match.lifecycle} match</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">{match.playlistName}</h1><p className="text-muted mt-2">{match.arena || 'Arena unavailable'} · {new Date(match.startedAt).toLocaleString()}</p></div>
      <div className="text-right"><div className="text-4xl font-black">{teams.length > 1 ? `${teams[0]!.score} – ${teams.at(-1)!.score}` : '—'}</div><div className="text-fennec-orange mt-1 font-bold">{match.isOvertime ? 'OVERTIME · ' : ''}{Math.floor(match.timeSeconds / 60)}:{String(match.timeSeconds % 60).padStart(2, '0')}</div></div>
    </header>
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
      <section className="min-w-0 space-y-4">
        <div className="flex items-center justify-between"><h2 className="text-xl font-extrabold">Scoreboard</h2><div className="eyebrow hidden grid-cols-7 gap-3 sm:grid"><span>Score</span><span>G</span><span>A</span><span>SV</span><span>SH</span><span>T</span><span>D</span></div></div>
        {teams.map((team) => <div key={team.teamNumber} className="space-y-2">
          <div className="flex items-center gap-2 px-1 text-sm font-black uppercase tracking-wider"><span className={`size-2.5 rounded-full ${team.teamNumber === 0 ? 'bg-fennec-cyan' : 'bg-fennec-orange'}`} />{team.name || `Team ${team.teamNumber + 1}`}{match.winnerTeamNumber === team.teamNumber && <Trophy className="size-4 text-amber-400" />}</div>
          {match.participants.filter((player) => player.teamNumber === team.teamNumber).sort((a, b) => b.score - a.score).map((player) => <PlayerRow key={player.primaryId ?? player.name} player={player} match={match} encounter={priorEncounters.find((item) => item.primaryId === player.primaryId)} />)}
        </div>)}
        {!match.participants.length && <div className="surface-flat text-muted rounded-2xl p-8 text-center">Waiting for player data…</div>}
      </section>
      <section className="min-w-0"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-extrabold">Event timeline</h2><span className="eyebrow">{settings.timelinePreset}</span></div><Timeline match={match} settings={settings} /></section>
    </div>
  </div>;
}
