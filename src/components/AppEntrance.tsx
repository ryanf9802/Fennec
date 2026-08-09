import {
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
  const revealing = ready;

  useEffect(() => {
    document.documentElement.dataset.appEntrance = mode;
  }, [mode]);

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
      COMPLETION_TIMEOUT_MS[mode],
    );
    return () => window.clearTimeout(timeout);
  }, [complete, mode, revealing]);

  const finishReveal = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setComplete(true);
  };

  return (
    <>
      {ready && (
        <div
          className={`app-entrance-content ${!complete && revealing ? `app-entrance-content--${mode}` : ''}`}
          inert={!complete}
        >
          {children}
        </div>
      )}
      {!complete && (
        <div
          aria-hidden="true"
          className={`app-entrance-overlay app-backdrop ${revealing ? `app-entrance-overlay--${mode}` : ''}`}
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
    </>
  );
}
