import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ConnectionStatus } from '../src/components/ConnectionStatus';
import { defaultSettings } from '../src/domain/types';
import type { MatchState, StatsEnvelope } from '../src/domain/types';
import type { StatsFeedHandlers } from '../src/feed/StatsFeedAdapter';

const mocks = vi.hoisted(() => ({
  handlers: undefined as StatsFeedHandlers | undefined,
  pendingSaves: [] as Array<() => void>,
  savedMatches: [] as MatchState[],
  checkpoints: [] as MatchState[],
  preferences: [] as Array<
    { primaryId: string; displayName: string } | undefined
  >,
  latestMatch: undefined as MatchState | undefined,
  profile: undefined as { primaryId: string; displayName: string } | undefined,
  endCurrentSession: vi.fn(async () => 'ended' as const),
  saveProfile: vi.fn(),
  saveSettings: vi.fn(),
  clearProfile: vi.fn(),
  prepareProfileSessions: vi.fn(async () => undefined),
  replaceAll: vi.fn(async () => undefined),
  companionDeleteHistory: vi.fn(async () => undefined),
  companionRestore: vi.fn(async () => undefined),
  companionSnapshot: vi.fn(),
}));
const storedBrowserValues = new Map<string, string>();

vi.mock('../src/feed/HybridStatsFeed', () => ({
  HybridStatsFeed: class {
    start(handlers: StatsFeedHandlers) {
      mocks.handlers = handlers;
    }
    stop() {}
    checkpoint(match: MatchState) {
      mocks.checkpoints.push(match);
    }
    tombstone() {}
    preferences(
      _settings: unknown,
      profile?: { primaryId: string; displayName: string },
    ) {
      mocks.preferences.push(profile);
    }
  },
}));

