import { useEffect, useRef } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { AppEntrance } from '../components/AppEntrance';
import { LocalAccessModal } from '../components/LocalAccessModal';
import { GamesPage } from '../pages/GamesPage';
import { MatchPage } from '../pages/MatchPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { useLocalAccess } from '../platform/LocalAccessContext';
import { LiveWakeLock } from '../pwa/LiveWakeLock';
import { PwaLifecycle } from '../pwa/PwaLifecycle';
import { ProfilePage } from '../pages/ProfilePage';
import { SessionPage } from '../pages/SessionPage';
import { SettingsPage } from '../pages/SettingsPage';
import { useFennec } from './FennecContext';
import { RequireSetup } from './RequireSetup';
import {
  SetupStatusProvider,
  useSetupStatus,
} from '../setup/SetupStatusContext';

export function App() {
  return (
    <SetupStatusProvider>
      <AppContent />
    </SetupStatusProvider>
  );
}

/** Holds document-entry content until local data and setup checks are ready. */
function AppContent() {
  const { activeMatch, settings, ready, diagnostic } = useFennec();
  const localAccess = useLocalAccess();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const opened = useRef<string | undefined>(undefined);
  const setup = useSetupStatus();
  const entryReady = ready && setup.state !== 'checking';
  useEffect(() => {
    if (
      setup.state === 'complete' &&
      settings.autoOpenLiveMatch &&
      activeMatch &&
      opened.current !== activeMatch.id
    ) {
      opened.current = activeMatch.id;
      navigate('/live');
    }
  }, [activeMatch, navigate, settings.autoOpenLiveMatch, setup.state]);

  if (!ready && diagnostic)
    return (
      <div className="app-backdrop flex min-h-screen items-center justify-center p-6">
        <section className="surface max-w-lg rounded-3xl p-7 text-center">
          <h1 className="text-2xl font-extrabold">
            Local history could not be opened
          </h1>
          <p className="text-muted mt-3">{diagnostic}</p>
          <button
            className="button-primary mt-5"
            onClick={() => location.reload()}
          >
            Retry
          </button>
        </section>
      </div>
    );
  return (
    <AppEntrance ready={entryReady}>
      <LiveWakeLock />
      <PwaLifecycle />
      <AppShell>
        <Routes>
          <Route path="/setup" element={<OnboardingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/onboarding"
            element={<Navigate to="/setup" replace />}
          />
          <Route element={<RequireSetup />}>
            <Route path="/" element={<GamesPage />} />
            <Route
              path="/live"
              element={
                activeMatch ? (
                  <MatchPage match={activeMatch} />
                ) : (
                  <Navigate to="/" replace />
                )
              }
            />
            <Route path="/matches/:matchId" element={<MatchPage />} />
            <Route path="/sessions/:sessionId" element={<SessionPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </AppShell>
      {!localAccess.satisfied &&
        pathname !== '/setup' &&
        pathname !== '/settings' && <LocalAccessModal />}
    </AppEntrance>
  );
}
