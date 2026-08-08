import { connectionPresentation } from '../domain/connectionPresentation';
import type { FeedConnectionState } from '../domain/types';

export function ConnectionStatus({ connection, demoMode = false, className = '' }: { connection: FeedConnectionState; demoMode?: boolean; className?: string }) {
  const presentation = connectionPresentation(connection);
  const label = demoMode ? `Demo · ${presentation.label}` : presentation.label;

  return <div role="status" aria-label={`Connection status: ${label}`} data-connection-state={connection} className={`flex min-w-0 max-w-full items-center gap-2 font-bold ${className}`}>
    <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${presentation.pulse ? 'live-pulse' : ''} ${presentation.indicatorClass}`} />
    <span className="min-w-0 truncate whitespace-nowrap">{label}</span>
  </div>;
}
