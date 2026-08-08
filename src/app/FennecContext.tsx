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
import {
  defaultSettings,
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
import { WebSocketStatsFeed } from '../feed/WebSocketStatsFeed';
import { createDemoHistory } from '../feed/demoHistory';

interface FennecContextValue {
  ready: boolean;
  activeMatch?: MatchState;
  profile?: FennecProfile;
  settings: FennecSettings;
  connection: FeedConnectionState;
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

function applyTheme(theme: FennecSettings['theme']): void {
  const resolved =
    theme === 'system'
      ? matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.dataset.theme = resolved;
}

export function FennecProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [activeMatch, setActiveMatch] = useState<MatchState>();
  const [profile, setProfile] = useState<FennecProfile>();
  const [settings, setSettings] = useState<FennecSettings>(defaultSettings);
  const [connection, setConnection] = useState<FeedConnectionState>('stopped');
  const [diagnostic, setDiagnostic] = useState<string>();
  const activeRef = useRef<MatchState | undefined>(undefined);
  const profileRef = useRef<FennecProfile | undefined>(undefined);
  const historyGenerationRef = useRef(0);
  const [historyGeneration, setHistoryGeneration] = useState(0);
  const demoMode =
    import.meta.env.VITE_DEMO_FEED === 'true' ||
    new URLSearchParams(location.search).get('demo') === '1';

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
      if (cancelled) return;
      activeRef.current = recovered;
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
    if (!ready) return;
    const feed = demoMode
      ? new SimulatedStatsFeed()
      : new WebSocketStatsFeed(`ws://127.0.0.1:${settings.webSocketPort}`);
    const generation = historyGenerationRef.current;
    let lastCheckpoint = 0;
    let timer: number | undefined;
    let pending: MatchState | undefined;
    const persist = (match: MatchState) => {
      if (generation !== historyGenerationRef.current) return;
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
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    feed.start({
      onState: setConnection,
      onDiagnostic: setDiagnostic,
      /**
       * Reduces each feed envelope into live state, checkpoints durable match
       * history, and keeps the selected or demo profile synchronized.
       */
      onEnvelope: async (envelope) => {
        const previous = activeRef.current;
        const result = reduceStatsEnvelope(previous, envelope);
        activeRef.current = result.current;
        setActiveMatch(
          result.current.lifecycle === 'live' ? result.current : undefined,
        );
        const nextConnection =
          result.current.lifecycle === 'live' ? 'live' : 'waiting';
        setConnection(nextConnection);
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
      setConnection('stopped');
    };
  }, [
    demoMode,
    historyGeneration,
    ready,
    settings.sessionGapMinutes,
    settings.webSocketPort,
  ]);

  const updateSettings = useCallback(async (next: FennecSettings) => {
    await saveSettings(next);
    setSettings(next);
    applyTheme(next.theme);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const selectProfile = useCallback(async (next: FennecProfile) => {
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
  }, []);
  const deleteMatch = useCallback(async (id: string) => {
    const deleted = await deleteStoredMatch(id);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
    return deleted;
  }, []);
  const endSession = useCallback(async () => {
    const activeMatchId =
      activeRef.current?.lifecycle === 'live'
        ? activeRef.current.id
        : undefined;
    const result = await endCurrentSession(activeMatchId);
    await queryClient.invalidateQueries({ queryKey: historyKeys.all });
    return result;
  }, []);
  const deleteHistory = useCallback(async () => {
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
  const restoreBackup = useCallback(async (backup: FennecBackup) => {
    historyGenerationRef.current++;
    try {
      await replaceAll(backup.matches, backup.settings, backup.profile);
      const active = recoverActiveMatch(backup.matches);
      activeRef.current = active;
      profileRef.current = backup.profile;
      setActiveMatch(active);
      setSettings(backup.settings);
      setProfile(backup.profile);
      applyTheme(backup.settings.theme);
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
