export type AppEntranceMode = 'cinematic' | 'minimal';

function readNavigationType(): string | undefined {
  if (typeof performance.getEntriesByType !== 'function') return undefined;
  return (
    performance.getEntriesByType('navigation')[0] as
      PerformanceNavigationTiming | undefined
  )?.type;
}

/**
 * Reserves the cinematic entrance for a newly created document. Reloads,
 * history restoration, and unknown navigation sources use a minimal handoff.
 */
export function resolveAppEntranceMode(
  navigationType: string | null | undefined = readNavigationType(),
): AppEntranceMode {
  return navigationType === 'navigate' ? 'cinematic' : 'minimal';
}
