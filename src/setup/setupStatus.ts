import {
  companionProtocolVersion,
  type CompanionHealth,
} from '../companion/client';

export type SetupPath = 'companion' | 'browser';

const setupPathKey = 'fennec-setup-path-explicit-v2';
const companionSetupCompleteKey = 'fennec-companion-setup-complete-v1';
const companionCaptureVerifiedKey = 'fennec-companion-capture-verified-v1';
const companionCursorKey = 'fennec-companion-cursor';
let sessionSetupPath: SetupPath | undefined;

function storedValue(key: string): string | null {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function storeValue(key: string, value: string): void {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Session memory keeps setup navigation usable when storage is blocked.
  }
}

export function storedSetupPath(): SetupPath | undefined {
  if (sessionSetupPath) return sessionSetupPath;
  const stored = storedValue(setupPathKey);
  if (stored === 'browser' || stored === 'companion') {
    sessionSetupPath = stored;
    return stored;
  }
  return undefined;
}

export function requestedSetupPath(): SetupPath | undefined {
  if (new URLSearchParams(location.hash.slice(1)).has('companion'))
    return 'companion';
  const requested = new URLSearchParams(location.search).get('path');
  return requested === 'browser' || requested === 'companion'
    ? requested
    : storedSetupPath();
}

export function rememberSetupPath(path: SetupPath): void {
  sessionSetupPath = path;
  storeValue(setupPathKey, path);
}

export function storedCompanionCaptureVerification(): boolean {
  if (storedValue(companionCaptureVerifiedKey) === 'true') return true;
  // A saved cursor proves an older Fennec version already accepted a companion frame.
  const cursor = Number(storedValue(companionCursorKey));
  return Number.isInteger(cursor) && cursor > 0;
}

export function rememberCompanionCaptureVerification(): void {
  storeValue(companionCaptureVerifiedKey, 'true');
}

export function storedCompanionSetupCompletion(): boolean {
  return storedValue(companionSetupCompleteKey) === 'true';
}

export function rememberCompanionSetupCompletion(): void {
  storeValue(companionSetupCompleteKey, 'true');
}

export function companionCompatible(
  health?: CompanionHealth,
): health is CompanionHealth {
  return Boolean(
    health?.paired && health.protocolVersion === companionProtocolVersion,
  );
}

export function companionHasConfiguredStore(health?: CompanionHealth): boolean {
  return Boolean(
    health?.stores?.length &&
    health.stores.some((store) => health.configuredStores?.includes(store)),
  );
}

export function setupComplete({
  accessSatisfied,
  path,
  statsApiVerified,
  companionCaptureVerified,
  companionSetupVerified,
  health,
}: {
  accessSatisfied: boolean;
  path?: SetupPath;
  statsApiVerified: boolean;
  companionCaptureVerified: boolean;
  companionSetupVerified: boolean;
  health?: CompanionHealth;
}): boolean {
  if (!accessSatisfied || !path) return false;
  if (path === 'browser') return statsApiVerified;
  if (!health) return companionSetupVerified;
  return (
    companionCompatible(health) &&
    companionHasConfiguredStore(health) &&
    companionCaptureVerified
  );
}
