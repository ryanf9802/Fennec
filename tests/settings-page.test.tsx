import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { defaultSettings } from '../src/domain/types';
import { SettingsPage } from '../src/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  fennec: {} as Record<string, unknown>,
  loadMatches: vi.fn(),
  companion: {} as Record<string, unknown>,
  storageData: undefined as
    { persisted?: boolean; rawRetentionDays?: number } | undefined,
  storageRefetch: vi.fn(),
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => mocks.fennec,
}));

vi.mock('../src/data/database', () => ({
  historyRepository: { iterateMatches: vi.fn() },
  loadMatches: mocks.loadMatches,
}));

vi.mock('../src/data/historyQueries', () => ({
  useStorageStatistics: () => ({
    data: mocks.storageData,
    refetch: mocks.storageRefetch,
  }),
  useTimelineCatalog: () => ({ data: {} }),
}));

vi.mock('../src/components/CompanionSettings', () => ({
  CompanionSettings: () => null,
  CompanionLaunchControls: () => <div>Companion controls</div>,
  CompanionResourceMonitor: () => <div>Live companion footprint</div>,
}));

vi.mock('../src/companion/useCompanionStatus', () => ({
  useCompanionStatus: () => mocks.companion,
}));

vi.mock('../src/companion/client', () => ({
  companionDataSyncVersion: 1,
  companionSnapshot: vi.fn(),
}));

vi.mock('../src/components/ConnectionStatus', () => ({
  ConnectionStatus: () => null,
}));

vi.mock('../src/components/LocalNetworkAccessHelp', () => ({
  LocalNetworkAccessHelp: () => null,
}));

vi.mock('../src/components/StatsApiSetup', () => ({
  StatsApiSetup: () => null,
}));

