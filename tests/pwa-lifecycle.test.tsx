import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaLifecycle } from '../src/pwa/PwaLifecycle';

const serviceWorkerMock = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
  options: undefined as
    | {
        onNeedRefresh?: () => void;
        onRegisteredSW?: (
          url: string,
          registration: ServiceWorkerRegistration | undefined,
        ) => void;
      }
    | undefined,
}));

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: (options: NonNullable<typeof serviceWorkerMock.options>) => {
    serviceWorkerMock.options = options;
    return {
      needRefresh: [
        serviceWorkerMock.needRefresh,
        serviceWorkerMock.setNeedRefresh,
      ],
      updateServiceWorker: serviceWorkerMock.updateServiceWorker,
    };
  },
}));

describe('PwaLifecycle updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    serviceWorkerMock.needRefresh = false;
    serviceWorkerMock.setNeedRefresh.mockReset();
    serviceWorkerMock.updateServiceWorker.mockReset();
    serviceWorkerMock.options = undefined;
  });

  afterEach(() => vi.useRealTimers());

  it('checks for a new service worker immediately and every minute', () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const registration = { update } as unknown as ServiceWorkerRegistration;
    const view = render(<PwaLifecycle />);

    act(() => {
      serviceWorkerMock.options?.onRegisteredSW?.('/sw.js', registration);
    });
    expect(update).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(60_000));
    expect(update).toHaveBeenCalledTimes(2);

    act(() => window.dispatchEvent(new Event('online')));
    expect(update).toHaveBeenCalledTimes(3);

    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(update).toHaveBeenCalledTimes(4);

    view.unmount();
    act(() => {
      vi.advanceTimersByTime(60_000);
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(update).toHaveBeenCalledTimes(4);
  });

  it('activates and reloads as soon as an update is ready', () => {
    serviceWorkerMock.needRefresh = true;

    render(<PwaLifecycle />);

    expect(serviceWorkerMock.updateServiceWorker).toHaveBeenCalledWith(true);
  });
});
