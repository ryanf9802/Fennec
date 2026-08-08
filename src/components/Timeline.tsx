import { formatClock, timelineDisplayItems } from '../domain/timeline';
import type { FennecSettings, MatchState } from '../domain/types';
import { PlayerName } from './PlayerName';

export function Timeline({ match, settings }: { match: MatchState; settings: FennecSettings }) {
  const events = timelineDisplayItems(match, settings);
  return <div className="space-y-2">
    {!events.length && <div className="surface-flat text-muted rounded-xl px-4 py-8 text-center text-sm">No events match the {settings.timelinePreset} timeline preset yet.</div>}
    {events.map((event) => <article key={event.id} className="surface-flat grid grid-cols-[3rem_1fr] gap-3 rounded-xl px-3 py-3">
      <span className="text-fennec-cyan font-mono text-sm font-bold">{formatClock(event.clockSeconds)}</span>
      <div className="min-w-0">
        <p className="break-words text-sm leading-6">{event.parts.map((part, index) => part.player ? <PlayerName key={`${part.text}:${index}`} name={part.player.name} teamNumber={part.player.teamNumber} /> : <span key={`${part.text}:${index}`}>{part.text}</span>)}</p>
        {event.details && <div className="text-muted mt-1 break-words text-sm">{event.details}</div>}
        {event.technicalDetails && <details className="mt-2"><summary className="text-muted cursor-pointer text-xs font-bold">Technical details</summary><pre className="surface-strong mt-2 max-h-56 overflow-auto rounded-lg p-3 text-xs"><code>{event.technicalDetails}</code></pre></details>}
        {event.technicalDetailsExpired && <p className="text-muted mt-2 text-xs">The full technical payload expired after 90 days; compact event facts remain available.</p>}
      </div>
    </article>)}
  </div>;
}
