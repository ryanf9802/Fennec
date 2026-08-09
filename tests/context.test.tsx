import { act, render, screen, waitFor } from '@testing-library/react';
import { ConnectionStatus } from '../src/components/ConnectionStatus';
import type { MatchState, StatsEnvelope } from '../src/domain/types';
import type { StatsFeedHandlers } from '../src/feed/StatsFeedAdapter';

const mocks = vi.hoisted(() => ({
  handlers: undefined as StatsFeedHandlers | undefined,
  pendingSaves: [] as Array<() => void>,
  savedMatches: [] as MatchState[],
  latestMatch: undefined as MatchState | undefined,
  profile: undefined as { primaryId: string; displayName: string } | undefined,
  endCurrentSession: vi.fn(async () => 'ended' as const),
}));

vi.mock('../src/data/database', () => ({
  clearHistory: vi.fn(),
  deleteMatch: vi.fn(async () => true),
  endCurrentSession: mocks.endCurrentSession,
  historyRepository: {
    initialize: vi.fn(async () => undefined),
    countMatches: vi.fn(async () => 0),
    loadLatestMatch: vi.fn(async () => mocks.latestMatch),
    loadLiveMatches: vi.fn(async () => []),
  },
  loadProfile: vi.fn(async () => mocks.profile),
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
    (match: MatchState) =>
      new Promise<void>((resolve) => {
        mocks.savedMatches.push(match);
        mocks.pendingSaves.push(resolve);
      }),
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

function EndSessionProbe() {
  const { endSession } = useFennec();
  return <button onClick={() => void endSession()}>End session</button>;
}

function ProfileSwitchProbe() {
  const { selectProfile } = useFennec();
  return (
    <button
      onClick={() =>
        void selectProfile({
          primaryId: 'Epic|replacement|0',
          displayName: 'Replacement',
        })
      }
    >
      Switch profile
    </button>
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
    mocks.savedMatches.length = 0;
    mocks.latestMatch = undefined;
    mocks.profile = undefined;
    mocks.handlers = undefined;
    mocks.endCurrentSession.mockClear();
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

  it('attributes a new match once to the profile observing it', async () => {
    mocks.profile = { primaryId: 'Steam|viewer|0', displayName: 'Viewer' };
    render(
      <FennecProvider>
        <ClockProbe />
        <ProfileSwitchProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    act(() => {
      void mocks.handlers!.onEnvelope(clockUpdate(12));
    });
    act(() => screen.getByRole('button', { name: 'Switch profile' }).click());
    act(() => {
      void mocks.handlers!.onEnvelope(clockUpdate(11));
    });

    expect(mocks.savedMatches.at(-1)?.observedByPrimaryId).toBe(
      'Steam|viewer|0',
    );
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

  it('keeps post-game packets with the latest completed match after reload', async () => {
    mocks.latestMatch = {
      id: 'stored-match',
      matchGuid: 'same-guid',
      lifecycle: 'completed',
      startedAt: '2026-08-08T00:00:00Z',
      lastEventAt: '2026-08-08T00:05:00Z',
      endedAt: '2026-08-08T00:05:00Z',
      playlistId: 13,
      playlistName: 'Ranked Standard',
      playlistCategory: 'ranked',
      arena: 'Neo Tokyo',
      timeSeconds: 0,
      isOvertime: false,
      isReplay: false,
      teams: [],
      participants: [],
      events: [],
    };
    render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    act(() => {
      void mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: { MatchGuid: 'same-guid', Game: { TimeSeconds: 0 } },
      });
      void mocks.handlers!.onEnvelope({
        event: 'MatchDestroyed',
        data: { MatchGuid: 'same-guid' },
      });
    });

    expect(screen.getByText('no active match')).toBeInTheDocument();
    expect(mocks.savedMatches.at(-1)).toMatchObject({
      id: 'stored-match',
      lifecycle: 'completed',
    });

    act(() => {
      void mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: { MatchGuid: 'new-guid', Game: { TimeSeconds: 300 } },
      });
    });

    expect(screen.getByText('active match')).toBeInTheDocument();
  });

  it('splits before the active match when ending a live session', async () => {
    render(
      <FennecProvider>
        <EndSessionProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());
    act(() => {
      void mocks.handlers!.onEnvelope({
        event: 'MatchCreated',
        data: { MatchGuid: 'live-match' },
      });
    });

    screen.getByRole('button', { name: 'End session' }).click();

    await waitFor(() =>
      expect(mocks.endCurrentSession).toHaveBeenCalledWith('live-match'),
    );
  });
});
