import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  localAccessSatisfied,
  observeLocalAccess,
  queryLocalAccess,
  requestLocalAccess,
  type LocalAccessState,
} from './localAccess';

interface LocalAccessValue {
  state: LocalAccessState;
  satisfied: boolean;
  request(): Promise<void>;
  recheck(): Promise<void>;
}

const LocalAccessContext = createContext<LocalAccessValue | undefined>(
  undefined,
);

export function LocalAccessProvider({ children }: { children: ReactNode }) {
  const demoMode =
    import.meta.env.VITE_DEMO_FEED === 'true' ||
    new URLSearchParams(location.search).get('demo') === '1';
  const [state, setState] = useState<LocalAccessState>(
    demoMode ? 'granted' : 'checking',
  );
  const recheck = useCallback(async () => {
    setState(await queryLocalAccess());
  }, []);
  const request = useCallback(async () => {
    setState(await requestLocalAccess());
  }, []);

  useEffect(() => {
    if (demoMode) return;
    const initial = window.setTimeout(() => void recheck(), 0);
    let cleanup: () => void = () => undefined;
    void observeLocalAccess(setState).then((next) => {
      cleanup = next;
    });
    const visible = () => {
      if (document.visibilityState === 'visible') void recheck();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      window.clearTimeout(initial);
      cleanup();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [demoMode, recheck]);

  const value = useMemo(
    () => ({ state, satisfied: localAccessSatisfied(state), request, recheck }),
    [recheck, request, state],
  );
  return (
    <LocalAccessContext.Provider value={value}>
      {children}
    </LocalAccessContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLocalAccess(): LocalAccessValue {
  const value = useContext(LocalAccessContext);
  if (!value)
    throw new Error('useLocalAccess must be used inside LocalAccessProvider.');
  return value;
}
