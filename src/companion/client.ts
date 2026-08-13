import type {
  FennecProfile,
  FennecSettings,
  MatchState,
} from '../domain/types';

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
  resourceUsage?: CompanionResourceUsage | null;
}

export interface CompanionResourceUsage {
  cpuPercent: number;
  memoryBytes: number;
  recentPeakCpuPercent: number;
  recentPeakMemoryBytes: number;
  recentWindowSeconds: number;
  sampledAt: string;
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
export const companionPairingLaunchUrl = 'fennec://pair';
const companionStatusRequestTimeoutMs = 1_500;
let sessionPairingToken: string | undefined;
let accessRequest: Promise<CompanionHealth | undefined> | undefined;

async function companionStatusRequest<T>(
  path: '/health' | '/pair' | '/status',
  init?: RequestInit,
): Promise<T | undefined> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<undefined>((resolve) => {
    timeout = setTimeout(() => {
      // Abort normally releases fetch; resolving also protects polling when a
      // browser leaves the loopback request or response body pending.
      controller.abort();
      resolve(undefined);
    }, companionStatusRequestTimeoutMs);
  });
  const request = (async () => {
    try {
      const response = await fetch(`http://127.0.0.1:49125${path}`, {
        cache: 'no-store',
        ...init,
        signal: controller.signal,
      });
      return response.ok ? ((await response.json()) as T) : undefined;
    } catch {
      return undefined;
    }
  })();
  try {
    return await Promise.race([request, deadline]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    controller.abort();
  }
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
  try {
    return (
      browserStorage()?.getItem('fennec-companion-token') ?? sessionPairingToken
    );
  } catch {
    return sessionPairingToken;
  }
}

function saveCompanionPairingToken(token: string): void {
  sessionPairingToken = token;
  try {
    browserStorage()?.setItem('fennec-companion-token', token);
  } catch {
    // Session memory still allows automatic access when persistence is blocked.
  }
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
  saveCompanionPairingToken(value);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return true;
}

async function authenticatedCompanionStatus(
  token: string,
): Promise<CompanionHealth | undefined> {
  return companionStatusRequest<CompanionHealth>('/status', {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function requestAutomaticAccess(): Promise<CompanionHealth | undefined> {
  const existingToken = companionPairingToken();
  if (existingToken) {
    const status = await authenticatedCompanionStatus(existingToken);
    if (status) return status;
  }
  const value = await companionStatusRequest<{ token?: unknown }>('/pair', {
    method: 'POST',
  });
  if (typeof value?.token !== 'string' || !value.token) return undefined;
  saveCompanionPairingToken(value.token);
  return authenticatedCompanionStatus(value.token);
}

export function ensureCompanionAccess(): Promise<CompanionHealth | undefined> {
  if (accessRequest) return accessRequest;
  accessRequest = requestAutomaticAccess().finally(() => {
    accessRequest = undefined;
  });
  return accessRequest;
}

export function startInstalledCompanion(): boolean {
  try {
    location.assign(companionPairingLaunchUrl);
    return true;
  } catch {
    return false;
  }
}

export async function companionHealth(): Promise<CompanionHealth | undefined> {
  const health = await companionStatusRequest<CompanionHealth>('/health');
  if (!health) return undefined;
  return (await ensureCompanionAccess()) ?? health;
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
