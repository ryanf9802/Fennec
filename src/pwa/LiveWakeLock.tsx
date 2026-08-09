import { useEffect } from 'react';
import { useFennec } from '../app/FennecContext';

export function LiveWakeLock() {
  const { activeMatch } = useFennec();
  useEffect(() => {
    if (!activeMatch || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | undefined;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const next = await navigator.wakeLock.request('screen');
        if (cancelled) await next.release();
        else lock = next;
      } catch {
        // Wake locks are best effort and may be denied by power policy.
      }
    };
    const visible = () => {
      if (!lock || lock.released) void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', visible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', visible);
      void lock?.release();
    };
  }, [activeMatch]);
  return null;
}
