import { ExternalLink, Radio } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatsApiSetup } from '../components/StatsApiSetup';

export function OnboardingPage() {
  return (
    <div className="space-y-7">
      <header>
        <div className="eyebrow">First run</div>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">
          Connect Rocket League
        </h1>
        <p className="text-muted mt-2">
          A one-time configuration enables Rocket League's local Stats API.
        </p>
      </header>
      <section className="surface rounded-3xl p-5 sm:p-7">
        <h2 className="font-extrabold">Set up the Stats API</h2>
        <p className="text-muted mt-1">
          Close Rocket League first. Keep Fennec open in Chrome or Edge when you
          play.
        </p>
        <StatsApiSetup />
      </section>
      <section className="surface-flat rounded-2xl p-5">
        <div className="flex items-start gap-3">
          <Radio className="mt-0.5 size-5 shrink-0 text-fennec-orange" />
          <div>
            <h2 className="font-extrabold">Browser limitation</h2>
            <p className="text-muted mt-1 text-sm">
              Fennec cannot edit protected game files. Your data stays in this
              browser, and recording stops when the tab closes.
            </p>
          </div>
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        <Link className="button-primary" to="/">
          Go to games
        </Link>
        <a
          className="button-secondary"
          href="https://www.rocketleague.com/developer/stats-api"
          target="_blank"
          rel="noreferrer"
        >
          Official Stats API guide <ExternalLink className="size-4" />
        </a>
      </div>
    </div>
  );
}
