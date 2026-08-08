import { ExternalLink, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatsApiSetup } from '../components/StatsApiSetup';

export function OnboardingPage() {
  return <div className="space-y-7">
    <header><div className="eyebrow">First run</div><h1 className="mt-1 text-3xl font-black sm:text-4xl">Connect Rocket League</h1><p className="text-muted mt-2">A one-time configuration enables Rocket League's local Stats API.</p></header>
    <section className="surface rounded-3xl p-5 sm:p-7">
      <ol className="space-y-6">{[
        ['Close Rocket League', 'The game reads this setting only when it starts.'],
        ['Open the Stats API config', 'Use the Steam or Epic path below.'],
        ['Add the configuration', 'Keep unrelated sections and settings in the file.'],
        ['Restart Rocket League', 'Keep Fennec open in Chrome or Edge while you play.'],
      ].map(([title, detail], index) => <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-4"><span className="flex size-10 items-center justify-center rounded-xl bg-cyan-400/10 font-black text-fennec-cyan">{index + 1}</span><div><h2 className="font-extrabold">{title}</h2><p className="text-muted mt-1">{detail}</p>{index === 2 && <StatsApiSetup />}</div></li>)}</ol>
    </section>
    <section className="surface-flat rounded-2xl p-5"><div className="flex items-start gap-3"><Radio className="mt-0.5 size-5 shrink-0 text-fennec-orange" /><div><h2 className="font-extrabold">Browser limitation</h2><p className="text-muted mt-1 text-sm">Fennec cannot edit protected game files. Your data stays in this browser, and recording stops when the tab closes.</p></div></div></section>
    <div className="flex flex-wrap gap-3"><Link className="button-primary" to="/">Go to games</Link><a className="button-secondary" href="https://www.rocketleague.com/developer/stats-api" target="_blank" rel="noreferrer">Official Stats API guide <ExternalLink className="size-4" /></a></div>
  </div>;
}
