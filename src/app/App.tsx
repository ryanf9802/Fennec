import { useEffect, useRef, useState } from 'react';
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
import { resolveAppEntranceMode } from './appEntranceMode';
import { useFennec } from './FennecContext';
import { matchBelongsToProfile } from '../domain/profileScope';

export function App() {
  const { activeMatch, profile, settings, ready, diagnostic } = useFennec();
  const visibleActiveMatch =
    activeMatch && matchBelongsToProfile(activeMatch, profile?.primaryId)
      ? activeMatch
      : undefined;
  const localAccess = useLocalAccess();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const opened = useRef<string | undefined>(undefined);
  const [entranceMode] = useState(resolveAppEntranceMode);
  useEffect(() => {
    if (
      settings.autoOpenLiveMatch &&
      visibleActiveMatch &&
      opened.current !== visibleActiveMatch.id
    ) {
      opened.current = visibleActiveMatch.id;
      navigate('/live');
    }
  }, [navigate, settings.autoOpenLiveMatch, visibleActiveMatch]);

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
    <AppEntrance mode={entranceMode} ready={ready}>
      <LiveWakeLock />
      <PwaLifecycle />
      <AppShell>
        <Routes>
          <Route path="/" element={<GamesPage />} />
          <Route
            path="/live"
            element={
              visibleActiveMatch ? (
                <MatchPage match={visibleActiveMatch} />
              ) : (
                <Navigate to="/" replace />
              )
            }
          />
          <Route path="/matches/:matchId" element={<MatchPage />} />
          <Route path="/sessions/:sessionId" element={<SessionPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/setup" element={<OnboardingPage />} />
          <Route
            path="/onboarding"
            element={<Navigate to="/setup" replace />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      {!localAccess.satisfied && pathname !== '/setup' && <LocalAccessModal />}
    </AppEntrance>
  );
}
