import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAppEntranceMode } from '../src/app/appEntranceMode';
import { AppEntrance, useAppEntrance } from '../src/components/AppEntrance';

function ReplayControl() {
  const { replayCinematic } = useAppEntrance();
  return <button onClick={replayCinematic}>Replay</button>;
}

describe('app entrance', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    ['navigate', 'cinematic'],
    ['reload', 'minimal'],
    ['back_forward', 'minimal'],
    [undefined, 'minimal'],
    [null, 'minimal'],
  ])('maps %s navigation to the %s entrance', (navigationType, expected) => {
    expect(resolveAppEntranceMode(navigationType)).toBe(expected);
  });

  it('holds the artwork until ready and removes it after the reveal', () => {
    function StatefulDashboard() {
      const [count, setCount] = useState(0);
      return (
        <button onClick={() => setCount((value) => value + 1)}>{count}</button>
      );
    }

    const view = render(
      <AppEntrance mode="cinematic" ready={false}>
        <StatefulDashboard />
      </AppEntrance>,
    );

    expect(screen.getByTestId('app-entrance')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    view.rerender(
      <AppEntrance mode="cinematic" ready>
        <StatefulDashboard />
      </AppEntrance>,
    );

    const overlay = screen.getByTestId('app-entrance');
    expect(overlay).toHaveClass('app-entrance-overlay--cinematic');
    fireEvent.click(screen.getByRole('button', { name: '0' }));
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
    fireEvent.animationEnd(overlay);

    expect(screen.queryByTestId('app-entrance')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1' })).toBeInTheDocument();
  });

  it('cannot leave the overlay blocking interaction if animation events fail', () => {
    vi.useFakeTimers();
    render(
      <AppEntrance mode="minimal" ready>
        <button>Continue</button>
      </AppEntrance>,
    );

    expect(screen.getByTestId('app-entrance')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(500));

    expect(screen.queryByTestId('app-entrance')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();
  });

  it('can replay the cinematic entrance after the app is visible', () => {
    render(
      <AppEntrance mode="minimal" ready>
        <ReplayControl />
      </AppEntrance>,
    );
    fireEvent.animationEnd(screen.getByTestId('app-entrance'));

    fireEvent.click(screen.getByRole('button', { name: 'Replay' }));

    expect(screen.getByTestId('app-entrance')).toHaveClass(
      'app-entrance-overlay--cinematic',
    );
    expect(document.documentElement).toHaveAttribute(
      'data-app-entrance',
      'cinematic',
    );
  });
});
