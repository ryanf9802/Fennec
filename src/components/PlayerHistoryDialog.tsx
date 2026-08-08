import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import type { PlayerAverages, PlayerHistory, RelationshipHistory } from '../domain/playerHistory';

const statRows: Array<[string, keyof PlayerAverages]> = [
  ['Score', 'score'], ['Goals', 'goals'], ['Assists', 'assists'], ['Saves', 'saves'], ['Shots', 'shots'], ['Touches', 'touches'], ['Demos', 'demos'],
];

function RelationshipPanel({ title, history, playerName }: { title: string; history: RelationshipHistory; playerName: string }) {
  return <section className="surface-flat rounded-2xl p-4 sm:p-5">
    <div className="flex items-start justify-between gap-4"><div><div className="eyebrow">{title}</div><div className="mt-1 text-2xl font-black">{history.games} game{history.games === 1 ? '' : 's'}</div></div><div className="text-right"><div className="font-extrabold">{history.wins}–{history.losses}</div><div className="text-muted text-sm">{history.winRate === undefined ? 'No completed games' : `${history.winRate}% win rate`}</div></div></div>
    <div className="mt-4 grid grid-cols-2 gap-3 border-y border-ui py-4 text-sm sm:grid-cols-4">
      <div><div className="eyebrow">Goals for</div><div className="mt-1 font-extrabold">{history.goalsFor} <span className="text-muted font-normal">({history.goalsForPerGame}/g)</span></div></div>
      <div><div className="eyebrow">Goals against</div><div className="mt-1 font-extrabold">{history.goalsAgainst} <span className="text-muted font-normal">({history.goalsAgainstPerGame}/g)</span></div></div>
      <div><div className="eyebrow">First</div><div className="mt-1 font-bold">{history.firstSeen ? new Date(history.firstSeen).toLocaleDateString() : '—'}</div></div>
      <div><div className="eyebrow">Latest</div><div className="mt-1 font-bold">{history.lastSeen ? new Date(history.lastSeen).toLocaleDateString() : '—'}</div></div>
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[20rem] text-sm"><thead><tr className="text-muted"><th className="pb-2 text-left font-bold">Per game</th><th className="pb-2 text-right font-bold">You</th><th className="pb-2 text-right font-bold">{playerName}</th></tr></thead><tbody>{statRows.map(([label, key]) => <tr key={key} className="border-t border-ui"><th className="py-2 text-left font-medium">{label}</th><td className="py-2 text-right font-mono">{history.you[key]}</td><td className="py-2 text-right font-mono">{history.player[key]}</td></tr>)}</tbody></table></div>
  </section>;
}

export function PlayerHistoryDialog({ history, onClose }: { history: PlayerHistory; onClose(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
  }, []);
  return <dialog ref={ref} aria-labelledby="player-history-title" className="player-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(72rem,calc(100vw-2rem))] overflow-hidden rounded-3xl bg-transparent p-0 text-main backdrop:bg-black/65" onClose={onClose} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="surface max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl p-5 sm:p-7">
      <header className="flex items-start justify-between gap-4"><div><div className="eyebrow">Player history</div><h2 id="player-history-title" className="mt-1 text-3xl font-black">{history.latestName}</h2><p className="text-muted mt-2">{history.totalMeetings} tracked meeting{history.totalMeetings === 1 ? '' : 's'} · {new Date(history.firstSeen).toLocaleDateString()} – {new Date(history.lastSeen).toLocaleDateString()}</p></div><button aria-label="Close player history" className="hover-surface flex size-10 shrink-0 items-center justify-center rounded-xl" onClick={onClose}><X className="size-5" /></button></header>
      <div className="mt-6 grid gap-4 lg:grid-cols-2"><RelationshipPanel title="Played together" history={history.together} playerName={history.latestName} /><RelationshipPanel title="Played against" history={history.against} playerName={history.latestName} /></div>
      <section className="mt-6"><h3 className="text-xl font-extrabold">Recent meetings</h3><div className="mt-3 space-y-2">{history.recent.map((meeting) => <Link key={meeting.matchId} to={`/matches/${meeting.matchId}`} onClick={onClose} className="surface-flat hover-surface grid gap-2 rounded-xl p-3 text-sm sm:grid-cols-[6rem_1fr_auto] sm:items-center"><span className={`font-black uppercase ${meeting.result === 'win' ? 'text-fennec-cyan' : meeting.result === 'loss' ? 'text-fennec-orange' : 'text-muted'}`}>{meeting.result}</span><span><strong>{meeting.playlistName}</strong><span className="text-muted ml-2">{meeting.relationship} · {new Date(meeting.startedAt).toLocaleDateString()}</span></span><span className="font-mono font-bold">{meeting.score}</span></Link>)}</div></section>
    </div>
  </dialog>;
}
