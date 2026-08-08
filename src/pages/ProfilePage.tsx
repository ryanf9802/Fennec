import { Check, UserRound } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useFennec } from '../app/FennecContext';

export function ProfilePage() {
  const { matches, sessions, profile, selectProfile } = useFennec();
  const players = useMemo(() => {
    const seen = new Map<string, string>();
    for (const match of matches) for (const player of match.participants) if (player.primaryId) seen.set(player.primaryId, player.name);
    return [...seen.entries()].map(([primaryId, displayName]) => ({ primaryId, displayName })).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [matches]);
  const [selected, setSelected] = useState(profile?.primaryId ?? '');
  const [saved, setSaved] = useState(false);
  const trackingSince = matches.length ? new Date(Math.min(...matches.map((match) => new Date(match.startedAt).getTime()))).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : '—';
  return <div className="mx-auto max-w-5xl space-y-7">
    <header><div className="eyebrow">Identity</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">Profile</h1><p className="text-muted mt-2">Choose your stable platform ID once; Fennec follows display-name changes automatically.</p></header>
    <section className="surface rounded-3xl p-5 sm:p-7">
      <div className="flex items-start gap-4"><div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-fennec-cyan"><UserRound className="size-6" /></div><div className="min-w-0"><div className="eyebrow">Display name</div><div className="mt-1 truncate text-3xl font-black">{profile?.displayName ?? 'Not selected'}</div><div className="text-muted mt-2 break-all font-mono text-sm">{profile?.primaryId ?? 'No platform identifier selected'}</div></div></div>
      <div className="mt-7 grid grid-cols-2 gap-5 border-t border-ui pt-6 sm:grid-cols-4">{[['Platform', profile?.primaryId.split('|')[0] ?? '—'], ['Games tracked', matches.length], ['Sessions', sessions.length], ['Tracking since', trackingSince]].map(([label, value]) => <div key={label}><div className="eyebrow">{label}</div><div className="mt-1 font-extrabold">{value}</div></div>)}</div>
    </section>
    <section className="surface-flat rounded-3xl p-5 sm:p-7"><h2 className="text-xl font-extrabold">Select your player</h2><p className="text-muted mt-2 max-w-2xl">Players appear after Fennec receives a match. Changing this selection recalculates every existing summary without altering history.</p>
      <div className="mt-5 flex max-w-2xl flex-col gap-3 sm:flex-row"><select className="control flex-1" value={selected} onChange={(event) => { setSelected(event.target.value); setSaved(false); }}><option value="">Play a match to discover players</option>{players.map((player) => <option key={player.primaryId} value={player.primaryId}>{player.displayName} · {player.primaryId.split('|')[0]}</option>)}</select><button className="button-primary sm:self-stretch" disabled={!selected} onClick={() => { const next = players.find((item) => item.primaryId === selected); if (next) void selectProfile(next).then(() => setSaved(true)); }}><Check className="size-4" />Use player</button></div>
      {saved && <p className="mt-3 text-sm font-bold text-fennec-cyan">Profile updated.</p>}
    </section>
  </div>;
}
