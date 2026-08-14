import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useFennec } from '../app/FennecContext';
import type { CompanionHealth } from '../companion/client';
import { useCompanionStatus } from '../companion/useCompanionStatus';
import { useLocalAccess } from '../platform/LocalAccessContext';
import {
  rememberCompanionStatsApiVerification,
  rememberCompanionSetupCompletion,
  rememberSetupPath,
  setupComplete,
  storedCompanionStatsApiVerification,
  storedCompanionSetupCompletion,
  storedSetupPath,
  type SetupPath,
} from './setupStatus';

export type SetupCompletionState = 'checking' | 'incomplete' | 'complete';

export interface SetupStatusValue {
  selectedPath?: SetupPath;
  state: SetupCompletionState;
  selectPath(path: SetupPath): void;
  companion: {
    checking: boolean;
    health?: CompanionHealth;
    recheck(): Promise<void>;
  };
}

const SetupStatusContext = createContext<SetupStatusValue | undefined>(
  undefined,
);

/**
 * Makes the selected setup route authoritative while preserving each route's
 * prior verification and preferring current companion evidence when present.
 */
export function SetupStatusProvider({ children }: { children: ReactNode }) {
  const access = useLocalAccess();
  const { demoMode, statsApiVerified } = useFennec();
  const [selectedPath, setSelectedPath] = useState<SetupPath | undefined>(
    storedSetupPath,
  );
  const companion = useCompanionStatus(
    !demoMode && selectedPath === 'companion',
  );
  const recheckCompanion = companion.recheck;
  const selectPath = useCallback(
    (path: SetupPath) => {
      if (path === 'companion' && !demoMode) void recheckCompanion();
      rememberSetupPath(path);
      setSelectedPath(path);
    },
    [demoMode, recheckCompanion],
  );

  useEffect(() => {
    if (
      (companion.health?.feedConnected || companion.health?.lastPacketAt) &&
      !demoMode
    )
      rememberCompanionStatsApiVerification();
  }, [
    companion.health?.feedConnected,
    companion.health?.lastPacketAt,
    demoMode,
  ]);

  const companionStatsApiVerified =
    Boolean(
      companion.health?.feedConnected || companion.health?.lastPacketAt,
    ) || storedCompanionStatsApiVerification();
  const companionSetupVerified = storedCompanionSetupCompletion();
  const currentlyComplete = setupComplete({
    accessSatisfied: access.satisfied,
    path: selectedPath,
    statsApiVerified,
    companionStatsApiVerified,
    companionSetupVerified: false,
    health: companion.health,
  });

  useEffect(() => {
    if (selectedPath === 'companion' && currentlyComplete && !demoMode)
      rememberCompanionSetupCompletion();
  }, [currentlyComplete, demoMode, selectedPath]);

  const state: SetupCompletionState = demoMode
    ? 'complete'
    : !selectedPath
      ? 'incomplete'
      : access.state === 'checking' ||
          (selectedPath === 'companion' && companion.checking)
        ? 'checking'
        : setupComplete({
              accessSatisfied: access.satisfied,
              path: selectedPath,
              statsApiVerified,
              companionStatsApiVerified,
              companionSetupVerified,
              health: companion.health,
            })
          ? 'complete'
          : 'incomplete';

  const value = useMemo<SetupStatusValue>(
    () => ({ selectedPath, state, selectPath, companion }),
    [companion, selectPath, selectedPath, state],
  );
  return (
    <SetupStatusContext.Provider value={value}>
      {children}
    </SetupStatusContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSetupStatus(): SetupStatusValue {
  const value = useContext(SetupStatusContext);
  if (!value)
    throw new Error('useSetupStatus must be used within SetupStatusProvider');
  return value;
}
