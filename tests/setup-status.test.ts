import type { CompanionHealth } from '../src/companion/client';
import {
  companionHasConfiguredStore,
  setupComplete,
  storedCompanionStatsApiVerification,
} from '../src/setup/setupStatus';

const companion: CompanionHealth = {
  version: '0.2.1',
  protocolVersion: 1,
  paired: true,
  gameRunning: false,
  feedConnected: false,
  stores: ['steam'],
  configuredStores: ['steam'],
  launchOnStartup: true,
};
const storedValues = new Map<string, string>();

describe('setup completion', () => {
  beforeEach(() => {
    storedValues.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storedValues.get(key) ?? null,
        setItem: (key: string, value: string) => storedValues.set(key, value),
        removeItem: (key: string) => storedValues.delete(key),
      },
    });
  });

  afterEach(() => {
    window.localStorage.removeItem('fennec-companion-cursor');
  });

  it('requires verified Stats API access for the browser path', () => {
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'browser',
        statsApiVerified: false,
        companionStatsApiVerified: false,
        companionSetupVerified: false,
      }),
    ).toBe(false);
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'browser',
        statsApiVerified: true,
        companionStatsApiVerified: false,
        companionSetupVerified: false,
      }),
    ).toBe(true);
  });

  it('keeps completed companion setup valid after the live process restarts', () => {
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'companion',
        statsApiVerified: false,
        companionStatsApiVerified: true,
        companionSetupVerified: false,
        health: companion,
      }),
    ).toBe(true);
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'companion',
        statsApiVerified: false,
        companionStatsApiVerified: false,
        companionSetupVerified: false,
        health: companion,
      }),
    ).toBe(false);
  });

  it('accepts one configured storefront when multiple installations are detected', () => {
    const partiallyConfigured: CompanionHealth = {
      ...companion,
      stores: ['steam', 'epic'],
      configuredStores: ['steam'],
    };

    expect(companionHasConfiguredStore(partiallyConfigured)).toBe(true);
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'companion',
        statsApiVerified: false,
        companionStatsApiVerified: true,
        companionSetupVerified: false,
        health: partiallyConfigured,
      }),
    ).toBe(true);
    expect(
      companionHasConfiguredStore({
        ...partiallyConfigured,
        configuredStores: [],
      }),
    ).toBe(false);
  });

  it('does not confuse an offline companion with incomplete prior setup', () => {
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'companion',
        statsApiVerified: false,
        companionStatsApiVerified: true,
        companionSetupVerified: true,
      }),
    ).toBe(true);
  });

  it('does not hide a current companion incompatibility behind prior completion', () => {
    expect(
      setupComplete({
        accessSatisfied: true,
        path: 'companion',
        statsApiVerified: false,
        companionStatsApiVerified: true,
        companionSetupVerified: true,
        health: { ...companion, protocolVersion: 0 },
      }),
    ).toBe(false);
  });

  it('recognizes an existing synchronized companion cursor as prior verification', () => {
    window.localStorage.setItem('fennec-companion-cursor', '12');

    expect(storedCompanionStatsApiVerification()).toBe(true);
  });

  it('accepts legacy first-packet verification for existing installs', () => {
    window.localStorage.setItem('fennec-companion-capture-verified-v1', 'true');

    expect(storedCompanionStatsApiVerification()).toBe(true);
  });
});
