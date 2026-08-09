import {
  localAccessSatisfied,
  queryLocalAccess,
  requestLocalAccess,
} from '../src/platform/localAccess';

describe('browser local network access', () => {
  const permissionQuery = vi.fn();
  beforeEach(() => {
    permissionQuery.mockReset();
    vi.stubGlobal('location', {
      hostname: 'app.fennec.gg',
    });
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: permissionQuery },
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('does not gate loopback development origins', async () => {
    vi.stubGlobal('location', { hostname: 'localhost' });

    await expect(queryLocalAccess()).resolves.toBe('not-required');
    expect(permissionQuery).not.toHaveBeenCalled();
  });

  it('reports the Chromium local network permission state when enforcement applies', async () => {
    permissionQuery.mockResolvedValue({ state: 'prompt' } as PermissionStatus);

    await expect(queryLocalAccess()).resolves.toBe('prompt');
    expect(permissionQuery).toHaveBeenCalledWith({ name: 'loopback-network' });
  });

  it('falls back to the legacy local network permission alias', async () => {
    permissionQuery
      .mockRejectedValueOnce(new TypeError('unsupported'))
      .mockResolvedValueOnce({ state: 'prompt' } as PermissionStatus);

    await expect(queryLocalAccess()).resolves.toBe('prompt');
    expect(permissionQuery).toHaveBeenNthCalledWith(2, {
      name: 'local-network-access',
    });
  });

  it('does not block browsers that do not expose the permission requirement', async () => {
    permissionQuery.mockRejectedValue(new TypeError('unsupported'));
    await expect(queryLocalAccess()).resolves.toBe('not-required');
    expect(permissionQuery).toHaveBeenCalledTimes(2);
  });

  it('probes loopback apps to trigger the prompt and accepts a persistent grant', async () => {
    permissionQuery
      .mockResolvedValueOnce({ state: 'prompt' } as PermissionStatus)
      .mockResolvedValueOnce({ state: 'granted' } as PermissionStatus);
    const fetch = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(requestLocalAccess()).resolves.toBe('granted');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ targetAddressSpace: 'loopback' }),
    );
    expect(localAccessSatisfied('granted')).toBe(true);
  });
});
