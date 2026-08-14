let client: typeof import('../src/companion/client');

describe('automatic companion access', () => {
  beforeEach(async () => {
    vi.resetModules();
    client = await import('../src/companion/client');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function browserStorage(value?: string) {
    const values = new Map<string, string>();
    if (value) values.set('fennec-companion-token', value);
    return {
      values,
      storage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, next: string) => values.set(key, next),
      },
    };
  }

  const publicHealth = {
    version: '0.2.13',
    protocolVersion: 1,
    paired: false,
    gameRunning: false,
    feedConnected: false,
    configuredStores: [],
    launchOnStartup: false,
  };

  it('automatically connects to a running companion without navigation', async () => {
    const { values, storage } = browserStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'automatic-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...publicHealth, paired: true }),
      });
    vi.stubGlobal('fetch', fetch);

    await expect(client.companionHealth()).resolves.toMatchObject({
      paired: true,
    });
    expect(values.get('fennec-companion-token')).toBe('automatic-token');
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:49125/health',
      expect.objectContaining({ targetAddressSpace: 'loopback' }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:49125/pair',
      expect.objectContaining({
        method: 'POST',
        targetAddressSpace: 'loopback',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:49125/status',
      expect.objectContaining({
        headers: { Authorization: 'Bearer automatic-token' },
        targetAddressSpace: 'loopback',
      }),
    );
  });

  it('uses an existing valid token without requesting another one', async () => {
    const { storage } = browserStorage('valid-token');
    vi.stubGlobal('window', { localStorage: storage });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...publicHealth, paired: true }),
      });
    vi.stubGlobal('fetch', fetch);

    await expect(client.companionHealth()).resolves.toMatchObject({
      paired: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenLastCalledWith(
      'http://127.0.0.1:49125/status',
      expect.objectContaining({
        headers: { Authorization: 'Bearer valid-token' },
      }),
    );
  });

  it('refreshes a stale token automatically', async () => {
    const { values, storage } = browserStorage('stale-token');
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
        .mockResolvedValueOnce({ ok: false })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'fresh-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...publicHealth, paired: true }),
        }),
    );

    await expect(client.companionHealth()).resolves.toMatchObject({
      paired: true,
    });
    expect(values.get('fennec-companion-token')).toBe('fresh-token');
  });

  it('retains automatic access in memory when storage is blocked', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'session-token' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ...publicHealth, paired: true }),
        }),
    );

    await expect(client.ensureCompanionAccess()).resolves.toMatchObject({
      paired: true,
    });
    expect(client.companionPairingToken()).toBe('session-token');
  });

  it('returns public health while an older companion updates', async () => {
    const { storage } = browserStorage();
    vi.stubGlobal('window', { localStorage: storage });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
        .mockResolvedValueOnce({ ok: false }),
    );

    await expect(client.companionHealth()).resolves.toEqual(publicHealth);
  });

  it('retries after a health fetch never settles', async () => {
    vi.useFakeTimers();
    const { storage } = browserStorage();
    vi.stubGlobal('window', { localStorage: storage });
    let stalledSignal: AbortSignal | undefined;
    const fetch = vi
      .fn()
      .mockImplementationOnce((_url: string, init: RequestInit) => {
        stalledSignal = init.signal as AbortSignal;
        return new Promise(() => undefined);
      })
      .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'recovered-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...publicHealth, paired: true }),
      });
    vi.stubGlobal('fetch', fetch);

    const stalledCheck = client.companionHealth();
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(stalledCheck).resolves.toBeUndefined();
    expect(stalledSignal?.aborted).toBe(true);
    await expect(client.companionHealth()).resolves.toMatchObject({
      paired: true,
    });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('releases automatic access when a response body never settles', async () => {
    vi.useFakeTimers();
    const { storage } = browserStorage();
    vi.stubGlobal('window', { localStorage: storage });
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
      .mockResolvedValueOnce({
        ok: true,
        json: () => new Promise(() => undefined),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => publicHealth })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'recovered-token' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...publicHealth, paired: true }),
      });
    vi.stubGlobal('fetch', fetch);

    const stalledCheck = client.companionHealth();
    await vi.advanceTimersByTimeAsync(1_500);

    await expect(stalledCheck).resolves.toEqual(publicHealth);
    await expect(client.companionHealth()).resolves.toMatchObject({
      paired: true,
    });
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('starts an installed companion without opening another web page', () => {
    const setItem = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal('window', {
      localStorage: { getItem: vi.fn(), setItem },
    });
    vi.stubGlobal('location', { assign });

    expect(client.startInstalledCompanion()).toBe(true);
    expect(assign).toHaveBeenCalledWith(client.companionPairingLaunchUrl);
  });

  it('uses the stable latest-release Windows installer asset', () => {
    expect(client.companionDownloadUrl).toBe(
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

    await expect(
      client.companionCommand('enable-dashboard-auto-open'),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:49125/commands/enable-dashboard-auto-open',
      expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer paired-token' },
        targetAddressSpace: 'loopback',
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

    await expect(client.companionSnapshot()).resolves.toEqual(snapshot);
    await client.companionRestore(snapshot as never);
    await client.companionDeleteHistory();

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'http://127.0.0.1:49125/data/snapshot',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer paired-token',
        }),
        targetAddressSpace: 'loopback',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://127.0.0.1:49125/data/restore',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(snapshot),
        targetAddressSpace: 'loopback',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      'http://127.0.0.1:49125/data/delete-history',
      expect.objectContaining({
        method: 'POST',
        targetAddressSpace: 'loopback',
      }),
    );
  });
});
