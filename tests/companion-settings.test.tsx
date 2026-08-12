import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompanionSettings } from '../src/components/CompanionSettings';

const mocks = vi.hoisted(() => ({
  status: {} as Record<string, unknown>,
  command: vi.fn(),
}));

vi.mock('../src/companion/useCompanionStatus', () => ({
  useCompanionStatus: () => mocks.status,
}));

vi.mock('../src/companion/client', () => ({
  companionCommand: mocks.command,
  companionProtocolVersion: 1,
}));

function renderSettings(
  updateStatus: string | undefined,
  healthOverrides: Record<string, unknown> = {},
) {
  mocks.command.mockResolvedValue(true);
  mocks.status = {
    checking: false,
    recheck: vi.fn(),
    health: {
      version: '0.2.1',
      protocolVersion: 1,
      paired: true,
      gameRunning: false,
      feedConnected: false,
      configuredStores: [],
      launchOnStartup: true,
      updateStatus,
      ...healthOverrides,
    },
  };
  return render(
    <MemoryRouter>
      <CompanionSettings />
    </MemoryRouter>,
  );
}

describe('companion settings', () => {
  afterEach(() => vi.clearAllMocks());

  it('describes connection without exposing pairing as a user task', () => {
    renderSettings('current', { paired: false });

    expect(
      screen.getByText(
        /Companion 0.2.1 is running and needs to finish updating/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/pair/i)).not.toBeInTheDocument();
  });

  it('explains the lightweight persistent Windows startup behavior', () => {
    renderSettings('current');

    expect(
      screen.getByText(/the companion remains lightweight and idle/i),
    ).toHaveTextContent(
      'Start the tray collector when you sign in to Windows so it captures every launch path',
    );
  });

  it('shows current and recent companion process usage', () => {
    renderSettings('current', {
      resourceUsage: {
        cpuPercent: 0.04,
        memoryBytes: 18 * 1024 * 1024,
        recentPeakCpuPercent: 0.7,
        recentPeakMemoryBytes: 21.5 * 1024 * 1024,
        recentWindowSeconds: 60,
        sampledAt: '2026-08-10T12:00:00Z',
      },
    });

    const monitor = screen.getByLabelText('Live companion footprint');
    expect(monitor).toHaveTextContent('Companion process only');
    expect(monitor).toHaveTextContent('Live on this device');
    expect(monitor).toHaveTextContent('<0.1%');
    expect(monitor).toHaveTextContent('0.7% 1 min peak');
    expect(monitor).toHaveTextContent('18.0 MiB');
    expect(monitor).toHaveTextContent('21.5 MiB 1 min peak');
  });

  it('distinguishes a new companion measuring usage from an older companion', () => {
    const view = renderSettings('current', { resourceUsage: null });
    expect(screen.getByText('Measuring resource use…')).toBeInTheDocument();
    expect(screen.getByText('Measuring on this device')).toBeInTheDocument();

    view.unmount();
    renderSettings('current');
    expect(
      screen.getByText(
        'Install the latest companion to see live CPU and memory use.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Requires latest companion')).toBeInTheDocument();
  });

  it('presents automatic updates without requiring user action', () => {
    renderSettings('current');
    expect(
      screen.getByText(
        'Companion updates install automatically in the background.',
      ),
    ).toBeInTheDocument();
  });

  it('stays compatible with companions that omit update telemetry', () => {
    renderSettings(undefined);
    expect(
      screen.getByText(
        'Install the latest companion once to enable automatic updates.',
      ),
    ).toBeInTheDocument();
  });

  it('asks the companion to enable opt-in dashboard opening', async () => {
    renderSettings('current', {
      launchOnStartup: false,
      openDashboardOnGameStart: false,
      stores: ['steam', 'epic'],
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open dashboard with Rocket League',
      }),
    );

    await waitFor(() =>
      expect(mocks.command).toHaveBeenCalledWith('enable-dashboard-auto-open'),
    );
    expect(
      await screen.findByText(
        'The dashboard will open when Rocket League starts.',
      ),
    ).toBeInTheDocument();
  });

  it('hides the toggle when an older companion omits the capability', () => {
    renderSettings('current');

    expect(
      screen.getByText(
        'Install the latest companion to enable automatic dashboard opening.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'Open dashboard with Rocket League',
      }),
    ).not.toBeInTheDocument();
  });
});
