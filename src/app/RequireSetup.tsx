import { Navigate, Outlet } from 'react-router-dom';
import { useSetupStatus } from '../setup/SetupStatusContext';

/** Keeps normal app routes behind the selected setup path without gating demo fixtures. */
export function RequireSetup() {
  const { state } = useSetupStatus();
  if (state === 'checking')
    return <p className="text-muted py-8 text-center">Checking setup…</p>;
  if (state === 'incomplete') return <Navigate to="/setup" replace />;
  return <Outlet />;
}
