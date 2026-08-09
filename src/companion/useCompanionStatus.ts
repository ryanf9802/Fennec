import { useCallback, useEffect, useState } from 'react';
import { companionHealth, type CompanionHealth } from './client';

export function useCompanionStatus() {
  const [checking, setChecking] = useState(true);
  const [health, setHealth] = useState<CompanionHealth>();
  const recheck = useCallback(async () => {
    setChecking(true);
    setHealth(await companionHealth());
    setChecking(false);
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
