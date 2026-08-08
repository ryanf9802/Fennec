import { ArrowLeft, History, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { PlayerName } from '../components/PlayerName';
import { PlayerProfileDialog } from '../components/PlayerProfileDialog';
import { Timeline } from '../components/Timeline';
import { MatchAnalytics } from '../components/MatchAnalytics';
import { playerIdentityKind, playerKeyFor, playerKeyForPrimaryId } from '../domain/playerIdentity';
import { formatTeamScore, orderedTeams, profileTeamNumber } from '../domain/teamPresentation';
import type { MatchState, ParticipantState } from '../domain/types';
import { useMatch } from '../data/historyQueries';

const stats: Array<{ key: keyof ParticipantState; full: string; short: string }> = [
  { key: 'score', full: 'Score', short: 'Score' },
  { key: 'goals', full: 'Goals', short: 'G' },
  { key: 'assists', full: 'Assists', short: 'A' },
  { key: 'saves', full: 'Saves', short: 'SV' },
  { key: 'shots', full: 'Shots', short: 'SH' },
  { key: 'touches', full: 'Touches', short: 'T' },
  { key: 'carTouches', full: 'Car touches', short: 'CT' },
  { key: 'demos', full: 'Demos', short: 'D' },
];

function PlayerRow({ player, profileId, onInspect }: { player: ParticipantState; profileId?: string; onInspect(playerKey: string, playerName: string): void }) {
  const playerKey = playerKeyFor(player);
  const inspectable = !!playerKey && playerKey !== playerKeyForPrimaryId(profileId);
  const bot = playerIdentityKind(playerKey) === 'name';
  return <tr className="border-t border-ui text-center text-sm">
    <th scope="row" className="scoreboard-player-cell px-3 py-3 text-left">
      {inspectable
        ? <button aria-label={`View profile for ${player.name}`} title={`View profile for ${player.name}`} className="hover-surface group/player -mx-2 inline-flex w-[calc(100%+1rem)] cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1 text-left hover:text-fennec-cyan" onClick={() => onInspect(playerKey, player.name)}><span className="min-w-0"><PlayerName name={player.name} teamNumber={player.teamNumber} bot={bot} nameWeight="medium" />{player.isPresent === false && <span className="text-muted ml-2 text-[0.62rem] font-black tracking-wider">LEFT</span>}</span><History aria-hidden="true" className="text-muted size-3.5 shrink-0 group-hover/player:text-fennec-cyan" /></button>
        : <><PlayerName name={player.name} teamNumber={player.teamNumber} you={player.primaryId === profileId} bot={bot} nameWeight="medium" />{player.isPresent === false && <span className="text-muted ml-2 text-[0.62rem] font-black tracking-wider">LEFT</span>}</>}
    </th>
    {stats.map(({ key }) => <td key={key} className={`px-2 py-3 ${key === 'score' ? 'font-bold' : ''}`}>{player[key] ?? 0}</td>)}
  </tr>;
}

export function MatchPage({ match: supplied }: { match?: MatchState }) {
  const { matchId } = useParams();
  const { settings, profile } = useFennec();
  const [profilePlayer, setProfilePlayer] = useState<{ key: string; name: string }>();
  const matchQuery = useMatch(supplied ? undefined : matchId);
  const match = supplied ?? matchQuery.data;
  if (!supplied && matchQuery.isLoading) return <div className="surface rounded-3xl p-8">Loading match…</div>;
  if (!supplied && matchQuery.isError) return <div className="surface rounded-3xl p-8">Match history could not be loaded.</div>;
  if (!match) return <div className="surface rounded-3xl p-8"><h1 className="text-2xl font-extrabold">Match not found</h1><Link className="button-secondary mt-5" to="/">Back to games</Link></div>;
  const preferredTeamNumber = profileTeamNumber(match, profile?.primaryId);
  const teams = orderedTeams(match.teams, preferredTeamNumber);
  return <div className="space-y-6 xl:grid xl:h-[calc(100dvh-4rem)] xl:grid-rows-[auto_auto_minmax(0,1fr)] xl:gap-6 xl:space-y-0">
    <Link to="/" className="text-muted inline-flex items-center gap-2 text-sm font-bold hover:text-fennec-cyan"><ArrowLeft className="size-4" />Game timeline</Link>
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="text-3xl font-black sm:text-4xl">{match.playlistName}</h1><p className="text-muted mt-2">{match.arena || 'Arena unavailable'} · {new Date(match.startedAt).toLocaleString()}</p></div>
      <div className="text-right"><div className="text-4xl font-black">{formatTeamScore(match.teams, preferredTeamNumber)}</div><div className="text-fennec-orange mt-1 font-bold">{match.isOvertime ? 'OVERTIME · ' : ''}{Math.floor(match.timeSeconds / 60)}:{String(match.timeSeconds % 60).padStart(2, '0')}</div></div>
    </header>
    <div className="grid min-w-0 gap-6 xl:min-h-0 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]">
      <section className="scoreboard-container min-w-0 xl:min-h-0 xl:overflow-y-auto">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-extrabold">Scoreboard</h2>{profile ? <span className="text-muted inline-flex items-center gap-1.5 text-xs font-bold"><History className="size-3.5" />Select another player to view their profile</span> : <Link to="/profile" className="text-fennec-cyan text-xs font-bold hover:underline">Choose your profile to compare players</Link>}</div>
        <div className="overflow-x-auto rounded-2xl"><table className="scoreboard-table surface-flat w-full min-w-[50rem] overflow-hidden rounded-2xl">
          <colgroup><col className="w-[28%]" />{stats.map(({ key }) => <col key={key} className="w-[9%]" />)}</colgroup>
          <thead className="eyebrow"><tr><th scope="col" className="scoreboard-player-cell px-3 py-3 text-left">Player</th>{stats.map(({ key, full, short }) => <th key={key} scope="col" className="px-2 py-3 text-center"><span className="stat-label-full">{full}</span><abbr title={full} className="stat-label-short no-underline">{short}</abbr></th>)}</tr></thead>
          {teams.map((team) => <tbody key={team.teamNumber}>
            <tr className="border-t border-ui"><th colSpan={stats.length + 1} className="px-3 py-2 text-left text-sm font-black uppercase tracking-wider"><span className={`mr-2 inline-block size-2.5 rounded-full ${team.teamNumber === 0 ? 'bg-fennec-cyan' : 'bg-fennec-orange'}`} />{team.name || `Team ${team.teamNumber + 1}`}{match.winnerTeamNumber === team.teamNumber && <Trophy className="ml-2 inline size-4 text-amber-400" />}</th></tr>
            {match.participants.filter((player) => player.teamNumber === team.teamNumber).sort((a, b) => b.score - a.score).map((player, index) => <PlayerRow key={`${player.shortcut ?? playerKeyFor(player) ?? player.name}:${index}`} player={player} profileId={profile?.primaryId} onInspect={(key, name) => setProfilePlayer({ key, name })} />)}
          </tbody>)}
        </table></div>
        {!match.participants.length && <div className="surface-flat text-muted mt-3 rounded-2xl p-8 text-center">Waiting for player data…</div>}
        <div className="mt-6 border-t border-ui pt-6"><MatchAnalytics match={match} profileId={profile?.primaryId} /></div>
      </section>
      <section className="flex min-w-0 flex-col xl:min-h-0"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-extrabold">Event timeline</h2><span className="eyebrow">{settings.timelinePreset}</span></div><div className="timeline-scroller min-h-0 xl:flex-1 xl:overflow-y-auto xl:overscroll-contain xl:pr-2"><Timeline match={match} settings={settings} /></div></section>
    </div>
    {profilePlayer && <PlayerProfileDialog playerKey={profilePlayer.key} playerName={profilePlayer.name} onClose={() => setProfilePlayer(undefined)} />}
  </div>;
}
