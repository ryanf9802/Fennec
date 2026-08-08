import { eventDetails, formatClock, visibleEvents } from '../domain/timeline';
import type { FennecSettings, MatchState } from '../domain/types';

export function Timeline({ match, settings }: { match: MatchState; settings: FennecSettings }) {
  const events = visibleEvents(match, settings);
  return <div className="space-y-2">
    {!events.length && <div className="surface-flat text-muted rounded-xl px-4 py-8 text-center text-sm">No events match the {settings.timelinePreset} timeline preset yet.</div>}
    {events.map((event) => <article key={event.id} className="surface-flat grid grid-cols-[3rem_1fr] gap-3 rounded-xl px-3 py-3">
      <span className="text-fennec-cyan font-mono text-sm font-bold">{formatClock(event.matchClockSeconds)}</span>
      <div className="min-w-0">
        <div className="font-bold">{event.eventName.replace(/([a-z])([A-Z])/g, '$1 $2')}</div>
        <div className="text-muted mt-0.5 break-words text-sm">{eventDetails(event, settings) || 'No selected attributes'}</div>
      </div>
    </article>)}
  </div>;
}
