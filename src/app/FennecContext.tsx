import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { recoverActiveMatch, reduceStatsEnvelope } from '../domain/reducer';
import { playerKeyForPrimaryId } from '../domain/playerIdentity';
import { isHistoryEligibleMatch } from '../domain/playlists';
import {
  defaultSettings,
  normalizeSettings,
  type FeedConnectionState,
  type FennecProfile,
  type FennecSettings,
  type MatchState,
} from '../domain/types';
import {
  clearHistory,
  deleteMatch as deleteStoredMatch,
  endCurrentSession,
  historyRepository,
  loadProfile,
  loadSettings,
  replaceAll,
  saveMatch,
  saveProfile,
  saveSettings,
} from '../data/database';
import type { EndSessionResult } from '../data/historyRepository';
import { historyKeys, queryClient } from '../data/historyQueries';
import type { FennecBackup } from '../data/backup';
import { SimulatedStatsFeed } from '../feed/SimulatedStatsFeed';
import { HybridStatsFeed } from '../feed/HybridStatsFeed';
import type { StatsFeedAdapter } from '../feed/StatsFeedAdapter';
import { createDemoHistory } from '../feed/demoHistory';
import { demoModeEnabled } from '../platform/demoMode';

interface FennecContextValue {
  ready: boolean;
  activeMatch?: MatchState;
  profile?: FennecProfile;
  settings: FennecSettings;
  connection: FeedConnectionState;
  statsApiVerified: boolean;
  diagnostic?: string;
  demoMode: boolean;
  updateSettings(next: FennecSettings): Promise<void>;
  selectProfile(next: FennecProfile): Promise<void>;
  deleteMatch(id: string): Promise<boolean>;
  endSession(): Promise<EndSessionResult>;
  deleteHistory(): Promise<void>;
  restoreBackup(backup: FennecBackup): Promise<void>;
}

const FennecContext = createContext<FennecContextValue | undefined>(undefined);
const statsApiVerifiedKey = 'fennec-stats-api-verified-v1';

function storedStatsApiVerification(): boolean {
  try {
    return window.localStorage?.getItem(statsApiVerifiedKey) === 'true';
  } catch {
    return false;
  }
}

function persistStatsApiVerification(): void {
  try {
    window.localStorage?.setItem(statsApiVerifiedKey, 'true');
  } catch {
    // Verification remains available for this visit when storage is blocked.
  }
}

function applyTheme(theme: FennecSettings['theme']): void {
  const resolved =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.dataset.theme = resolved;
}