describe('settings CSV export', () => {
  beforeEach(() => {
    mocks.loadMatches.mockReset();
    mocks.storageData = undefined;
    mocks.storageRefetch.mockReset();
    mocks.fennec = {
      profile: undefined,
      settings: defaultSettings,
      connection: 'waiting',
      diagnostic: undefined,
      syncStatus: { mode: 'browser-only' },
      updateSettings: vi.fn(),
      deleteHistory: vi.fn(),
      restoreBackup: vi.fn(),
      rebuildBrowserCache: vi.fn(),
    };
    mocks.companion = {
      checking: false,
      recheck: vi.fn(),
      health: undefined,
    };
  });

  it('requires a selected player profile before loading export data', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));

    expect(
      screen.getByText('Select a player profile before exporting CSV.'),
    ).toBeInTheDocument();
    expect(mocks.loadMatches).not.toHaveBeenCalled();
  });

  it('keeps browser-only data actions available without companion guidance', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText(/before restoring a backup/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restore backup' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete history' }),
    ).toBeEnabled();
  });

  it('puts Setup first and keeps its route available', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const sections = screen.getAllByRole('heading', { level: 2 });
    expect(sections[0]).toHaveTextContent('Setup center');
    expect(sections[1]).toHaveTextContent('Sessions and behavior');
    const setupLink = screen.getByRole('link', { name: 'Open setup' });
    expect(setupLink).toHaveAttribute('href', '/setup');
    expect(setupLink.querySelector('svg')).toHaveClass('lucide-list-checks');
  });

  it('explains recommended browser data protection without warning styling', () => {
    mocks.storageData = { persisted: false, rawRetentionDays: 90 };
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { persist: vi.fn().mockResolvedValue(false) },
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const protection = screen
      .getByText('Protect app data', { selector: 'strong' })
      .closest('[data-storage-protection-state]');
    expect(protection).toHaveAttribute(
      'data-storage-protection-state',
      'recommended',
    );
    expect(protection).toHaveTextContent('Highly recommended');
    expect(protection).toHaveTextContent(/not a backup/i);
    expect(protection?.querySelector('.lucide-shield')).toBeInTheDocument();
    expect(
      protection?.querySelector('.lucide-triangle-alert'),
    ).not.toBeInTheDocument();
  });

  it('floats the save action only after a setting changes', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.queryByRole('button', { name: 'Save settings' }),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('WebSocket port'), {
      target: { value: '49125' },
    });

    expect(screen.getByRole('button', { name: 'Save settings' })).toHaveClass(
      'settings-save-fab',
    );

    fireEvent.change(screen.getByLabelText('WebSocket port'), {
      target: { value: String(defaultSettings.webSocketPort) },
    });
    expect(
      screen.queryByRole('button', { name: 'Save settings' }),
    ).not.toBeInTheDocument();
  });

  it('defaults speed units to km/h and saves an mph preference', async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const units = screen.getByLabelText('Speed units');
    expect(units).toHaveValue('kmh');
    fireEvent.change(units, { target: { value: 'mph' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    expect(mocks.fennec.updateSettings).toHaveBeenCalledWith({
      ...defaultSettings,
      speedUnit: 'mph',
    });
    expect(await screen.findByText('Settings saved.')).toBeInTheDocument();
  });

  it('defaults automatic live monitor opening to on', () => {
    mocks.fennec.profile = {
      primaryId: 'Steam|you|0',
      displayName: 'You',
    };
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const autoOpen = screen.getByRole('checkbox', {
      name: /Automatically open the live monitor/i,
    });
    expect(autoOpen).toBeChecked();
    expect(autoOpen).toBeEnabled();
    expect(screen.getByText(/on by default/i)).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('requires a selected player before automatic live monitor opening can be changed', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const autoOpen = screen.getByRole('checkbox', {
      name: /Automatically open the live monitor/i,
    });
    expect(autoOpen).toBeChecked();
    expect(autoOpen).toBeDisabled();
    expect(autoOpen).toHaveAccessibleDescription(
      /select your player before Fennec can automatically open/i,
    );
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Player required.');
    expect(note).toHaveTextContent(/select your player/i);
    expect(
      screen.getByRole('link', { name: 'Choose your player' }),
    ).toHaveAttribute('href', '/profile#player-selection');
  });

  it('describes browser-only storage without pairing language', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByText(/When a compatible companion is not running/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/paired companion/i)).not.toBeInTheDocument();
  });

  it('merges durable data and companion controls when canonical sync is available', () => {
    mocks.fennec.syncStatus = {
      mode: 'restoring',
      completedMatches: 12,
      totalMatches: 30,
    };
    mocks.companion = {
      checking: false,
      recheck: vi.fn(),
      health: {
        paired: true,
        dataSyncVersion: 1,
        canonicalMatches: 30,
        databaseBytes: 2_097_152,
        pendingFrames: 0,
        gameRunning: false,
      },
    };

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', { name: 'Data and companion' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/companion keeps the durable copy/i),
    ).toBeInTheDocument();
    expect(screen.getByText('Restoring 12 of 30 matches…')).toBeInTheDocument();
    const restore = screen.getByRole('button', { name: 'Restore backup' });
    expect(restore).toBeDisabled();
    expect(restore).toHaveAccessibleDescription(
      'Wait for companion synchronization to finish before restoring a backup, rebuilding the browser cache, or deleting history.',
    );
    expect(
      screen.getByRole('button', { name: 'Rebuild browser cache' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Delete all history' }),
    ).toBeDisabled();
    expect(screen.getByText('Live companion footprint')).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Local data' }),
    ).not.toBeInTheDocument();
  });

  it('explains which data actions require Rocket League to close', () => {
    mocks.fennec.syncStatus = { mode: 'synchronized' };
    mocks.companion = {
      checking: false,
      recheck: vi.fn(),
      health: {
        paired: true,
        dataSyncVersion: 1,
        canonicalMatches: 30,
        databaseBytes: 2_097_152,
        pendingFrames: 0,
        gameRunning: true,
      },
    };

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const message =
      'Close Rocket League before restoring a backup or deleting history.';
    expect(screen.getByText(message)).toHaveAttribute('role', 'status');
    expect(
      screen.getByRole('button', { name: 'Restore backup' }),
    ).toHaveAccessibleDescription(message);
    expect(
      screen.getByRole('button', { name: 'Restore backup' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Rebuild browser cache' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete all history' }),
    ).toBeDisabled();
  });

  it('combines the data-action guidance when capture and sync are busy', () => {
    mocks.fennec.syncStatus = { mode: 'reconciling', pendingFrames: 3 };
    mocks.companion = {
      checking: false,
      recheck: vi.fn(),
      health: {
        paired: true,
        dataSyncVersion: 1,
        canonicalMatches: 30,
        databaseBytes: 2_097_152,
        pendingFrames: 3,
        gameRunning: true,
      },
    };

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const message =
      'Close Rocket League and wait for companion synchronization to finish before restoring a backup, rebuilding the browser cache, or deleting history.';
    expect(screen.getByText(message)).toHaveAttribute('role', 'status');
    for (const name of [
      'Restore backup',
      'Rebuild browser cache',
      'Delete all history',
    ]) {
      const button = screen.getByRole('button', { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(message);
    }
  });

  it('does not show data-action guidance when companion actions are available', () => {
    mocks.fennec.syncStatus = { mode: 'synchronized' };
    mocks.companion = {
      checking: false,
      recheck: vi.fn(),
      health: {
        paired: true,
        dataSyncVersion: 1,
        canonicalMatches: 30,
        databaseBytes: 2_097_152,
        pendingFrames: 0,
        gameRunning: false,
      },
    };

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.queryByText(/before restoring a backup/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Restore backup' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Rebuild browser cache' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Delete all history' }),
    ).toBeEnabled();
  });
});
