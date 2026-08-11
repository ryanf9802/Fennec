import type {
  FennecProfile,
  FennecSettings,
  MatchState,
} from '../domain/types';
import { isLoopbackHostname } from '../platform/origin';

export interface CompanionHealth {
  version: string;
  protocolVersion: number;
  paired: boolean;
  store?: 'steam' | 'epic';
  gameRunning: boolean;
  feedConnected: boolean;
  lastPacketAt?: string;
  stores?: Array<'steam' | 'epic'>;
  configuredStores: Array<'steam' | 'epic'>;
  launchOnStartup: boolean;
  openDashboardOnGameStart?: boolean;
  updateStatus?:
    | 'current'
    | 'checking'
    | 'downloading'
    | 'waitingForIdle'
    | 'installing'
    | 'retrying';
  availableUpdateVersion?: string;
  lastUpdateCheckAt?: string;
  dataSyncVersion?: number;
  instanceId?: string;
  datasetGeneration?: number;
  canonicalMatches?: number;
  pendingFrames?: number;
  materializedFrameId?: number;
  databaseBytes?: number;
  lastSyncedAt?: string;
}

export interface CanonicalCompanionData {
  matches: MatchState[];
  settings?: FennecSettings;
  profile?: FennecProfile;
}

export const companionProtocolVersion = 1;
export const companionDataSyncVersion = 1;
export const companionDownloadUrl =
  'https://github.com/ryanf9802/Fennec/releases/latest/download/Fennec-Companion-Windows-x64-setup.exe';

const productionSetupUrl = 'https://app.fennec.gg/setup';

export function companionOpenUrl(): string {
  const currentOrigin = new URL(location.origin);
  const returnTo =
    currentOrigin.origin === new URL(productionSetupUrl).origin ||
    (currentOrigin.protocol === 'http:' &&
      isLoopbackHostname(currentOrigin.hostname))
      ? `${currentOrigin.origin}/setup`
      : productionSetupUrl;
  return `fennec://open?return_to=${encodeURIComponent(returnTo)}`;
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window.localStorage?.getItem === 'function' &&
      typeof window.localStorage?.setItem === 'function'
      ? window.localStorage
      : undefined;
  } catch {
    return undefined;
  }
}

export function companionPairingToken(): string | undefined {
  return browserStorage()?.getItem('fennec-companion-token') ?? undefined;
}

export function companionCursor(): string {
  return browserStorage()?.getItem('fennec-companion-cursor') ?? '0';
}

export function saveCompanionCursor(cursor: number): void {
  browserStorage()?.setItem('fennec-companion-cursor', String(cursor));
}

export function acceptCompanionPairing(): boolean {
  const value = new URLSearchParams(location.hash.slice(1)).get('companion');
  if (!value) return false;
  const storage = browserStorage();
  if (!storage) return false;
  storage.setItem('fennec-companion-token', value);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return true;
}

export async function companionHealth(): Promise<CompanionHealth | undefined> {
  try {
    const response = await fetch('http://127.0.0.1:49125/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return undefined;
    const health = (await response.json()) as CompanionHealth;
    const pairingToken = companionPairingToken();
    if (!pairingToken) return health;
    const status = await fetch('http://127.0.0.1:49125/status', {
      headers: { Authorization: `Bearer ${pairingToken}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(1_500),
    });
    return status.ok ? ((await status.json()) as CompanionHealth) : health;
  } catch {
    return undefined;
  }
}

export async function companionCommand(
  command:
    | 'create-steam-shortcut'
    | 'create-epic-shortcut'
    | 'configure-steam'
    | 'configure-epic'
    | 'enable-startup'
    | 'disable-startup'
    | 'enable-dashboard-auto-open'
    | 'disable-dashboard-auto-open',
): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:49125/commands/${command}`, {
      method: 'POST',
      headers: companionPairingToken()
        ? { Authorization: `Bearer ${companionPairingToken()}` }
        : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function companionDataRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const token = companionPairingToken();
  if (!token) throw new Error('Pair the companion before managing its data.');
  const response = await fetch(`http://127.0.0.1:49125${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `The companion returned ${response.status}.`);
  }
  return response;
}

export async function companionSnapshot(): Promise<CanonicalCompanionData> {
  const response = await companionDataRequest('/data/snapshot', {
    cache: 'no-store',
  });
  const value = (await response.json()) as CanonicalCompanionData;
  return {
    ...value,
    settings: value.settings ?? undefined,
    profile: value.profile ?? undefined,
  };
}

export async function companionRestore(
  data: CanonicalCompanionData,
): Promise<void> {
  await companionDataRequest('/data/restore', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function companionDeleteHistory(): Promise<void> {
  await companionDataRequest('/data/delete-history', { method: 'POST' });
}
