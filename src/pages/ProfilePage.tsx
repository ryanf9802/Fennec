import { Check, Search, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useFennec } from '../app/FennecContext';
import { playerKeyForPrimaryId } from '../domain/playerIdentity';
import { useOverview, usePlayers } from '../data/historyQueries';

/**
 * Lists trackable platform identities, shows profile-scoped statistics, and
 * persists the player whose perspective drives the rest of Fennec.
 */
export function ProfilePage() {
  const { profile, selectProfile } = useFennec();
  const [search, setSearch] = useState(profile?.displayName ?? '');
  const [selected, setSelected] = useState(profile?.primaryId ?? '');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saved, setSaved] = useState(false);
  const availablePlayersQuery = usePlayers('', true);
  const playersQuery = usePlayers(search, true);
  const overviewQuery = useOverview(playerKeyForPrimaryId(profile?.primaryId));
  const availablePlayers = availablePlayersQuery.data ?? [];
  const players = (playersQuery.data ?? [])
    .filter((player) => !!player.primaryId)
    .map((player) => ({
      primaryId: player.primaryId!,
      displayName: player.latestName,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const hasPlayers = availablePlayers.length > 0;

  const choose = (player: (typeof players)[number]) => {
    setSelected(player.primaryId);
    setSearch(player.displayName);
    setOpen(false);
    setSaved(false);
  };
  const saveSelection = () => {
    const next = [...availablePlayers, ...(playersQuery.data ?? [])].find(
      (item) => item.primaryId === selected,
    );
    if (next?.primaryId)
      void selectProfile({
        primaryId: next.primaryId,
        displayName: next.latestName,
      }).then(() => setSaved(true));
  };
  const trackingSince = overviewQuery.data?.firstMatchStartedAt
    ? new Date(overviewQuery.data.firstMatchStartedAt).toLocaleDateString(
        undefined,
        { month: 'long', day: 'numeric', year: 'numeric' },
      )
    : '—';
  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-3xl font-black sm:text-4xl">Profile</h1>
        <p className="text-muted mt-2">
          Choose your stable platform ID; Fennec follows display-name changes
          automatically.
        </p>
      </header>
      <section className="surface rounded-3xl p-5 sm:p-7">
        <div className="flex items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-fennec-cyan">
            <UserRound className="size-6" />
          </div>
          <div className="min-w-0">
            <div className="eyebrow">Display name</div>
            <div className="mt-1 truncate text-3xl font-black">
              {profile?.displayName ?? 'Not selected'}
            </div>
            <div className="text-muted mt-2 break-all font-mono text-sm">
              {profile?.primaryId ?? 'No platform identifier selected'}
            </div>
          </div>
        </div>
        <div className="mt-7 grid grid-cols-2 gap-5 border-t border-ui pt-6 sm:grid-cols-4">
          {[
            ['Platform', profile?.primaryId.split('|')[0] ?? '—'],
            ['Games tracked', overviewQuery.data?.matches ?? '—'],
            ['Sessions', overviewQuery.data?.sessions ?? '—'],
            ['Tracking since', trackingSince],
          ].map(([label, value]) => (
            <div key={label}>
              <div className="eyebrow">{label}</div>
              <div className="mt-1 font-extrabold">{value}</div>
            </div>
          ))}
        </div>
      </section>
      <section
        id="player-selection"
        className={`rounded-3xl p-5 sm:p-7 ${profile ? 'surface-flat' : 'surface border-cyan-300/30 bg-cyan-400/5 ring-2 ring-cyan-400/40'}`}
      >
        <h2 className="text-xl font-extrabold">Select your player</h2>
        <p className="text-muted mt-2 max-w-2xl">
          Players appear after Fennec receives a match. Changing this selection
          updates games, sessions, and summaries without altering local history.
        </p>
        {!profile && (
          <p className="mt-3 max-w-2xl font-bold text-fennec-cyan">
            Choose a player to personalize your Fennec view.
          </p>
        )}
        <div className="relative mt-5 max-w-2xl">
          <Search className="text-muted pointer-events-none absolute left-3 top-3.5 size-4" />
          <input
            className="control pl-10"
            type="search"
            role="combobox"
            aria-label="Search players"
            aria-autocomplete="list"
            aria-controls="player-results"
            aria-expanded={open && hasPlayers}
            aria-activedescendant={
              open && players[activeIndex]
                ? `player-option-${activeIndex}`
                : undefined
            }
            placeholder={
              availablePlayersQuery.isLoading
                ? 'Loading players…'
                : hasPlayers
                  ? 'Search players by display name'
                  : 'Play a match to discover players'
            }
            disabled={!hasPlayers && !availablePlayersQuery.isLoading}
            value={search}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(event) => {
              setSearch(event.target.value);
              setSelected('');
              setActiveIndex(0);
              setSaved(false);
              setOpen(true);
            }}
            onKeyDown={(event) => {
              if (!open || !players.length) return;
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((value) =>
                  Math.min(value + 1, players.length - 1),
                );
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((value) => Math.max(value - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                choose(players[activeIndex]!);
              } else if (event.key === 'Escape') setOpen(false);
            }}
          />
          {open && hasPlayers && (
            <div
              id="player-results"
              role="listbox"
              className="surface absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl p-1 shadow-2xl"
            >
              {players.length ? (
                players.map((player, index) => (
                  <button
                    id={`player-option-${index}`}
                    key={player.primaryId}
                    type="button"
                    role="option"
                    aria-selected={selected === player.primaryId}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left ${index === activeIndex ? 'bg-cyan-400/12 text-fennec-cyan' : 'hover-surface'}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => choose(player)}
                  >
                    <span className="min-w-0 truncate font-bold">
                      {player.displayName}
                    </span>
                    <span className="text-muted ml-3 text-xs">
                      {player.primaryId.split('|')[0]}
                    </span>
                  </button>
                ))
              ) : (
                <p className="text-muted px-3 py-4 text-sm">
                  No players match “{search}”.
                </p>
              )}
            </div>
          )}
          <div className="mt-3 flex justify-end">
            <button
              className="button-primary"
              disabled={!selected}
              onClick={saveSelection}
            >
              <Check className="size-4" />
              Use player
            </button>
          </div>
        </div>
        {!hasPlayers && !availablePlayersQuery.isLoading && (
          <p className="text-muted mt-3 text-sm">
            Play a match to discover players.
          </p>
        )}
        {saved && (
          <p
            className="mt-3 text-sm font-bold text-fennec-cyan"
            role="status"
            aria-live="polite"
          >
            Profile updated.
          </p>
        )}
      </section>
    </div>
  );
}
