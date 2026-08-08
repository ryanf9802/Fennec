import { Check, Clipboard } from 'lucide-react';
import { useState } from 'react';

const statsApiConfiguration = `[TAGame.MatchStatsExporter_TA]
PacketSendRate=2
Port=49123
WebPort=49124`;

const statsApiPaths = {
  Steam: String.raw`C:\Program Files (x86)\Steam\steamapps\common\rocketleague\TAGame\Config\TAStatsAPI.ini`,
  Epic: String.raw`C:\Program Files\Epic Games\rocketleague\TAGame\Config\TAStatsAPI.ini`,
} as const;

async function copy(value: string, label: string, setCopied: (label?: string) => void) {
  await navigator.clipboard.writeText(value);
  setCopied(label);
  window.setTimeout(() => setCopied(undefined), 1800);
}

export function StatsApiSetup() {
  const [copied, setCopied] = useState<string>();
  return <div className="mt-5 space-y-5">
    <div className="grid gap-3 lg:grid-cols-2">{Object.entries(statsApiPaths).map(([launcher, path]) => <article key={launcher} className="surface-strong min-w-0 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">{launcher}</h3><button aria-label={`Copy ${launcher} configuration path`} className="button-secondary min-h-0! px-3! py-2! text-sm" onClick={() => void copy(path, launcher, setCopied)}>{copied === launcher ? <Check className="size-4 text-fennec-cyan" /> : <Clipboard className="size-4" />} Copy path</button></div>
      <code className="mt-3 block break-all text-sm">{path}</code>
    </article>)}</div>
    <p className="text-muted text-sm">If Rocket League is installed in a custom Steam library or Epic folder, open that installation and use the same <code className="text-main">rocketleague\TAGame\Config\TAStatsAPI.ini</code> suffix. Create the file if it does not exist.</p>
    <div>
      <div className="flex items-center justify-between gap-3"><h3 className="font-extrabold">Configuration</h3><button className="button-secondary min-h-0! px-3! py-2! text-sm" onClick={() => void copy(statsApiConfiguration, 'configuration', setCopied)}>{copied === 'configuration' ? <Check className="size-4 text-fennec-cyan" /> : <Clipboard className="size-4" />} Copy</button></div>
      <pre className="surface-strong mt-3 overflow-x-auto rounded-xl p-4 text-sm"><code>{statsApiConfiguration}</code></pre>
    </div>
    <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-sm"><strong>Why PacketSendRate is 2</strong><p className="text-muted mt-1">Gameplay events are sent immediately. This setting only limits UpdateState snapshots to twice per second, which keeps the live display responsive without producing unnecessary browser writes.</p></div>
    <p className="text-muted text-sm"><strong className="text-main">Restart Rocket League after saving.</strong> The game reads this file when it starts.</p>
  </div>;
}
