import type { FeedConnectionState } from './types';

interface ConnectionPresentation {
  label: string;
  indicatorClass: string;
  pulse: boolean;
}

export function connectionPresentation(
  connection: FeedConnectionState,
): ConnectionPresentation {
  switch (connection) {
    case 'waiting':
      return {
        label: 'Connected',
        indicatorClass: 'bg-emerald-400',
        pulse: false,
      };
    case 'live':
      return { label: 'Live', indicatorClass: 'bg-fennec-cyan', pulse: true };
    case 'connecting':
      return {
        label: 'Connecting',
        indicatorClass: 'bg-slate-400',
        pulse: false,
      };
    case 'unavailable':
      return {
        label: 'Stats API unavailable',
        indicatorClass: 'bg-fennec-orange',
        pulse: false,
      };
    case 'stopped':
      return { label: 'Stopped', indicatorClass: 'bg-slate-400', pulse: false };
  }
}
