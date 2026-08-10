import { Navigate, Outlet } from 'react-router-dom';
import { useCompanionStatus } from '../companion/useCompanionStatus';
import { useLocalAccess } from '../platform/LocalAccessContext';
import {
  setupComplete,
  storedCompanionCaptureVerification,
  storedCompanionSetupCompletion,
  storedSetupPath,
} from '../setup/setupStatus';
import { useFennec } from './FennecContext';

/** Keeps normal app routes behind the selected setup path without gating demo fixtures. */
export function RequireSetup() {
  const { demoMode, statsApiVerified } = useFennec();
  const access = useLocalAccess();
  const path = storedSetupPath();
  const companion = useCompanionStatus(!demoMode && path === 'companion');

  if (demoMode) return <Outlet />;
  if (!path) return <Navigate to="/setup" replace />;
  if (
    access.state === 'checking' ||
    (path === 'companion' && companion.checking)
  )
    return <p className="text-muted py-8 text-center">Checking setup…</p>;
  if (
    !setupComplete({
      accessSatisfied: access.satisfied,
      path,
      statsApiVerified,
      companionCaptureVerified: storedCompanionCaptureVerification(),
      companionSetupVerified: storedCompanionSetupCompletion(),
      health: companion.health,
    })
  )
    return <Navigate to="/setup" replace />;
  return <Outlet />;
}
