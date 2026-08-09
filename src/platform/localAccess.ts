export type LocalAccessState =
  | 'checking'
  | 'prompt'
  | 'denied'
  | 'granted'
  | 'not-required'
  | 'unreportable';

function chromiumMajor(): { edge: boolean; version: number } | undefined {
  const edge = navigator.userAgent.match(/Edg\/(\d+)/);
  if (edge) return { edge: true, version: Number(edge[1]) };
  const chrome = navigator.userAgent.match(/Chrome\/(\d+)/);
  if (chrome) return { edge: false, version: Number(chrome[1]) };
  return undefined;
}

function browserRequiresPermission(): boolean {
  const browser = chromiumMajor();
  if (!browser) return false;
  return browser.edge ? browser.version >= 143 : browser.version >= 142;
}

export async function queryLocalAccess(): Promise<LocalAccessState> {
  if (!window.isSecureContext && location.hostname !== 'localhost')
    return 'denied';
  if (!browserRequiresPermission()) return 'not-required';
  try {
    const permission = await navigator.permissions.query({
      name: 'local-network-access',
    } as unknown as PermissionDescriptor);
    return permission.state;
  } catch {
    return 'unreportable';
  }
}

async function probe(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(2_500),
    });
    return true;
  } catch {
    return false;
  }
}

export async function requestLocalAccess(): Promise<LocalAccessState> {
  const before = await queryLocalAccess();
  if (before === 'granted' || before === 'not-required') return before;
  await probe('http://127.0.0.1:49125/permission-probe');
  await probe('http://127.0.0.1:49124/');
  return queryLocalAccess();
}

export async function observeLocalAccess(
  onChange: (state: LocalAccessState) => void,
): Promise<() => void> {
  if (!browserRequiresPermission()) return () => undefined;
  try {
    const permission = await navigator.permissions.query({
      name: 'local-network-access',
    } as unknown as PermissionDescriptor);
    const update = () => onChange(permission.state);
    permission.addEventListener('change', update);
    return () => permission.removeEventListener('change', update);
  } catch {
    return () => undefined;
  }
}

export function localAccessSatisfied(state: LocalAccessState): boolean {
  return state === 'granted' || state === 'not-required';
}
