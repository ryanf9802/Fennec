import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FennecLoadingOverlay } from '../src/components/FennecLoadingOverlay';

describe('Fennec loading overlay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('adapts the shared artwork to contained loading and reveal states', () => {
    const onRevealComplete = vi.fn();
    const view = render(
      <FennecLoadingOverlay
        loading
        placement="contained"
        loadingLabel="Loading chart"
        revealingLabel="Opening chart"
        onRevealComplete={onRevealComplete}
        testId="loader"
      />,
    );

    const loadingOverlay = screen.getByTestId('loader');
    expect(loadingOverlay).toHaveAccessibleName('Loading chart');
    expect(loadingOverlay).toHaveClass('fennec-loading-overlay--contained');
    expect(loadingOverlay).not.toHaveClass('fennec-loading-overlay--cinematic');

    view.rerender(
      <FennecLoadingOverlay
        loading={false}
        placement="contained"
        loadingLabel="Loading chart"
        revealingLabel="Opening chart"
        onRevealComplete={onRevealComplete}
        testId="loader"
      />,
    );

    const revealingOverlay = screen.getByTestId('loader');
    expect(revealingOverlay).toHaveAccessibleName('Opening chart');
    expect(revealingOverlay).toHaveClass('fennec-loading-overlay--cinematic');
    fireEvent.animationEnd(revealingOverlay);
    expect(onRevealComplete).toHaveBeenCalledOnce();
  });

  it('finishes the reveal if the animation event is lost', () => {
    vi.useFakeTimers();
    const onRevealComplete = vi.fn();
    render(
      <FennecLoadingOverlay
        loading={false}
        placement="screen"
        loadingLabel="Loading Fennec"
        revealingLabel="Opening Fennec"
        onRevealComplete={onRevealComplete}
      />,
    );

    act(() => vi.advanceTimersByTime(1_200));
    expect(onRevealComplete).toHaveBeenCalledOnce();
  });
});
