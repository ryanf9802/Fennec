import {
  localAccessSatisfied,
  queryLocalAccess,
  requestLocalAccess,
} from '../src/platform/localAccess';

describe('browser local network access', () => {
  const permissionQuery = vi.fn();
  beforeEach(() => {
    permissionQuery.mockReset();
    Object.defineProperty(window, 'isSecureContext', {
      configurable: true,
      value: true,
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: permissionQuery },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports the Chromium local network permission state when enforcement applies', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Chrome/142.0.0.0 Safari/537.36',
    );
    permissionQuery.mockResolvedValue({ state: 'prompt' } as PermissionStatus);

    await expect(queryLocalAccess()).resolves.toBe('prompt');
    expect(permissionQuery).toHaveBeenCalledWith({
      name: 'local-network-access',
    });
  });

  it('does not block browsers that do not expose the permission requirement', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Firefox/141.0',
    );
    await expect(queryLocalAccess()).resolves.toBe('not-required');
    expect(permissionQuery).not.toHaveBeenCalled();
  });

  it('probes loopback apps to trigger the prompt and accepts a persistent grant', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 Edg/143.0.0.0 Chrome/143.0.0.0',
    );
    permissionQuery
      .mockResolvedValueOnce({ state: 'prompt' } as PermissionStatus)
      .mockResolvedValueOnce({ state: 'granted' } as PermissionStatus);
    const fetch = vi
      .spyOn(window, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));

    await expect(requestLocalAccess()).resolves.toBe('granted');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(localAccessSatisfied('granted')).toBe(true);
  });
});
