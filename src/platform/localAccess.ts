export type LocalAccessState =
  'checking' | 'prompt' | 'denied' | 'granted' | 'not-required';

function isLoopbackOrigin(): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
}

async function loopbackPermission(): Promise<PermissionStatus | undefined> {
  for (const name of ['loopback-network', 'local-network-access']) {
    try {
      return await navigator.permissions.query({
        name,
      } as unknown as PermissionDescriptor);
    } catch {
      // Try the legacy alias before deciding this browser does not report LNA.
    }
  }
  return undefined;
}

export async function queryLocalAccess(): Promise<LocalAccessState> {
  if (isLoopbackOrigin()) return 'not-required';
  if (!window.isSecureContext) return 'denied';
  const permission = await loopbackPermission();
  return permission?.state ?? 'not-required';
}

async function probe(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(2_500),
      targetAddressSpace: 'loopback',
    } as RequestInit);
    return true;
  } catch {
    return false;
  }
}

export async function requestLocalAccess(): Promise<LocalAccessState> {
  const beforeRequest = queryLocalAccess();
  const probes = Promise.all([
    probe('http://127.0.0.1:49125/permission-probe'),
    probe('http://127.0.0.1:49124/'),
  ]);
  const before = await beforeRequest;
  if (before === 'granted' || before === 'not-required') return before;
  await probes;
  return queryLocalAccess();
}

export async function observeLocalAccess(
  onChange: (state: LocalAccessState) => void,
): Promise<() => void> {
  if (isLoopbackOrigin()) return () => undefined;
  const permission = await loopbackPermission();
  if (!permission) return () => undefined;
  const update = () => onChange(permission.state);
  permission.addEventListener('change', update);
  return () => permission.removeEventListener('change', update);
}

export function localAccessSatisfied(state: LocalAccessState): boolean {
  return state === 'granted' || state === 'not-required';
}
