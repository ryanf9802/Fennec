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
import { recoverActiveMatch } from '../domain/reducer';
import {
  isTrackablePrimaryId,
  playerKeyForPrimaryId,
} from '../domain/playerIdentity';
import { inferInitialProfile } from '../domain/profileInference';
import { isHistoryEligibleMatch, isTrainingMatch } from '../domain/playlists';
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
  clearProfile,
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
import { BrowserMatchReducer } from '../feed/BrowserMatchReducer';
import type {
  CompanionSyncStatus,
  StatsFeedAdapter,
} from '../feed/StatsFeedAdapter';
import { createDemoHistory } from '../feed/demoHistory';
import { demoModeEnabled } from '../platform/demoMode';
import {
  companionDeleteHistory,
  companionRestore,
  companionSnapshot,
} from '../companion/client';

interface FennecContextValue {
  ready: boolean;
  activeMatch?: MatchState;
  profile?: FennecProfile;
  sessionPlayerCandidates: FennecProfile[];
  settings: FennecSettings;
  connection: FeedConnectionState;
  statsApiVerified: boolean;
  diagnostic?: string;
  syncStatus: CompanionSyncStatus;
  demoMode: boolean;
  updateSettings(next: FennecSettings): Promise<void>;
  selectProfile(next: FennecProfile): Promise<void>;
  deleteMatch(id: string): Promise<boolean>;
  endSession(): Promise<EndSessionResult>;
  deleteHistory(canonical?: boolean): Promise<void>;
  restoreBackup(backup: FennecBackup, canonical?: boolean): Promise<void>;
  rebuildBrowserCache(): Promise<void>;
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
  const [sessionPlayerCandidates, setSessionPlayerCandidates] = useState<
    FennecProfile[]
  >([]);
  const [settings, setSettings] = useState<FennecSettings>(defaultSettings);
  const [connection, setConnection] = useState<FeedConnectionState>('stopped');
  const [statsApiVerified, setStatsApiVerified] = useState(
    storedStatsApiVerification,
  );
  const statsApiVerifiedRef = useRef(statsApiVerified);
  const [diagnostic, setDiagnostic] = useState<string>();
  const [syncStatus, setSyncStatus] = useState<CompanionSyncStatus>({
    mode: 'browser-only',
  });
  const activeRef = useRef<MatchState | undefined>(undefined);
  const profileRef = useRef<FennecProfile | undefined>(undefined);
  const settingsRef = useRef<FennecSettings>(defaultSettings);
  const historyGenerationRef = useRef(0);
  const feedRef = useRef<StatsFeedAdapter | undefined>(undefined);
  const browserMatchReducerRef = useRef(new BrowserMatchReducer());
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const demoMode = demoModeEnabled(
    location.search,
    import.meta.env.VITE_DEMO_FEED === 'true',
    import.meta.env.PROD,
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
      settingsRef.current = storedSettings;
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
      onSyncStatus: setSyncStatus,
      onCanonicalReset: async () => {
        await clearHistory();
        await queryClient.invalidateQueries({ queryKey: historyKeys.all });
      },
      onCheckpoint: async (match) => {
        if (!isHistoryEligibleMatch(match)) return;
        await saveMatch(match, settings.sessionGapMinutes);
        const active = activeRef.current;
        if (
          match.lifecycle === 'live' &&
          (!active ||
            active.lifecycle !== 'live' ||
            match.lastEventAt >= active.lastEventAt)
        ) {
          // Rebase reduction onto the companion's canonical live checkpoint.
          // Otherwise a fresh browser starts the next guid-less frame as a new
          // match and uploads a duplicate checkpoint under a random id.
          activeRef.current = match;
          setActiveMatch(match);
          setConnection('live');
        }
        await queryClient.invalidateQueries({ queryKey: historyKeys.all });
      },
      onTombstone: async (matchId) => {
        await deleteStoredMatch(matchId);
        await queryClient.invalidateQueries({ queryKey: historyKeys.all });
      },
      onPreferences: async (canonicalSettings, canonicalProfile) => {
        const normalized = normalizeSettings(canonicalSettings);
        await saveSettings(normalized);
        if (canonicalProfile) await saveProfile(canonicalProfile);
        else await clearProfile();
        profileRef.current = canonicalProfile;
        settingsRef.current = normalized;
        setProfile(canonicalProfile);
        setSettings(normalized);
        applyTheme(normalized.theme);
        await queryClient.invalidateQueries({ queryKey: historyKeys.all });
      },
      /**
       * Reduces each feed envelope into live state, checkpoints durable match
       * history, and keeps the selected or inferred profile synchronized.
       */
      onEnvelope: async (envelope) => {
        const { previous, result } =
          await browserMatchReducerRef.current.reduce(
            () => activeRef.current,
            envelope,
            (match) => {
              activeRef.current = match;
            },
          );
        const trainingMatches = [result.superseded, result.current].filter(
          (match): match is MatchState => !!match && isTrainingMatch(match),
        );
        if (trainingMatches.length)
          setSessionPlayerCandidates((current) => {
            const next = new Map(
              current.map((candidate) => [candidate.primaryId, candidate]),
            );
            for (const match of trainingMatches)
              for (const participant of match.participants)
                if (isTrackablePrimaryId(participant.primaryId))
                  next.set(participant.primaryId, {
                    primaryId: participant.primaryId,
                    displayName: participant.name,
                  });
            const candidates = [...next.values()];
            return candidates.length === current.length &&
              candidates.every(
                (candidate, index) =>
                  candidate.primaryId === current[index]?.primaryId &&
                  candidate.displayName === current[index]?.displayName,
              )
              ? current
              : candidates;
          });
        const inference = profileRef.current
          ? undefined
          : inferInitialProfile(result.current);
        const inferredProfile =
          inference?.status === 'resolved' ? inference.profile : undefined;
        if (inferredProfile) {
          profileRef.current = inferredProfile;
          setProfile(inferredProfile);
        }
        const selected = profileRef.current;
        if (!result.current.observedByPrimaryId && selected)
          result.current.observedByPrimaryId = selected.primaryId;
        setActiveMatch(
          result.current.lifecycle === 'live' ? result.current : undefined,
        );
        const nextConnection =
          result.current.lifecycle === 'live' ? 'live' : 'waiting';
        setConnection(nextConnection);
        const addedEvent =
          result.current.events.length > (previous?.events.length ?? 0);
        if (result.superseded) {
          if (isHistoryEligibleMatch(result.superseded))
            feed.checkpoint?.(result.superseded);
          persist(result.superseded);
        }
        if (isHistoryEligibleMatch(result.current))
          feed.checkpoint?.(result.current);
        schedule(
          result.current,
          addedEvent || result.current.lifecycle !== 'live',
        );
        const selectedPlayer =
          selected &&
          result.current.participants.find(
            (player) => player.primaryId === selected.primaryId,
          );
        if (inferredProfile) {
          await saveProfile(inferredProfile);
          feed.preferences?.(settingsRef.current, inferredProfile);
          await historyRepository.prepareProfileSessions(
            playerKeyForPrimaryId(inferredProfile.primaryId)!,
          );
          await queryClient.invalidateQueries({ queryKey: historyKeys.all });
        } else if (
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
          feed.preferences?.(settingsRef.current, next);
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
    settingsRef.current = normalized;
    setSettings(normalized);
    applyTheme(normalized.theme);
    feedRef.current?.preferences?.(normalized, profileRef.current);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const selectProfile = useCallback(async (next: FennecProfile) => {
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
    feedRef.current?.preferences?.(settingsRef.current, next);
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
    const latest = await historyRepository.loadLatestMatch();
    if (result !== 'unchanged' && latest) feedRef.current?.checkpoint?.(latest);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
    return result;
  }, []);
  const clearLocalHistory = useCallback(async () => {
    historyGenerationRef.current++;
    try {
      await clearHistory();
      activeRef.current = undefined;
      setActiveMatch(undefined);
    } finally {
      setHistoryGeneration(historyGenerationRef.current);
    }
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);

  const applyReplacement = useCallback(async (backup: FennecBackup) => {
    historyGenerationRef.current++;
    try {
      const normalizedSettings = normalizeSettings(backup.settings);
      await replaceAll(backup.matches, normalizedSettings, backup.profile);
      const active = recoverActiveMatch(backup.matches);
      activeRef.current = active;
      profileRef.current = backup.profile;
      settingsRef.current = normalizedSettings;
      setActiveMatch(active);
      setSettings(normalizedSettings);
      setProfile(backup.profile);
      applyTheme(normalizedSettings.theme);
    } finally {
      setHistoryGeneration(historyGenerationRef.current);
    }
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);

  const deleteHistory = useCallback(
    async (canonical = false) => {
      if (canonical) {
        await companionDeleteHistory();
        const snapshot = await companionSnapshot();
        await applyReplacement({
          format: 'fennec-backup',
          version: 5,
          exportedAt: new Date().toISOString(),
          settings: normalizeSettings(snapshot.settings),
          profile: snapshot.profile,
          matches: snapshot.matches,
        });
      } else {
        for await (const match of historyRepository.iterateMatches())
          feedRef.current?.tombstone?.(match.id);
        await clearLocalHistory();
      }
    },
    [applyReplacement, clearLocalHistory],
  );

  const restoreBackup = useCallback(
    async (backup: FennecBackup, canonical = false) => {
      if (canonical) {
        await companionRestore({
          matches: backup.matches,
          settings: normalizeSettings(backup.settings),
          profile: backup.profile,
        });
        const snapshot = await companionSnapshot();
        await applyReplacement({
          format: 'fennec-backup',
          version: 5,
          exportedAt: new Date().toISOString(),
          settings: normalizeSettings(snapshot.settings),
          profile: snapshot.profile,
          matches: snapshot.matches,
        });
      } else await applyReplacement(backup);
    },
    [applyReplacement],
  );

  const rebuildBrowserCache = useCallback(async () => {
    const snapshot = await companionSnapshot();
    await applyReplacement({
      format: 'fennec-backup',
      version: 5,
      exportedAt: new Date().toISOString(),
      settings: normalizeSettings(snapshot.settings),
      profile: snapshot.profile,
      matches: snapshot.matches,
    });
  }, [applyReplacement]);
  const value = useMemo<FennecContextValue>(
    () => ({
      ready,
      activeMatch,
      profile,
      sessionPlayerCandidates,
      settings,
      connection,
      statsApiVerified,
      diagnostic,
      syncStatus,
      demoMode,
      updateSettings,
      selectProfile,
      deleteMatch,
      endSession,
      deleteHistory,
      restoreBackup,
      rebuildBrowserCache,
    }),
    [
      ready,
      activeMatch,
      profile,
      sessionPlayerCandidates,
      settings,
      connection,
      statsApiVerified,
      diagnostic,
      syncStatus,
      demoMode,
      updateSettings,
      selectProfile,
      deleteMatch,
      endSession,
      deleteHistory,
      restoreBackup,
      rebuildBrowserCache,
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
