import { fireEvent, render, screen } from '@testing-library/react';
import {
  SetupStatusProvider,
  useSetupStatus,
} from '../src/setup/SetupStatusContext';
import type { CompanionHealth } from '../src/companion/client';

const mocks = vi.hoisted(() => ({
  health: {
    version: '0.1.0',
    protocolVersion: 0,
    paired: true,
    gameRunning: false,
    feedConnected: false,
    stores: ['steam'],
    configuredStores: ['steam'],
    launchOnStartup: true,
  } as CompanionHealth | undefined,
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => ({ demoMode: false, statsApiVerified: true }),
}));
vi.mock('../src/platform/LocalAccessContext', () => ({
  useLocalAccess: () => ({ state: 'satisfied', satisfied: true }),
}));
vi.mock('../src/companion/useCompanionStatus', () => ({
  useCompanionStatus: (enabled: boolean) => ({
    checking: false,
    health: enabled ? mocks.health : undefined,
    recheck: vi.fn(),
  }),
}));

function StatusProbe() {
  const setup = useSetupStatus();
  return (
    <>
      <output>{`${setup.selectedPath ?? 'none'}:${setup.state}`}</output>
      <button onClick={() => setup.selectPath('browser')}>Browser</button>
      <button onClick={() => setup.selectPath('companion')}>Companion</button>
    </>
  );
}

describe('reactive setup status', () => {
  beforeEach(() => {
    const values = new Map<string, string>([
      ['fennec-setup-path-explicit-v2', 'browser'],
      ['fennec-companion-setup-complete-v1', 'true'],
    ]);
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
      },
    });
  });

  it('uses only the selected route and relocks on current incompatibility', () => {
    render(
      <SetupStatusProvider>
        <StatusProbe />
      </SetupStatusProvider>,
    );

    expect(screen.getByText('browser:complete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Companion' }));
    expect(screen.getByText('companion:incomplete')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Browser' }));
    expect(screen.getByText('browser:complete')).toBeInTheDocument();
  });
});
