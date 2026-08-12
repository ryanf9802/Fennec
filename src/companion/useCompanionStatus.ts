import { useCallback, useEffect, useRef, useState } from 'react';
import { companionHealth, type CompanionHealth } from './client';

export function useCompanionStatus(enabled = true) {
  const [checking, setChecking] = useState(true);
  const [health, setHealth] = useState<CompanionHealth>();
  const healthRef = useRef<CompanionHealth | undefined>(undefined);
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const recheck = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const request = companionHealth()
      .then((nextHealth) => {
        healthRef.current = nextHealth;
        setHealth(nextHealth);
      })
      .finally(() => {
        setChecking(false);
        inFlight.current = undefined;
      });
    inFlight.current = request;
    return request;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => void run(), delay);
    };
    const run = async () => {
      try {
        await recheck();
      } finally {
        if (!stopped) schedule(healthRef.current ? 5_000 : 1_000);
      }
    };
    const wake = () => schedule(0);
    const visible = () => {
      if (document.visibilityState === 'visible') wake();
    };
    schedule(0);
    window.addEventListener('focus', wake);
    window.addEventListener('pageshow', wake);
    document.addEventListener('visibilitychange', visible);
    return () => {
      stopped = true;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('focus', wake);
      window.removeEventListener('pageshow', wake);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [enabled, recheck]);
  return { checking: enabled && checking, health, recheck };
}
