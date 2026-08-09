import { useCallback, useEffect, useRef, useState } from 'react';
import { companionHealth, type CompanionHealth } from './client';

export function useCompanionStatus() {
  const [checking, setChecking] = useState(true);
  const [health, setHealth] = useState<CompanionHealth>();
  const inFlight = useRef<Promise<void> | undefined>(undefined);
  const recheck = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    const request = companionHealth()
      .then(setHealth)
      .finally(() => {
        setChecking(false);
        inFlight.current = undefined;
      });
    inFlight.current = request;
    return request;
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void recheck(), 0);
    const timer = window.setInterval(() => void recheck(), 5_000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
    };
  }, [recheck]);
  return { checking, health, recheck };
}
