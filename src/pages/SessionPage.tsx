import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { MatchRow } from '../components/MatchRow';
import { MetricsGrid } from '../components/MetricsGrid';
import { sessionMetrics } from '../domain/metrics';

export function SessionPage() {
  const { sessionId } = useParams();
  const { sessions, profile, encounters } = useFennec();
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) return <div className="surface rounded-3xl p-8"><h1 className="text-2xl font-extrabold">Session not found</h1><Link className="button-secondary mt-5" to="/">Back to games</Link></div>;
  const recurring = [...new Set(session.matches.flatMap((match) => match.participants.map((player) => player.primaryId)).filter(Boolean))]
    .map((id) => encounters.find((item) => item.primaryId === id))
    .filter((item) => item && item.primaryId !== profile?.primaryId && item.gamesTogether + item.gamesOpposed > 1);
  return <div className="space-y-6">
    <Link to="/" className="text-muted inline-flex items-center gap-2 text-sm font-bold hover:text-fennec-cyan"><ArrowLeft className="size-4" />Game timeline</Link>
    <header><div className="eyebrow">Session detail</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">{new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1><p className="text-muted mt-2">{new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {new Date(session.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></header>
    <div className="surface rounded-3xl p-5 sm:p-6"><MetricsGrid metrics={sessionMetrics(session.matches, profile?.primaryId)} /></div>
    {recurring.length > 0 && <section className="surface-flat rounded-2xl p-5"><div className="eyebrow">Familiar players</div><div className="mt-3 flex flex-wrap gap-2">{recurring.map((item) => <span key={item!.primaryId} className="surface-strong rounded-full px-3 py-1.5 text-sm font-bold">{item!.latestName} · {item!.gamesTogether} with / {item!.gamesOpposed} against</span>)}</div></section>}
    <section className="space-y-3"><h2 className="text-xl font-extrabold">Games</h2>{[...session.matches].reverse().map((match) => <MatchRow key={match.id} match={match} profileId={profile?.primaryId} encounters={encounters} />)}</section>
  </div>;
}
