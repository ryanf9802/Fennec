import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { calculateEncounters } from '../domain/encounters';
import { recoverActiveMatch, reduceStatsEnvelope } from '../domain/reducer';
import { groupSessions } from '../domain/sessions';
import { defaultSettings, type EncounterSummary, type FeedConnectionState, type FennecProfile, type FennecSettings, type MatchState, type SessionGroup } from '../domain/types';
import { clearHistory, loadMatches, loadProfile, loadSettings, replaceAll, saveMatch, saveProfile, saveSettings } from '../data/database';
import type { FennecBackup } from '../data/backup';
import { SimulatedStatsFeed } from '../feed/SimulatedStatsFeed';
import { WebSocketStatsFeed } from '../feed/WebSocketStatsFeed';
import { createDemoHistory } from '../feed/demoHistory';

interface FennecContextValue {
  ready: boolean;
  matches: MatchState[];
  activeMatch?: MatchState;
  sessions: SessionGroup[];
  encounters: EncounterSummary[];
  profile?: FennecProfile;
  settings: FennecSettings;
  connection: FeedConnectionState;
  diagnostic?: string;
  demoMode: boolean;
  updateSettings(next: FennecSettings): Promise<void>;
  selectProfile(next: FennecProfile): Promise<void>;
  deleteHistory(): Promise<void>;
  restoreBackup(backup: FennecBackup): Promise<void>;
}

const FennecContext = createContext<FennecContextValue | undefined>(undefined);

function applyTheme(theme: FennecSettings['theme']): void {
  const resolved = theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : theme;
  document.documentElement.dataset.theme = resolved;
}

export function FennecProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [matches, setMatches] = useState<MatchState[]>([]);
  const [profile, setProfile] = useState<FennecProfile>();
  const [settings, setSettings] = useState<FennecSettings>(defaultSettings);
  const [connection, setConnection] = useState<FeedConnectionState>('stopped');
  const [diagnostic, setDiagnostic] = useState<string>();
  const activeRef = useRef<MatchState | undefined>(undefined);
  const profileRef = useRef<FennecProfile | undefined>(undefined);
  const demoMode = import.meta.env.VITE_DEMO_FEED === 'true' || new URLSearchParams(location.search).get('demo') === '1';

  useEffect(() => {
    void Promise.all([loadMatches(), loadProfile(), loadSettings()]).then(async ([storedMatches, storedProfile, storedSettings]) => {
      if (demoMode && storedMatches.length === 0) {
        storedMatches.push(...createDemoHistory());
        await Promise.all(storedMatches.map(saveMatch));
      }
      const liveIds = new Set(storedMatches.filter((match) => match.lifecycle === 'live').map((match) => match.id));
      const recovered = recoverActiveMatch(storedMatches);
      await Promise.all(storedMatches.filter((match) => liveIds.has(match.id) && match.lifecycle === 'incomplete').map(saveMatch));
      activeRef.current = recovered;
      profileRef.current = storedProfile;
      setMatches(storedMatches);
      setProfile(storedProfile);
      setSettings(storedSettings);
      applyTheme(storedSettings.theme);
      setReady(true);
    });
  }, [demoMode]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!ready) return;
    const feed = demoMode ? new SimulatedStatsFeed() : new WebSocketStatsFeed(`ws://127.0.0.1:${settings.webSocketPort}`);
    feed.start({
      onState: setConnection,
      onDiagnostic: setDiagnostic,
      onEnvelope: async (envelope) => {
        const result = reduceStatsEnvelope(activeRef.current, envelope);
        // Keep the reducer cursor after completion so trailing events such as
        // MatchDestroyed attach to the match that just ended.
        activeRef.current = result.current;
        if (result.superseded) await saveMatch(result.superseded);
        await saveMatch(result.current);
        setMatches((current) => {
          const updates = [result.superseded, result.current].filter(Boolean) as MatchState[];
          const ids = new Set(updates.map((item) => item.id));
          return [...current.filter((item) => !ids.has(item.id)), ...updates].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        });
        const selected = profileRef.current;
        const selectedPlayer = selected && result.current.participants.find((player) => player.primaryId === selected.primaryId);
        if (selected && selectedPlayer && selected.displayName !== selectedPlayer.name) {
          const next = { primaryId: selected.primaryId, displayName: selectedPlayer.name };
          profileRef.current = next;
          setProfile(next);
          await saveProfile(next);
        } else if (demoMode && !selected) {
          const demoPlayer = result.current.participants.find((player) => player.primaryId === 'Steam|demo-you|0');
          if (demoPlayer?.primaryId) {
            const next = { primaryId: demoPlayer.primaryId, displayName: demoPlayer.name };
            profileRef.current = next;
            setProfile(next);
            await saveProfile(next);
          }
        }
      },
    });
    return () => {
      feed.stop();
      setConnection('stopped');
    };
  }, [demoMode, ready, settings.webSocketPort]);

  const updateSettings = useCallback(async (next: FennecSettings) => {
    setSettings(next);
    applyTheme(next.theme);
    await saveSettings(next);
  }, []);

  const selectProfile = useCallback(async (next: FennecProfile) => {
    profileRef.current = next;
    setProfile(next);
    await saveProfile(next);
  }, []);

  const deleteHistory = useCallback(async () => {
    await clearHistory();
    activeRef.current = undefined;
    setMatches([]);
  }, []);

  const restoreBackup = useCallback(async (backup: FennecBackup) => {
    await replaceAll(backup.matches, backup.settings, backup.profile);
    const active = recoverActiveMatch(backup.matches);
    activeRef.current = active;
    profileRef.current = backup.profile;
    setMatches(backup.matches);
    setSettings(backup.settings);
    setProfile(backup.profile);
    applyTheme(backup.settings.theme);
  }, []);

  const activeMatch = matches.find((match) => match.lifecycle === 'live');
  const sessions = useMemo(() => groupSessions(matches, settings.sessionGapMinutes), [matches, settings.sessionGapMinutes]);
  const encounters = useMemo(() => calculateEncounters(matches, profile?.primaryId), [matches, profile?.primaryId]);
  const value = useMemo<FennecContextValue>(() => ({
    ready, matches, activeMatch, sessions, encounters, profile, settings, connection, diagnostic, demoMode,
    updateSettings, selectProfile, deleteHistory, restoreBackup,
  }), [ready, matches, activeMatch, sessions, encounters, profile, settings, connection, diagnostic, demoMode, updateSettings, selectProfile, deleteHistory, restoreBackup]);

  return <FennecContext.Provider value={value}>{children}</FennecContext.Provider>;
}

// This hook intentionally shares the provider module so their private context cannot drift.
// eslint-disable-next-line react-refresh/only-export-components
export function useFennec(): FennecContextValue {
  const value = useContext(FennecContext);
  if (!value) throw new Error('useFennec must be used inside FennecProvider.');
  return value;
}