vi.mock('../src/data/database', () => ({
  clearHistory: vi.fn(),
  clearProfile: mocks.clearProfile,
  deleteMatch: vi.fn(async () => true),
  endCurrentSession: mocks.endCurrentSession,
  historyRepository: {
    initialize: vi.fn(async () => undefined),
    countMatches: vi.fn(async () => 0),
    prepareProfileSessions: mocks.prepareProfileSessions,
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
  replaceAll: mocks.replaceAll,
  saveMatch: vi.fn(
    (match: MatchState) =>
      new Promise<void>((resolve) => {
        mocks.savedMatches.push(match);
        mocks.pendingSaves.push(resolve);
      }),
  ),
  saveProfile: mocks.saveProfile,
  saveSettings: mocks.saveSettings,
}));

vi.mock('../src/companion/client', () => ({
  companionDeleteHistory: mocks.companionDeleteHistory,
  companionRestore: mocks.companionRestore,
  companionSnapshot: mocks.companionSnapshot,
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
  const { activeMatch, connection, statsApiVerified } = useFennec();
  return (
    <>
      <ConnectionStatus connection={connection} />
      <div>{activeMatch ? 'active match' : 'no active match'}</div>
      <div>
        {statsApiVerified ? 'Stats API verified' : 'Stats API unverified'}
      </div>
    </>
  );
}

function ProfileProbe() {
  const { profile } = useFennec();
  return (
    <div>
      {profile ? `${profile.displayName}:${profile.primaryId}` : 'no profile'}
    </div>
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

function SessionPlayerCandidatesProbe() {
  const { sessionPlayerCandidates } = useFennec();
  return (
    <div>
      {sessionPlayerCandidates.map((candidate) => (
        <span key={candidate.primaryId}>
          {candidate.displayName}:{candidate.primaryId}
        </span>
      ))}
    </div>
  );
}

function DataActionsProbe() {
  const { activeMatch, deleteHistory, restoreBackup } = useFennec();
  return (
    <>
      <div>{activeMatch?.id ?? 'no active match'}</div>
      <button onClick={() => void deleteHistory(true)}>Delete canonical</button>
      <button
        onClick={() =>
          void restoreBackup(
            {
              format: 'fennec-backup',
              version: 5,
              exportedAt: '2026-08-13T12:00:00Z',
              settings: defaultSettings,
              matches: [],
            },
            true,
          )
        }
      >
        Restore canonical
      </button>
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

function stateUpdate(playlistId: number, matchGuid = ''): StatsEnvelope {
  return {
    event: 'UpdateState',
    data: {
      MatchGuid: matchGuid,
      Players: [
        {
          Name: 'Viewer',
          PrimaryId: 'Steam|viewer|0',
          Shortcut: 1,
          TeamNum: 0,
        },
      ],
      Game: { PlaylistId: playlistId, TimeSeconds: 300 },
    },
  };
}

describe('Fennec live state', () => {
  beforeEach(() => {
    storedBrowserValues.clear();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storedBrowserValues.get(key) ?? null,
        setItem: (key: string, value: string) =>
          storedBrowserValues.set(key, value),
        removeItem: (key: string) => storedBrowserValues.delete(key),
      },
    });
  });

  afterEach(() => {
    for (const resolve of mocks.pendingSaves.splice(0)) resolve();
    mocks.savedMatches.length = 0;
    mocks.checkpoints.length = 0;
    mocks.preferences.length = 0;
    mocks.latestMatch = undefined;
    mocks.profile = undefined;
    mocks.handlers = undefined;
    mocks.endCurrentSession.mockClear();
    mocks.saveProfile.mockClear();
    mocks.saveSettings.mockClear();
    mocks.clearProfile.mockClear();
    mocks.prepareProfileSessions.mockClear();
    mocks.replaceAll.mockClear();
    mocks.companionDeleteHistory.mockClear();
    mocks.companionRestore.mockClear();
    mocks.companionSnapshot.mockReset();
    window.localStorage.removeItem('fennec-stats-api-verified-v1');
  });

  it('rebuilds canonical data actions from the companion result', async () => {
    const current = {
      id: 'current-live',
      lifecycle: 'live',
      startedAt: new Date().toISOString(),
      lastEventAt: new Date().toISOString(),
      participants: [],
      teams: [],
      events: [],
    } as unknown as MatchState;
    mocks.companionSnapshot.mockResolvedValue({
      matches: [current],
      settings: defaultSettings,
      profile: undefined,
    });

    render(
      <FennecProvider>
        <DataActionsProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Delete canonical' }));
    await waitFor(() =>
      expect(mocks.companionDeleteHistory).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(screen.getByText('current-live')).toBeInTheDocument(),
    );
    expect(mocks.replaceAll).toHaveBeenLastCalledWith(
      [current],
      expect.objectContaining({ theme: defaultSettings.theme }),
      undefined,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Restore canonical' }));
    await waitFor(() =>
      expect(mocks.companionRestore).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(mocks.companionSnapshot).toHaveBeenCalledTimes(2),
    );
    await waitFor(() => expect(mocks.replaceAll).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByText('current-live')).toBeInTheDocument(),
    );
  });

  it('keeps successful Stats API verification after disconnection and remount', async () => {
    const first = render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());
    expect(screen.getByText('Stats API unverified')).toBeInTheDocument();

    act(() => mocks.handlers!.onStatsApiVerified?.());
    expect(screen.getByText('Stats API verified')).toBeInTheDocument();
    expect(window.localStorage.getItem('fennec-stats-api-verified-v1')).toBe(
      'true',
    );

    act(() => mocks.handlers!.onState('unavailable'));
    expect(screen.getByText('Stats API verified')).toBeInTheDocument();
    first.unmount();
    mocks.handlers = undefined;

    render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());
    expect(screen.getByText('Stats API verified')).toBeInTheDocument();
  });

  it('keeps training live without saving or checkpointing it', async () => {
    mocks.profile = { primaryId: 'Steam|viewer|0', displayName: 'Viewer' };
    render(
      <FennecProvider>
        <LiveStateProbe />
        <SessionPlayerCandidatesProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    await act(async () => {
      await mocks.handlers!.onEnvelope(stateUpdate(9));
      await mocks.handlers!.onCheckpoint?.({
        id: 'companion-training',
        lifecycle: 'live',
        startedAt: '2026-08-09T00:00:00Z',
        lastEventAt: '2026-08-09T00:00:01Z',
        playlistId: 9,
        playlistName: 'Training',
        playlistCategory: 'unknown',
        arena: 'Woods',
        timeSeconds: 1,
        isOvertime: false,
        isReplay: false,
        teams: [],
        participants: [],
        events: [],
      });
    });

    expect(screen.getByText('active match')).toBeInTheDocument();
    expect(
      screen.getByRole('status', { name: 'Connection status: Live' }),
    ).toBeInTheDocument();
    expect(mocks.savedMatches).toEqual([]);
    expect(mocks.checkpoints).toEqual([]);
    expect(screen.getByText('Viewer:Steam|viewer|0')).toBeInTheDocument();

    await act(async () => {
      await mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: {
          Players: [
            {
              Name: 'Unknown player',
              PrimaryId: 'Unknown|0|0',
              Shortcut: 2,
              TeamNum: 0,
            },
          ],
          Game: { PlaylistId: 9, TimeSeconds: 299 },
        },
      });
      await mocks.handlers!.onEnvelope({
        event: 'MatchDestroyed',
        data: { MatchGuid: '' },
      });
    });

    expect(screen.getByText('Viewer:Steam|viewer|0')).toBeInTheDocument();
    expect(screen.queryByText(/Unknown\|0\|0/)).not.toBeInTheDocument();
  });

  it('restores companion-owned settings and profile into a cleared browser', async () => {
    render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    await act(async () => {
      await mocks.handlers!.onPreferences?.(
        {
          webSocketPort: 49124,
          sessionGapMinutes: 45,
          autoOpenLiveMatch: false,
          theme: 'light',
          speedUnit: 'mph',
          timelinePreset: 'curated',
          enabledTimelineEvents: [],
          timelineAttributes: {},
          sidebarCollapsed: false,
          matchAnalyticsView: 'analytics',
          analytics: { playlistMode: 'ranked', groupByPlaylist: true },
        },
        { primaryId: 'Steam|restored|0', displayName: 'Restored' },
      );
    });

    expect(mocks.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ sessionGapMinutes: 45, speedUnit: 'mph' }),
    );
    expect(mocks.saveProfile).toHaveBeenCalledWith({
      primaryId: 'Steam|restored|0',
      displayName: 'Restored',
    });
  });

  it('continues a restored companion match when the next frame has no guid', async () => {
    render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    const restored: MatchState = {
      id: 'companion-live-match',
      lifecycle: 'live',
      startedAt: '2026-08-09T00:00:00Z',
      lastEventAt: '2026-08-09T00:00:01Z',
      playlistId: 13,
      playlistName: 'Ranked Doubles',
      playlistCategory: 'ranked',
      arena: 'DFH Stadium',
      timeSeconds: 300,
      elapsedSeconds: 0,
      isOvertime: false,
      isReplay: false,
      roundActive: true,
      roundPhaseObserved: true,
      isPaused: false,
      hasWinner: false,
      teams: [],
      participants: [],
      events: [],
    };
    let restore: Promise<void> | void;
    act(() => {
      restore = mocks.handlers!.onCheckpoint?.(restored);
    });
    await waitFor(() => expect(mocks.pendingSaves).toHaveLength(1));
    mocks.pendingSaves.shift()?.();
    await act(async () => restore);

    await act(async () => {
      await mocks.handlers!.onEnvelope(stateUpdate(13));
    });

    expect(screen.getByText('active match')).toBeInTheDocument();
    expect(mocks.checkpoints.at(-1)?.id).toBe('companion-live-match');
    expect(mocks.savedMatches.at(-1)?.id).toBe('companion-live-match');
  });

  it('infers and synchronizes the first profile before attributing a match', async () => {
    render(
      <FennecProvider>
        <ProfileProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    await act(async () => {
      await mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: {
          MatchGuid: 'first-match',
          Players: [
            {
              Name: 'Viewer',
              PrimaryId: 'Steam|viewer|0',
              Shortcut: 1,
              TeamNum: 0,
            },
            {
              Name: 'Teammate',
              PrimaryId: 'Epic|teammate|0',
              Shortcut: 2,
              TeamNum: 0,
            },
          ],
          Game: {
            PlaylistId: 11,
            TimeSeconds: 300,
            bHasTarget: true,
            Target: { Name: 'Viewer', Shortcut: 1, TeamNum: 0 },
          },
        },
      });
    });

    expect(screen.getByText('Viewer:Steam|viewer|0')).toBeInTheDocument();
    expect(mocks.saveProfile).toHaveBeenCalledOnce();
    expect(mocks.saveProfile).toHaveBeenCalledWith({
      primaryId: 'Steam|viewer|0',
      displayName: 'Viewer',
    });
    expect(mocks.preferences).toEqual([
      { primaryId: 'Steam|viewer|0', displayName: 'Viewer' },
    ]);
    expect(mocks.prepareProfileSessions).toHaveBeenCalledWith(
      'id:Steam|viewer|0',
    );
    expect(mocks.savedMatches[0]?.observedByPrimaryId).toBe('Steam|viewer|0');
  });

  it('never replaces an existing profile with the current view target', async () => {
    mocks.profile = { primaryId: 'Steam|viewer|0', displayName: 'Viewer' };
    render(
      <FennecProvider>
        <ProfileProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    await act(async () => {
      await mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: {
          Players: [
            {
              Name: 'Viewer',
              PrimaryId: 'Steam|viewer|0',
              Shortcut: 1,
              TeamNum: 0,
            },
            {
              Name: 'Teammate',
              PrimaryId: 'Epic|teammate|0',
              Shortcut: 2,
              TeamNum: 0,
            },
          ],
          Game: {
            PlaylistId: 11,
            TimeSeconds: 300,
            bHasTarget: true,
            Target: { Name: 'Teammate', Shortcut: 2, TeamNum: 0 },
          },
        },
      });
    });

    expect(screen.getByText('Viewer:Steam|viewer|0')).toBeInTheDocument();
    expect(mocks.saveProfile).not.toHaveBeenCalled();
    expect(mocks.preferences).toEqual([]);
  });

  it('starts persistence after training rolls over into a game', async () => {
    render(
      <FennecProvider>
        <LiveStateProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    await act(async () => {
      await mocks.handlers!.onEnvelope(stateUpdate(9));
      await mocks.handlers!.onEnvelope({
        event: 'MatchDestroyed',
        data: { MatchGuid: '' },
      });
      await mocks.handlers!.onEnvelope({
        event: 'MatchCreated',
        data: { MatchGuid: 'ranked-match' },
      });
      await mocks.handlers!.onEnvelope(stateUpdate(13, 'ranked-match'));
    });

    expect(mocks.savedMatches).toHaveLength(1);
    expect(mocks.savedMatches[0]).toMatchObject({
      matchGuid: 'ranked-match',
      playlistId: 13,
    });
    expect(mocks.checkpoints).toHaveLength(1);
    expect(mocks.checkpoints[0]?.playlistId).toBe(13);
  });

  it('publishes clock packets without waiting for match persistence', async () => {
    render(
      <FennecProvider>
        <ClockProbe />
      </FennecProvider>,
    );
    await waitFor(() => expect(mocks.handlers).toBeDefined());

    await act(async () => {
      await mocks.handlers!.onEnvelope(stateUpdate(13, 'live-match'));
    });
    for (const resolve of mocks.pendingSaves.splice(0)) resolve();

    await act(async () => {
      await mocks.handlers!.onEnvelope(clockUpdate(12));
      await mocks.handlers!.onEnvelope(clockUpdate(13));
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

    await act(async () => {
      await mocks.handlers!.onEnvelope(stateUpdate(13, 'live-match'));
      await mocks.handlers!.onEnvelope(clockUpdate(12));
    });
    await act(async () => {
      screen.getByRole('button', { name: 'Switch profile' }).click();
      await mocks.handlers!.onEnvelope(clockUpdate(11));
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

    await act(async () => {
      await mocks.handlers!.onEnvelope({
        event: 'MatchCreated',
        data: { MatchGuid: 'live-match' },
      });
    });
    expect(
      screen.getByRole('status', { name: 'Connection status: Live' }),
    ).toBeInTheDocument();
    expect(screen.getByText('active match')).toBeInTheDocument();

    await act(async () => {
      await mocks.handlers!.onEnvelope({
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

    await act(async () => {
      await mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: { MatchGuid: 'same-guid', Game: { TimeSeconds: 0 } },
      });
      await mocks.handlers!.onEnvelope({
        event: 'MatchDestroyed',
        data: { MatchGuid: 'same-guid' },
      });
    });

    expect(screen.getByText('no active match')).toBeInTheDocument();
    expect(mocks.savedMatches.at(-1)).toMatchObject({
      id: 'stored-match',
      lifecycle: 'completed',
    });

    await act(async () => {
      await mocks.handlers!.onEnvelope({
        event: 'UpdateState',
        data: { MatchGuid: 'new-guid', Game: { TimeSeconds: 300 } },
      });
    });

    expect(screen.getByText('active match')).toBeInTheDocument();
  });

  it('splits before the active match when ending a live session', async () => {
    mocks.profile = { primaryId: 'Steam|you|0', displayName: 'You' };
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
      expect(mocks.endCurrentSession).toHaveBeenCalledWith(
        'id:Steam|you|0',
        'live-match',
      ),
    );
  });
});
