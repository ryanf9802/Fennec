import { act, render, screen, waitFor } from '@testing-library/react';
import { ConnectionStatus } from '../src/components/ConnectionStatus';
import type { StatsEnvelope } from '../src/domain/types';
import type { StatsFeedHandlers } from '../src/feed/StatsFeedAdapter';

const mocks = vi.hoisted(() => ({
  handlers: undefined as StatsFeedHandlers | undefined,
  pendingSaves: [] as Array<() => void>,
}));

vi.mock('../src/data/database', () => ({
  clearHistory: vi.fn(),
  historyRepository: {
    initialize: vi.fn(async () => undefined),
    countMatches: vi.fn(async () => 0),
    loadLiveMatches: vi.fn(async () => []),
  },
  loadProfile: vi.fn(async () => undefined),
  loadSettings: vi.fn(async () => ({
    webSocketPort: 49124,
    sessionGapMinutes: 30,
    autoOpenLiveMatch: false,
    theme: 'dark',
    timelinePreset: 'curated',
    enabledTimelineEvents: [],
    timelineAttributes: {},
    sidebarCollapsed: false,
    analytics: { playlistMode: 'ranked', groupByPlaylist: true },
  })),
  replaceAll: vi.fn(),
  saveMatch: vi.fn(
    () => new Promise<void>((resolve) => mocks.pendingSaves.push(resolve)),
  ),
  saveProfile: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock('../src/feed/WebSocketStatsFeed', () => ({
  WebSocketStatsFeed: class {
    start(handlers: StatsFeedHandlers) {
      mocks.handlers = handlers;
    }
    stop() {}
  },
}));

vi.mock('../src/feed/SimulatedStatsFeed', () => ({
  SimulatedStatsFeed: class {
    start(handlers: StatsFeedHandlers) {
      mocks.handlers = handlers;
    }
    stop() {}
  },
}));

import { FennecProvider, useFennec } from '../src/app/FennecContext';

function ClockProbe() {
  const { activeMatch } = useFennec();
  return <div>{activeMatch?.timeSeconds ?? 'waiting'}</div>;
}

function LiveStateProbe() {
  const { activeMatch, connection } = useFennec();
  return (
    <>
      <ConnectionStatus connection={connection} />
      <div>{activeMatch ? 'active match' : 'no active match'}</div>
    </>
  );
}

function clockUpdate(timeSeconds: number): StatsEnvelope {
  return {
    event: 'ClockUpdatedSeconds',
    data: {
      MatchGuid: 'live-match',
      TimeSeconds: timeSeconds,
      bOvertime: true,
    },
  };
}

describe('Fennec live state', () => {
  afterEach(() => {
    for (const resolve of mocks.pendingSaves.splice(0)) resolve();
    mocks.handlers = undefined;
  });

  it('publishes clock packets without waiting for match persistence', async () => {
    render(
      <FennecProvider>
        <ClockProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    act(() => {
      void mocks.handlers!.onEnvelope(clockUpdate(12));
      void mocks.handlers!.onEnvelope(clockUpdate(13));
    });

    expect(screen.getByText('13')).toBeInTheDocument();
    expect(mocks.pendingSaves).toHaveLength(2);
  });

  it('returns to Connected as soon as the active match ends', async () => {
    render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    act(() => {
      void mocks.handlers!.onEnvelope({
        event: 'MatchCreated',
        data: { MatchGuid: 'live-match' },
      });
    });
    expect(
      screen.getByRole('status', { name: 'Connection status: Live' }),
    ).toBeInTheDocument();
    expect(screen.getByText('active match')).toBeInTheDocument();

    act(() => {
      void mocks.handlers!.onEnvelope({
        event: 'MatchEnded',
        data: { MatchGuid: 'live-match', WinnerTeamNum: 0 },
      });
    });
    expect(
      screen.getByRole('status', { name: 'Connection status: Connected' }),
    ).toBeInTheDocument();
    expect(screen.getByText('no active match')).toBeInTheDocument();
  });
});
