import { act, renderHook } from '@testing-library/react';
import type { CompanionHealth } from '../src/companion/client';
import { useCompanionStatus } from '../src/companion/useCompanionStatus';

const mocks = vi.hoisted(() => ({ companionHealth: vi.fn() }));

vi.mock('../src/companion/client', () => ({
  companionHealth: mocks.companionHealth,
}));

const connectedHealth: CompanionHealth = {
  version: '0.2.13',
  protocolVersion: 1,
  paired: true,
  gameRunning: false,
  feedConnected: false,
  stores: ['steam'],
  configuredStores: ['steam'],
  launchOnStartup: true,
};

describe('companion status polling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.companionHealth.mockReset();
  });

  afterEach(() => vi.useRealTimers());

  it('detects a companion that starts after the initial check', async () => {
    mocks.companionHealth
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(connectedHealth);
    const { result } = renderHook(() => useCompanionStatus());

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.health).toBeUndefined();

    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(result.current.health).toEqual(connectedHealth);
    expect(mocks.companionHealth).toHaveBeenCalledTimes(2);
  });

  it('clears stale health when a running companion disappears', async () => {
    mocks.companionHealth
      .mockResolvedValueOnce(connectedHealth)
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useCompanionStatus());

    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.health).toEqual(connectedHealth);

    await act(() => vi.advanceTimersByTimeAsync(5_000));
    expect(result.current.health).toBeUndefined();
    expect(mocks.companionHealth).toHaveBeenCalledTimes(2);
  });

  it('rechecks immediately when the browser regains focus', async () => {
    mocks.companionHealth.mockResolvedValue(undefined);
    renderHook(() => useCompanionStatus());
    await act(() => vi.advanceTimersByTimeAsync(0));

    window.dispatchEvent(new Event('focus'));
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(mocks.companionHealth).toHaveBeenCalledTimes(2);
  });

  it('deduplicates lifecycle checks while a request is in flight', async () => {
    let resolveHealth!: (health?: CompanionHealth) => void;
    mocks.companionHealth.mockReturnValue(
      new Promise<CompanionHealth | undefined>((resolve) => {
        resolveHealth = resolve;
      }),
    );
    renderHook(() => useCompanionStatus());
    await act(() => vi.advanceTimersByTimeAsync(0));

    window.dispatchEvent(new Event('focus'));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(mocks.companionHealth).toHaveBeenCalledTimes(1);

    await act(async () => resolveHealth(undefined));
  });
});
