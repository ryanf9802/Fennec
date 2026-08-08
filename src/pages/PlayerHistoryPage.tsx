import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import { MatchRow } from '../components/MatchRow';
import { usePlayerHistory } from '../data/historyQueries';
import type { MatchResultFilter, RelationshipFilter } from '../data/historyRepository';
import { normalizePlayerKey, playerIdentityKind, playerKeyForPrimaryId, playerPrimaryId } from '../domain/playerIdentity';

type PlaylistFilter = '' | 'ranked' | 'casual' | 'private' | 'lan' | 'unknown';

export function PlayerHistoryPage() {
  const { playerId } = useParams();
  const { profile } = useFennec();
  const playerKey = normalizePlayerKey(playerId);
  const profileKey = playerKeyForPrimaryId(profile?.primaryId);
  const [relationship, setRelationship] = useState<RelationshipFilter | ''>('');
  const [result, setResult] = useState<MatchResultFilter | ''>('');
  const [playlistCategory, setPlaylistCategory] = useState<PlaylistFilter>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const historyQuery = usePlayerHistory(profileKey, playerKey, { relationship: relationship || undefined, result: result || undefined, playlistCategory: playlistCategory || undefined, from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined, to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined });
  if (!profile) return <div className="surface rounded-3xl p-8"><h1 className="text-2xl font-extrabold">Select your profile first</h1><Link className="button-secondary mt-5" to="/profile">Choose profile</Link></div>;
  if (!playerKey || playerKey === profileKey) return <div className="surface rounded-3xl p-8">Player history is unavailable.</div>;
  const summary = historyQuery.data?.pages[0]?.summary;
  const identityKind = summary?.identityKind ?? playerIdentityKind(playerKey);
  const matches = historyQuery.data?.pages.flatMap((page) => page.matches.items) ?? [];
  return <div className="space-y-7">
    <Link to="/" className="text-muted inline-flex items-center gap-2 text-sm font-bold hover:text-fennec-cyan"><ArrowLeft className="size-4" />Game timeline</Link>
    <header><div className="eyebrow">All-time player history</div><div className="mt-1 flex items-center gap-3"><h1 className="text-3xl font-black sm:text-4xl">{summary?.latestName ?? 'Player history'}</h1>{identityKind === 'name' && <span className="text-fennec-orange text-xs font-black tracking-wider">BOT</span>}</div><p className="text-muted mt-2 break-all font-mono text-sm">{identityKind === 'name' ? 'Name-based identity' : summary?.primaryId ?? playerPrimaryId(playerKey)}</p></header>
    {summary && <section className="surface grid grid-cols-2 gap-4 rounded-3xl p-5 sm:grid-cols-4 sm:p-7">{[
      ['Together', summary.gamesTogether], ['Record together', `${summary.winsTogether}–${summary.lossesTogether}`], ['Opposed', summary.gamesOpposed], ['Record against', `${summary.winsAgainst}–${summary.lossesAgainst}`],
    ].map(([label, value]) => <div key={label}><div className="eyebrow">{label}</div><div className="mt-1 text-2xl font-extrabold">{value}</div></div>)}</section>}
    <section className="surface-flat rounded-2xl p-4"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <label><span className="eyebrow">Relationship</span><select className="control mt-2" value={relationship} onChange={(event) => setRelationship(event.target.value as RelationshipFilter | '')}><option value="">Together and against</option><option value="together">Together</option><option value="against">Against</option></select></label>
      <label><span className="eyebrow">Result</span><select className="control mt-2" value={result} onChange={(event) => setResult(event.target.value as MatchResultFilter | '')}><option value="">Any result</option><option value="win">Wins</option><option value="loss">Losses</option><option value="incomplete">Incomplete</option></select></label>
      <label><span className="eyebrow">Playlist</span><select className="control mt-2" value={playlistCategory} onChange={(event) => setPlaylistCategory(event.target.value as PlaylistFilter)}><option value="">All playlists</option><option value="ranked">Ranked</option><option value="casual">Casual</option><option value="private">Private</option><option value="lan">LAN</option><option value="unknown">Unknown</option></select></label>
      <label><span className="eyebrow">From</span><input className="control mt-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
      <label><span className="eyebrow">Through</span><input className="control mt-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
    </div></section>
    <section className="space-y-3"><h2 className="text-xl font-extrabold">Matches</h2>{historyQuery.isLoading && <div className="surface-flat rounded-2xl p-6">Loading history…</div>}{historyQuery.isError && <div className="surface-flat text-fennec-orange rounded-2xl p-6">Player history could not be loaded.</div>}{!historyQuery.isLoading && !historyQuery.isError && !matches.length && <div className="surface-flat text-muted rounded-2xl p-6">No matches meet these filters.</div>}{matches.map((match) => <MatchRow key={match.id} match={match} profileId={profile.primaryId} />)}{historyQuery.hasNextPage && <button className="button-secondary mx-auto" disabled={historyQuery.isFetchingNextPage} onClick={() => void historyQuery.fetchNextPage()}>{historyQuery.isFetchingNextPage ? 'Loading…' : 'Load older matches'}</button>}</section>
  </div>;
}
