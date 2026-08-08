import { Check, Clipboard, Download, FileJson, Save, Trash2, Upload } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useFennec } from '../app/FennecContext';
import { createBackup, downloadText, matchesCsv, parseBackup } from '../data/backup';
import { timelineCatalog } from '../domain/timeline';
import type { FennecSettings } from '../domain/types';

const ini = `[TAGame.MatchStatsExporter_TA]\nPacketSendRate=2\nPort=49123\nWebPort=49124`;

export function SettingsPage() {
  const context = useFennec();
  const { matches, profile, settings, connection, diagnostic, updateSettings, deleteHistory, restoreBackup } = context;
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<string>();
  const fileInput = useRef<HTMLInputElement>(null);
  const catalog = useMemo(() => timelineCatalog(matches), [matches]);
  const patchDraft = (patch: Partial<FennecSettings>) => setDraft((current) => ({ ...current, ...patch }));

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      if (!confirm(`Replace local Fennec data with ${backup.matches.length} matches from this backup?`)) return;
      await restoreBackup(backup);
      setDraft(backup.settings);
      setMessage('Backup restored.');
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    if (fileInput.current) fileInput.current.value = '';
  };

  const saveDraft = async () => {
    if (!Number.isInteger(draft.webSocketPort) || draft.webSocketPort < 1024 || draft.webSocketPort > 65535) {
      setMessage('WebSocket port must be a whole number from 1024 to 65535.');
      return;
    }
    if (!Number.isInteger(draft.sessionGapMinutes) || draft.sessionGapMinutes < 1 || draft.sessionGapMinutes > 240) {
      setMessage('Session idle time must be a whole number from 1 to 240.');
      return;
    }
    await updateSettings(draft);
    setMessage('Settings saved.');
  };

  return <div className="mx-auto max-w-5xl space-y-7">
    <header><div className="eyebrow">Preferences and storage</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">Settings</h1><p className="text-muted mt-2">Monitoring, automatic sessions, event detail, and browser-local data.</p></header>

    <section className="surface rounded-3xl p-5 sm:p-7"><h2 className="text-xl font-extrabold">Monitoring</h2><div className="mt-5 grid gap-5 lg:grid-cols-2"><label className="block"><span className="eyebrow">WebSocket port</span><input className="control mt-2" type="number" min="1024" max="65535" value={draft.webSocketPort} onChange={(event) => patchDraft({ webSocketPort: Number(event.target.value) })} /></label><div><div className="eyebrow">Connection</div><div className="surface-strong mt-2 flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold capitalize"><span className={`size-2 rounded-full ${connection === 'live' ? 'bg-fennec-cyan' : connection === 'unavailable' ? 'bg-fennec-orange' : 'bg-slate-400'}`} />{connection}</div></div></div>
      <div className="mt-5"><div className="flex items-center justify-between gap-3"><div><div className="eyebrow">Rocket League configuration</div><p className="text-muted mt-1 text-sm">Add this section to TAStatsAPI.ini before starting the game.</p></div><button className="button-secondary shrink-0" onClick={() => void navigator.clipboard.writeText(ini).then(() => setMessage('Configuration copied.'))}><Clipboard className="size-4" />Copy</button></div><pre className="surface-strong mt-3 overflow-x-auto rounded-xl p-4 text-sm"><code>{ini}</code></pre></div>
    </section>

    <section className="surface-flat rounded-3xl p-5 sm:p-7"><h2 className="text-xl font-extrabold">Sessions and behavior</h2><div className="mt-5 grid gap-5 lg:grid-cols-2"><label><span className="eyebrow">New session after idle minutes</span><input className="control mt-2" type="number" min="1" max="240" value={draft.sessionGapMinutes} onChange={(event) => patchDraft({ sessionGapMinutes: Number(event.target.value) })} /></label><label><span className="eyebrow">Appearance</span><select className="control mt-2" value={draft.theme} onChange={(event) => patchDraft({ theme: event.target.value as FennecSettings['theme'] })}><option value="dark">Dark</option><option value="system">System</option><option value="light">Light</option></select></label></div><label className="mt-5 flex max-w-2xl cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 size-4 accent-cyan-400" checked={draft.autoOpenLiveMatch} onChange={(event) => patchDraft({ autoOpenLiveMatch: event.target.checked })} /><span><strong>Automatically open the live monitor</strong><span className="text-muted mt-1 block text-sm">Off by default. An active game is otherwise highlighted until you open it.</span></span></label></section>

    <section className="surface-flat rounded-3xl p-5 sm:p-7"><h2 className="text-xl font-extrabold">Event timeline</h2><p className="text-muted mt-2">Curated is calm, Everything exposes every stored value, and Custom lets you choose each event and attribute.</p><label className="mt-5 block"><span className="eyebrow">Default preset</span><select className="control mt-2" value={draft.timelinePreset} onChange={(event) => patchDraft({ timelinePreset: event.target.value as FennecSettings['timelinePreset'] })}><option value="curated">Curated</option><option value="everything">Everything</option><option value="custom">Custom</option></select></label>
      {draft.timelinePreset === 'custom' && <div className="mt-5 space-y-3">{!Object.keys(catalog).length && <p className="text-muted text-sm">Captured event types will appear here.</p>}{Object.entries(catalog).map(([eventName, attributes]) => {
        const enabled = draft.enabledTimelineEvents.includes(eventName);
        return <details key={eventName} className="surface-strong rounded-xl" open={enabled}><summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 font-bold"><input type="checkbox" className="size-4 accent-cyan-400" checked={enabled} onClick={(event) => event.stopPropagation()} onChange={(change) => patchDraft({ enabledTimelineEvents: change.target.checked ? [...draft.enabledTimelineEvents, eventName] : draft.enabledTimelineEvents.filter((item) => item !== eventName) })} />{eventName}</summary>{enabled && <div className="grid gap-2 border-t border-ui px-4 py-4 sm:grid-cols-2">{attributes.map((attribute) => <label key={attribute} className="text-muted flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 size-4 accent-cyan-400" checked={(draft.timelineAttributes[eventName] ?? []).includes(attribute)} onChange={(change) => { const existing = draft.timelineAttributes[eventName] ?? []; patchDraft({ timelineAttributes: { ...draft.timelineAttributes, [eventName]: change.target.checked ? [...existing, attribute] : existing.filter((item) => item !== attribute) } }); }} /><span className="break-all font-mono">{attribute}</span></label>)}</div>}</details>;
      })}</div>}
    </section>

    <section className="surface-flat rounded-3xl p-5 sm:p-7"><h2 className="text-xl font-extrabold">Local data</h2><p className="text-muted mt-2">History stays in this browser. Export a backup before moving between localhost and app.fennec.gg.</p><div className="mt-5 flex flex-wrap gap-3"><button className="button-secondary" onClick={() => downloadText(`fennec-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(createBackup(matches, draft, profile), null, 2), 'application/json')}><FileJson className="size-4" />Export JSON</button><button className="button-secondary" onClick={() => downloadText(`fennec-matches-${new Date().toISOString().slice(0, 10)}.csv`, matchesCsv(matches, profile?.primaryId), 'text/csv')}><Download className="size-4" />Export CSV</button><button className="button-secondary" onClick={() => fileInput.current?.click()}><Upload className="size-4" />Restore backup</button><input ref={fileInput} className="hidden" type="file" accept="application/json,.json" onChange={(event) => void restore(event.target.files?.[0])} /><button className="button-danger" onClick={() => { if (confirm(`Delete ${matches.length} locally stored matches? This cannot be undone.`)) void deleteHistory().then(() => setMessage('Match history deleted.')); }}><Trash2 className="size-4" />Delete history</button></div></section>

    <section className="surface-flat rounded-2xl p-5"><div className="eyebrow">Developer diagnostics</div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><span className="text-muted">Endpoint:</span> <code>ws://127.0.0.1:{draft.webSocketPort}</code></div><div><span className="text-muted">Matches:</span> {matches.length}</div><div><span className="text-muted">Events:</span> {matches.reduce((sum, match) => sum + match.events.length, 0)}</div><div className="truncate"><span className="text-muted">Last warning:</span> {diagnostic ?? 'None'}</div></div></section>

    <div className="flex flex-wrap items-center justify-end gap-3"><span className="text-muted mr-auto text-sm">{message}</span><button className="button-primary" onClick={() => void saveDraft()}><Save className="size-4" />Save settings</button>{message === 'Settings saved.' && <Check className="size-5 text-fennec-cyan" />}</div>
  </div>;
}
