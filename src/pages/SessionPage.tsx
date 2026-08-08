import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { MatchRow } from '../components/MatchRow';
import { MetricsGrid } from '../components/MetricsGrid';
import { sessionMetrics } from '../domain/metrics';
import { useSession } from '../data/historyQueries';

export function SessionPage() {
  const { sessionId } = useParams();
  const { profile } = useFennec();
  const sessionQuery = useSession(sessionId);
  const session = sessionQuery.data;
  if (sessionQuery.isLoading) return <div className="surface rounded-3xl p-8">Loading session…</div>;
  if (sessionQuery.isError) return <div className="surface rounded-3xl p-8">Session history could not be loaded.</div>;
  if (!session) return <div className="surface rounded-3xl p-8"><h1 className="text-2xl font-extrabold">Session not found</h1><Link className="button-secondary mt-5" to="/">Back to games</Link></div>;
  return <div className="space-y-6">
    <Link to="/" className="text-muted inline-flex items-center gap-2 text-sm font-bold hover:text-fennec-cyan"><ArrowLeft className="size-4" />Game timeline</Link>
    <header><div className="eyebrow">Session detail</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">{new Date(session.startedAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h1><p className="text-muted mt-2">{new Date(session.startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {new Date(session.endedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p></header>
    <div className="surface rounded-3xl p-5 sm:p-6"><MetricsGrid metrics={sessionMetrics(session.matches, profile?.primaryId)} /></div>
    <section className="space-y-3"><h2 className="text-xl font-extrabold">Games</h2>{[...session.matches].reverse().map((match) => <MatchRow key={match.id} match={match} profileId={profile?.primaryId} />)}</section>
  </div>;
}
