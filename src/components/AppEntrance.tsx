import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnimationEvent,
  type ReactNode,
} from 'react';

const COMPLETION_TIMEOUT_MS = 1_200;

const AppEntranceContext = createContext<(() => void) | undefined>(undefined);

// eslint-disable-next-line react-refresh/only-export-components
export function useAppEntrance() {
  const replayCinematic = useContext(AppEntranceContext);
  if (!replayCinematic)
    throw new Error('useAppEntrance must be used within AppEntrance');
  return { replayCinematic };
}

/**
 * Holds the loading artwork above the app until local state is ready, then
 * removes it after the cinematic transition has completed.
 */
export function AppEntrance({
  children,
  ready,
}: {
  children: ReactNode;
  ready: boolean;
}) {
  const [complete, setComplete] = useState(false);
  const revealing = ready;
  const showContent = ready || complete;

  const replayCinematic = useCallback(() => {
    setComplete(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appEntrance = 'cinematic';
  }, []);

  useEffect(() => {
    const replayRestoredPage = (event: PageTransitionEvent) => {
      if (event.persisted) setComplete(false);
    };
    window.addEventListener('pageshow', replayRestoredPage);
    return () => window.removeEventListener('pageshow', replayRestoredPage);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appEntranceState = complete
      ? 'complete'
      : revealing
        ? 'revealing'
        : 'loading';
  }, [complete, revealing]);

  useEffect(() => {
    if (!revealing || complete) return;
    const timeout = window.setTimeout(
      () => setComplete(true),
      COMPLETION_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [complete, revealing]);

  const finishReveal = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setComplete(true);
  };

  return (
    <AppEntranceContext.Provider value={replayCinematic}>
      {showContent && (
        <div
          className={`app-entrance-content ${!complete && revealing ? 'app-entrance-content--cinematic' : ''}`}
          inert={!complete}
        >
          {children}
        </div>
      )}
      {!complete && (
        <div
          role="status"
          aria-label={revealing ? 'Opening Fennec' : 'Loading Fennec'}
          className={`app-entrance-overlay app-backdrop ${revealing ? 'app-entrance-overlay--cinematic' : ''}`}
          data-testid="app-entrance"
          onAnimationEnd={finishReveal}
        >
          <div className="app-entrance-bloom" />
          <img
            src="/assets/brand/fennec-a-mark-primary.svg"
            alt=""
            className="app-entrance-mark"
          />
        </div>
      )}
    </AppEntranceContext.Provider>
  );
}
