import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CompanionSettings } from '../src/components/CompanionSettings';

const mocks = vi.hoisted(() => ({
  status: {} as Record<string, unknown>,
}));

vi.mock('../src/companion/useCompanionStatus', () => ({
  useCompanionStatus: () => mocks.status,
}));

function renderSettings(updateStatus: string | undefined) {
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
    },
  };
  return render(
    <MemoryRouter>
      <CompanionSettings />
    </MemoryRouter>,
  );
}

describe('companion settings', () => {
  it('explains the lightweight persistent Windows startup behavior', () => {
    renderSettings('current');

    expect(
      screen.getByText(/the companion is lightweight and remains idle/i),
    ).toHaveTextContent(
      'When Windows startup is enabled, it remains available after Rocket League closes.',
    );
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
});
