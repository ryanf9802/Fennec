import { SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useFennec } from '../app/FennecContext';
import { usePlayerHistory } from '../data/historyQueries';
import type { MatchResultFilter, RelationshipFilter } from '../data/historyRepository';
import { playerIdentityKind, playerKeyForPrimaryId, playerPrimaryId } from '../domain/playerIdentity';
import { MatchRow } from './MatchRow';

type PlaylistFilter = '' | 'ranked' | 'casual' | 'private' | 'lan' | 'unknown';

export function PlayerProfileDialog({ playerKey, playerName, onClose }: { playerKey: string; playerName: string; onClose(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { profile } = useFennec();
  const profileKey = playerKeyForPrimaryId(profile?.primaryId);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [relationship, setRelationship] = useState<RelationshipFilter | ''>('');
  const [result, setResult] = useState<MatchResultFilter | ''>('');
  const [playlistCategory, setPlaylistCategory] = useState<PlaylistFilter>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const historyQuery = usePlayerHistory(profileKey, playerKey, {
    relationship: relationship || undefined,
    result: result || undefined,
    playlistCategory: playlistCategory || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const summary = historyQuery.data?.pages[0]?.summary;
  const identityKind = summary?.identityKind ?? playerIdentityKind(playerKey);
  const matches = historyQuery.data?.pages.flatMap((page) => page.matches.items) ?? [];
  const activeFilterCount = [relationship, result, playlistCategory, from, to].filter(Boolean).length;
  const displayName = summary?.latestName ?? playerName;

  return <dialog
    ref={dialogRef}
    aria-labelledby="player-profile-title"
    className="player-dialog m-auto max-h-[calc(100dvh-2rem)] w-[min(72rem,calc(100vw-2rem))] overflow-hidden rounded-3xl bg-transparent p-0 text-main backdrop:bg-black/65"
    onClose={onClose}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
  >
    <div className="surface max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-3xl p-5 sm:p-7">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="eyebrow">Player profile</div>
          <div className="mt-1 flex min-w-0 items-center gap-3">
            <h2 id="player-profile-title" className="truncate text-3xl font-black sm:text-4xl">{displayName}</h2>
            {identityKind === 'name' && <span className="text-fennec-orange text-xs font-black tracking-wider">BOT</span>}
          </div>
          <p className="text-muted mt-2 break-all font-mono text-sm">{identityKind === 'name' ? 'Name-based identity' : summary?.primaryId ?? playerPrimaryId(playerKey)}</p>
        </div>
        <button aria-label="Close player profile" className="hover-surface flex size-10 shrink-0 items-center justify-center rounded-xl" onClick={onClose}><X className="size-5" /></button>
      </header>

      <section className="mt-7 space-y-5" aria-labelledby="player-history-title">
        <h3 id="player-history-title" className="text-xl font-extrabold">Player history</h3>
        {summary && <div className="surface-flat grid grid-cols-2 gap-4 rounded-2xl p-4 sm:grid-cols-4 sm:p-5">{[
          ['Together', summary.gamesTogether], ['Record together', `${summary.winsTogether}–${summary.lossesTogether}`], ['Opposed', summary.gamesOpposed], ['Record against', `${summary.winsAgainst}–${summary.lossesAgainst}`],
        ].map(([label, value]) => <div key={label}><div className="eyebrow">{label}</div><div className="mt-1 text-2xl font-extrabold">{value}</div></div>)}</div>}

        <div>
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-lg font-extrabold">Matches</h4>
            <button
              type="button"
              className="button-secondary"
              aria-expanded={filtersOpen}
              aria-controls="player-history-filters"
              onClick={() => setFiltersOpen((open) => !open)}
            >
              <SlidersHorizontal className="size-4" />Filters{activeFilterCount > 0 && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-xs text-fennec-cyan">{activeFilterCount}</span>}
            </button>
          </div>

          {filtersOpen && <div id="player-history-filters" className="surface-flat mt-3 rounded-2xl p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label><span className="eyebrow">Relationship</span><select className="control mt-2" value={relationship} onChange={(event) => setRelationship(event.target.value as RelationshipFilter | '')}><option value="">Together and against</option><option value="together">Together</option><option value="against">Against</option></select></label>
              <label><span className="eyebrow">Result</span><select className="control mt-2" value={result} onChange={(event) => setResult(event.target.value as MatchResultFilter | '')}><option value="">Any result</option><option value="win">Wins</option><option value="loss">Losses</option><option value="incomplete">Incomplete</option></select></label>
              <label><span className="eyebrow">Playlist</span><select className="control mt-2" value={playlistCategory} onChange={(event) => setPlaylistCategory(event.target.value as PlaylistFilter)}><option value="">All playlists</option><option value="ranked">Ranked</option><option value="casual">Casual</option><option value="private">Private</option><option value="lan">LAN</option><option value="unknown">Unknown</option></select></label>
              <label><span className="eyebrow">From</span><input className="control mt-2" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
              <label><span className="eyebrow">Through</span><input className="control mt-2" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
            </div>
          </div>}
        </div>

        <div className="space-y-3">
          {historyQuery.isLoading && <div className="surface-flat rounded-2xl p-6">Loading history…</div>}
          {historyQuery.isError && <div className="surface-flat text-fennec-orange rounded-2xl p-6">Player history could not be loaded.</div>}
          {!historyQuery.isLoading && !historyQuery.isError && !matches.length && <div className="surface-flat text-muted rounded-2xl p-6">No matches meet these filters.</div>}
          {matches.map((match) => <MatchRow key={match.id} match={match} profileId={profile?.primaryId} onNavigate={onClose} />)}
          {historyQuery.hasNextPage && <button className="button-secondary mx-auto" disabled={historyQuery.isFetchingNextPage} onClick={() => void historyQuery.fetchNextPage()}>{historyQuery.isFetchingNextPage ? 'Loading…' : 'Load older matches'}</button>}
        </div>
      </section>
    </div>
  </dialog>;
}
