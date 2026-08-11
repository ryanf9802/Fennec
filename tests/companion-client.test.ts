import {
  companionCommand,
  companionDeleteHistory,
  companionDownloadUrl,
  companionPairingLaunchUrl,
  pairInstalledCompanion,
  companionRestore,
  companionSnapshot,
} from '../src/companion/client';

describe('companion pairing', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('pairs through loopback without launching another browser page', async () => {
    const setItem = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem },
      setTimeout,
    });
    vi.stubGlobal('location', { assign });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ token: 'paired-token' }),
      }),
    );

    await expect(pairInstalledCompanion()).resolves.toBe(true);
    expect(setItem).toHaveBeenCalledWith(
      'fennec-companion-token',
      'paired-token',
    );
    expect(assign).not.toHaveBeenCalled();
  });

  it('activates a stopped companion and retries pairing in place', async () => {
    vi.useFakeTimers();
    const setItem = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem },
      setTimeout,
    });
    vi.stubGlobal('location', { assign });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValueOnce(new Error('not running'))
        .mockResolvedValue({
          ok: true,
          json: async () => ({ token: 'started-token' }),
        }),
    );

    const pairing = pairInstalledCompanion({
      retryDelayMs: 100,
      timeoutMs: 1_000,
    });
    await vi.advanceTimersByTimeAsync(100);

    await expect(pairing).resolves.toBe(true);
    expect(assign).toHaveBeenCalledWith(companionPairingLaunchUrl);
    expect(setItem).toHaveBeenCalledWith(
      'fennec-companion-token',
      'started-token',
    );
  });

  it('reports failure after activating an unavailable companion', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem: vi.fn() },
      setTimeout,
    });
    vi.stubGlobal('location', { assign });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(pairInstalledCompanion({ timeoutMs: 0 })).resolves.toBe(false);
    expect(assign).toHaveBeenCalledWith('fennec://pair');
  });

  it('uses the stable latest-release Windows installer asset', () => {
    expect(companionDownloadUrl).toBe(
      'https://github.com/ryanf9802/Fennec/releases/latest/download/Fennec-Companion-Windows-x64-setup.exe',
    );
  });

  it('sends authenticated dashboard launch preference commands', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn().mockReturnValue('paired-token'),
        setItem: vi.fn(),
      },
    });
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);

    await expect(companionCommand('enable-dashboard-auto-open')).resolves.toBe(
      true,
    );
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:49125/commands/enable-dashboard-auto-open',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer paired-token' },
      }),
    );
  });

  it('reads and replaces canonical companion data with authentication', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: vi.fn().mockReturnValue('paired-token'),
        setItem: vi.fn(),
      },
    });
    const snapshot = {
      matches: [],
      settings: { theme: 'dark' },
      profile: { primaryId: 'Steam|1|0', displayName: 'Player' },
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => snapshot })
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);

    await expect(companionSnapshot()).resolves.toEqual(snapshot);
    await companionRestore(snapshot as never);
    await companionDeleteHistory();

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:49125/data/snapshot',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer paired-token',
        }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:49125/data/restore',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(snapshot),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:49125/data/delete-history',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
