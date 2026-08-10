import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type AnimationEvent,
  type ReactNode,
} from 'react';
import type { AppEntranceMode } from '../app/appEntranceMode';

const COMPLETION_TIMEOUT_MS: Record<AppEntranceMode, number> = {
  cinematic: 1_200,
  minimal: 500,
};

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
 * removes it after the launch-appropriate transition has completed.
 */
export function AppEntrance({
  children,
  mode,
  ready,
}: {
  children: ReactNode;
  mode: AppEntranceMode;
  ready: boolean;
}) {
  const [complete, setComplete] = useState(false);
  const [activeMode, setActiveMode] = useState(mode);
  const revealing = ready;

  const replayCinematic = useCallback(() => {
    setActiveMode('cinematic');
    setComplete(false);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.appEntrance = activeMode;
  }, [activeMode]);

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
      COMPLETION_TIMEOUT_MS[activeMode],
    );
    return () => window.clearTimeout(timeout);
  }, [activeMode, complete, revealing]);

  const finishReveal = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setComplete(true);
  };

  return (
    <AppEntranceContext.Provider value={replayCinematic}>
      {ready && (
        <div
          className={`app-entrance-content ${!complete && revealing ? `app-entrance-content--${activeMode}` : ''}`}
          inert={!complete}
        >
          {children}
        </div>
      )}
      {!complete && (
        <div
          aria-hidden="true"
          className={`app-entrance-overlay app-backdrop ${revealing ? `app-entrance-overlay--${activeMode}` : ''}`}
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
