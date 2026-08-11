import { useCallback, useEffect, useRef, type AnimationEvent } from 'react';

const COMPLETION_TIMEOUT_MS = 1_200;

/**
 * Presents the shared Fennec loading artwork either over the full application
 * or inside a positioned component while its content becomes ready.
 */
export function FennecLoadingOverlay({
  loading,
  placement,
  loadingLabel,
  revealingLabel,
  onRevealComplete,
  testId,
}: {
  loading: boolean;
  placement: 'screen' | 'contained';
  loadingLabel: string;
  revealingLabel: string;
  onRevealComplete(): void;
  testId?: string;
}) {
  const completed = useRef(false);
  const revealing = !loading;

  const completeReveal = useCallback(() => {
    if (completed.current || !revealing) return;
    completed.current = true;
    onRevealComplete();
  }, [onRevealComplete, revealing]);

  useEffect(() => {
    if (loading) {
      completed.current = false;
      return;
    }
    const timeout = window.setTimeout(completeReveal, COMPLETION_TIMEOUT_MS);
    return () => window.clearTimeout(timeout);
  }, [completeReveal, loading]);

  const finishReveal = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) completeReveal();
  };

  return (
    <div
      role="status"
      aria-label={revealing ? revealingLabel : loadingLabel}
      className={`fennec-loading-overlay fennec-loading-overlay--${placement} app-backdrop ${placement === 'screen' ? 'app-entrance-overlay' : ''} ${revealing ? `fennec-loading-overlay--cinematic ${placement === 'screen' ? 'app-entrance-overlay--cinematic' : ''}` : ''}`}
      data-loading-state={revealing ? 'revealing' : 'loading'}
      data-testid={testId}
      onAnimationEnd={finishReveal}
    >
      <div className="fennec-loading-bloom app-entrance-bloom" />
      <img
        src="/assets/brand/fennec-a-mark-primary.svg"
        alt=""
        className="fennec-loading-mark app-entrance-mark"
      />
    </div>
  );
}
