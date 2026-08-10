import {
  companionCommand,
  companionDeleteHistory,
  companionDownloadUrl,
  companionOpenUrl,
  companionRestore,
  companionSnapshot,
} from '../src/companion/client';

describe('companion pairing launch URL', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns to an allowlisted local development setup', () => {
    vi.stubGlobal('location', { origin: 'http://localhost:5174' });

    expect(companionOpenUrl()).toBe(
      'fennec://open?return_to=http%3A%2F%2Flocalhost%3A5174%2Fsetup',
    );
  });

  it('falls back to production for an unknown browser origin', () => {
    vi.stubGlobal('location', { origin: 'https://preview.example' });

    expect(companionOpenUrl()).toBe(
      'fennec://open?return_to=https%3A%2F%2Fapp.fennec.gg%2Fsetup',
    );
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