export function FennecProvider({
  children,
  feedEnabled = true,
}: {
  children: ReactNode;
  feedEnabled?: boolean;
}) {
  const [ready, setReady] = useState(false);
  const [activeMatch, setActiveMatch] = useState<MatchState>();
  const [profile, setProfile] = useState<FennecProfile>();
  const [settings, setSettings] = useState<FennecSettings>(defaultSettings);
  const [connection, setConnection] = useState<FeedConnectionState>('stopped');
  const [statsApiVerified, setStatsApiVerified] = useState(
    storedStatsApiVerification,
  );
  const statsApiVerifiedRef = useRef(statsApiVerified);
  const [diagnostic, setDiagnostic] = useState<string>();
  const activeRef = useRef<MatchState | undefined>(undefined);
  const profileRef = useRef<FennecProfile | undefined>(undefined);
  const historyGenerationRef = useRef(0);
  const feedRef = useRef<StatsFeedAdapter | undefined>(undefined);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const demoMode = demoModeEnabled(
    location.search,
    import.meta.env.VITE_DEMO_FEED === 'true',
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await historyRepository.initialize();
      const [storedProfile, storedSettings] = await Promise.all([
        loadProfile(),
        loadSettings(),
      ]);
      if (demoMode && (await historyRepository.countMatches()) === 0) {
        for (const match of createDemoHistory())
          await saveMatch(match, storedSettings.sessionGapMinutes);
      }
      const liveMatches = await historyRepository.loadLiveMatches();
      const liveIds = new Set(liveMatches.map((match) => match.id));
      const recovered = recoverActiveMatch(liveMatches);
      for (const match of liveMatches.filter(
        (item) => liveIds.has(item.id) && item.lifecycle === 'incomplete',
      ))
        await saveMatch(match, storedSettings.sessionGapMinutes);
      const storedProfileKey = playerKeyForPrimaryId(storedProfile?.primaryId);
      if (storedProfileKey)
        await historyRepository.prepareProfileSessions(storedProfileKey);
      const reducerMatch =
        recovered ?? (await historyRepository.loadLatestMatch());
      if (cancelled) return;
      activeRef.current = reducerMatch;
      profileRef.current = storedProfile;
      setActiveMatch(recovered);
      setProfile(storedProfile);
      setSettings(storedSettings);
      applyTheme(storedSettings.theme);
      setReady(true);
    })().catch((error) =>
      setDiagnostic(
        `Could not initialize local history: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
    return () => {
      cancelled = true;
    };
  }, [demoMode]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!ready || (!demoMode && !feedEnabled)) return;
    const feed: StatsFeedAdapter = demoMode
      ? new SimulatedStatsFeed()
      : new HybridStatsFeed(`ws://127.0.0.1:${settings.webSocketPort}`);
    feedRef.current = feed;
    const generation = historyGenerationRef.current;
    let lastCheckpoint = 0;
    let timer: number | undefined;
    let pending: MatchState | undefined;
    const persist = (match: MatchState) => {
      if (
        generation !== historyGenerationRef.current ||
        !isHistoryEligibleMatch(match)
      )
        return;
      lastCheckpoint = Date.now();
      pending = undefined;
      void saveMatch(match, settings.sessionGapMinutes)
        .then(() => {
          if (match.lifecycle !== 'live')
            void queryClient.invalidateQueries({ queryKey: historyKeys.all });
        })
        .catch((error) =>
          setDiagnostic(
            `Could not save match history: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
    };
    const schedule = (match: MatchState, immediate: boolean) => {
      if (!isHistoryEligibleMatch(match)) {
        if (pending?.id === match.id) pending = undefined;
        return;
      }
      pending = match;
      if (immediate || Date.now() - lastCheckpoint >= 1_000) {
        if (timer) window.clearTimeout(timer);
        timer = undefined;
        persist(match);
      } else if (!timer) {
        timer = window.setTimeout(
          () => {
            timer = undefined;
            if (pending) persist(pending);
          },
          Math.max(0, 1_000 - (Date.now() - lastCheckpoint)),
        );
      }
    };
    const flush = () => {
      if (pending) persist(pending);
    };
    const markStatsApiVerified = () => {
      if (statsApiVerifiedRef.current) return;
      statsApiVerifiedRef.current = true;
      setStatsApiVerified(true);
      if (!demoMode) persistStatsApiVerification();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    feed.start({
      onState: setConnection,
      onStatsApiVerified: markStatsApiVerified,
      onDiagnostic: setDiagnostic,
      onCheckpoint: async (match) => {
        if (!isHistoryEligibleMatch(match)) return;
        await saveMatch(match, settings.sessionGapMinutes);
        await queryClient.invalidateQueries({ queryKey: historyKeys.all });
      },
      onTombstone: async (matchId) => {
        await deleteStoredMatch(matchId);
        await queryClient.invalidateQueries({ queryKey: historyKeys.all });
      },
      /**
       * Reduces each feed envelope into live state, checkpoints durable match
       * history, and keeps the selected or demo profile synchronized.
       */
      onEnvelope: async (envelope) => {
        const previous = activeRef.current;
        const result = reduceStatsEnvelope(previous, envelope);
        if (!result.current.observedByPrimaryId && profileRef.current)
          result.current.observedByPrimaryId = profileRef.current.primaryId;
        activeRef.current = result.current;
        setActiveMatch(
          result.current.lifecycle === 'live' ? result.current : undefined,
        );
        const nextConnection =
          result.current.lifecycle === 'live' ? 'live' : 'waiting';
        setConnection(nextConnection);
        if (isHistoryEligibleMatch(result.current))
          feed.checkpoint?.(result.current);
        const addedEvent =
          result.current.events.length > (previous?.events.length ?? 0);
        if (result.superseded) persist(result.superseded);
        schedule(
          result.current,
          addedEvent || result.current.lifecycle !== 'live',
        );
        const selected = profileRef.current;
        const selectedPlayer =
          selected &&
          result.current.participants.find(
            (player) => player.primaryId === selected.primaryId,
          );
        if (
          selected &&
          selectedPlayer &&
          selected.displayName !== selectedPlayer.name
        ) {
          const next = {
            primaryId: selected.primaryId,
            displayName: selectedPlayer.name,
          };
          profileRef.current = next;
          setProfile(next);
          await saveProfile(next);
        } else if (demoMode && !selected) {
          const demoPlayer = result.current.participants.find(
            (player) => player.primaryId === 'Steam|demo-you|0',
          );
          if (demoPlayer?.primaryId) {
            const next = {
              primaryId: demoPlayer.primaryId,
              displayName: demoPlayer.name,
            };
            profileRef.current = next;
            setProfile(next);
            await saveProfile(next);
          }
        }
      },
    });
    return () => {
      flush();
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
      feed.stop();
      if (feedRef.current === feed) feedRef.current = undefined;
      setConnection('stopped');
    };
  }, [
    demoMode,
    historyGeneration,
    feedEnabled,
    ready,
    settings.sessionGapMinutes,
    settings.webSocketPort,
  ]);

  const updateSettings = useCallback(async (next: FennecSettings) => {
    const normalized = normalizeSettings(next);
    await saveSettings(normalized);
    setSettings(normalized);
    applyTheme(normalized.theme);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const selectProfile = useCallback(async (next: FennecProfile) => {
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
    await historyRepository.prepareProfileSessions(
      playerKeyForPrimaryId(next.primaryId)!,
    );
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const deleteMatch = useCallback(async (id: string) => {
    const deleted = await deleteStoredMatch(id);
    if (deleted) feedRef.current?.tombstone?.(id);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
    return deleted;
  }, []);
  const endSession = useCallback(async () => {
    const profileKey = playerKeyForPrimaryId(profileRef.current?.primaryId);
    if (!profileKey) return 'unchanged';
    const activeMatchId =
      activeRef.current?.lifecycle === 'live'
        ? activeRef.current.id
        : undefined;
    const result = await endCurrentSession(profileKey, activeMatchId);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
    return result;
  }, []);
  const deleteHistory = useCallback(async () => {
    historyGenerationRef.current++;
    try {
      for await (const match of historyRepository.iterateMatches())
        feedRef.current?.tombstone?.(match.id);
      await clearHistory();
      activeRef.current = undefined;
      setActiveMatch(undefined);
    } finally {
      setHistoryGeneration(historyGenerationRef.current);
    }
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const restoreBackup = useCallback(async (backup: FennecBackup) => {
    historyGenerationRef.current++;
    try {
      const normalizedSettings = normalizeSettings(backup.settings);
      await replaceAll(backup.matches, normalizedSettings, backup.profile);
      const active = recoverActiveMatch(backup.matches);
      activeRef.current = active;
      profileRef.current = backup.profile;
      setActiveMatch(active);
      setSettings(normalizedSettings);
      setProfile(backup.profile);
      applyTheme(normalizedSettings.theme);
    } finally {
      setHistoryGeneration(historyGenerationRef.current);
    }
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const value = useMemo<FennecContextValue>(
    () => ({
      ready,
      activeMatch,
      profile,
      settings,
      connection,
      statsApiVerified,
      diagnostic,
      demoMode,
      updateSettings,
      selectProfile,
      deleteMatch,
      endSession,
      deleteHistory,
      restoreBackup,
    }),
    [
      ready,
      activeMatch,
      profile,
      settings,
      connection,
      statsApiVerified,
      diagnostic,
      demoMode,
      updateSettings,
      selectProfile,
      deleteMatch,
      endSession,
      deleteHistory,
      restoreBackup,
    ],
  );
  return (
    <FennecContext.Provider value={value}>{children}</FennecContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFennec(): FennecContextValue {
  const value = useContext(FennecContext);
  if (!value) throw new Error('useFennec must be used inside FennecProvider.');
  return value;
}
