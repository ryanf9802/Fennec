import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { defaultSettings } from '../src/domain/types';
import { SettingsPage } from '../src/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  fennec: {} as Record<string, unknown>,
  loadMatches: vi.fn(),
}));

vi.mock('../src/app/FennecContext', () => ({
  useFennec: () => mocks.fennec,
}));

vi.mock('../src/data/database', () => ({
  historyRepository: { iterateMatches: vi.fn() },
  loadMatches: mocks.loadMatches,
}));

vi.mock('../src/data/historyQueries', () => ({
  useStorageStatistics: () => ({ data: undefined, refetch: vi.fn() }),
  useTimelineCatalog: () => ({ data: {} }),
}));

vi.mock('../src/components/CompanionSettings', () => ({
  CompanionSettings: () => null,
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
    mocks.fennec = {
      profile: undefined,
      settings: defaultSettings,
      connection: 'waiting',
      diagnostic: undefined,
      updateSettings: vi.fn(),
      deleteHistory: vi.fn(),
      restoreBackup: vi.fn(),
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
});
