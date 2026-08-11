import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { FennecLoadingOverlay } from './FennecLoadingOverlay';

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

  const finishReveal = useCallback(() => setComplete(true), []);

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
        <FennecLoadingOverlay
          loading={!revealing}
          placement="screen"
          loadingLabel="Loading Fennec"
          revealingLabel="Opening Fennec"
          onRevealComplete={finishReveal}
          testId="app-entrance"
        />
      )}
    </AppEntranceContext.Provider>
  );
}
