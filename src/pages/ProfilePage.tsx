import { Check, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useFennec } from '../app/FennecContext';
import { useOverview, usePlayers } from '../data/historyQueries';

/**
 * Lists trackable platform identities, shows overview statistics, and persists
 * the profile whose perspective drives match and relationship summaries.
 */
export function ProfilePage() {
  const { profile, selectProfile } = useFennec();
  const playersQuery = usePlayers();
  const overviewQuery = useOverview();
  const players = (playersQuery.data ?? [])
    .filter(
      (player) => player.identityKind === 'platform' && !!player.primaryId,
    )
    .map((player) => ({
      primaryId: player.primaryId!,
      displayName: player.latestName,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  const [selected, setSelected] = useState(profile?.primaryId ?? '');
  const [saved, setSaved] = useState(false);
  const hasUnsavedChanges =
    selected.length > 0 && selected !== (profile?.primaryId ?? '');
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
          Choose your stable platform ID once; Fennec follows display-name
          changes automatically.
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
      <section className="surface-flat rounded-3xl p-5 sm:p-7">
        <h2 className="text-xl font-extrabold">Select your player</h2>
        <p className="text-muted mt-2 max-w-2xl">
          Players appear after Fennec receives a match. Changing this selection
          recalculates every existing summary without altering history.
        </p>
        <div className="mt-5 max-w-2xl">
          <select
            className="control flex-1"
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setSaved(false);
            }}
          >
            <option value="">Play a match to discover players</option>
            {players.map((player) => (
              <option key={player.primaryId} value={player.primaryId}>
                {player.displayName} · {player.primaryId.split('|')[0]}
              </option>
            ))}
          </select>
        </div>
        {saved && (
          <p
            className="mt-3 text-sm font-bold text-fennec-cyan"
            aria-live="polite"
          >
            Profile updated.
          </p>
        )}
      </section>
      {hasUnsavedChanges && (
        <button
          className="button-primary fixed right-4 bottom-24 z-40 shadow-2xl shadow-black/40 sm:right-6 md:right-8 md:bottom-8"
          onClick={() => {
            const next = players.find((item) => item.primaryId === selected);
            if (next) void selectProfile(next).then(() => setSaved(true));
          }}
        >
          <Check className="size-4" />
          Save profile
        </button>
      )}
    </div>
  );
}
