import { useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import { GamesPage } from '../pages/GamesPage';
import { MatchPage } from '../pages/MatchPage';
import { OnboardingPage } from '../pages/OnboardingPage';
import { ProfilePage } from '../pages/ProfilePage';
import { SessionPage } from '../pages/SessionPage';
import { SettingsPage } from '../pages/SettingsPage';
import { useFennec } from './FennecContext';

export function App() {
  const { activeMatch, settings, ready } = useFennec();
  const navigate = useNavigate();
  const opened = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (settings.autoOpenLiveMatch && activeMatch && opened.current !== activeMatch.id) {
      opened.current = activeMatch.id;
      navigate('/live');
    }
  }, [activeMatch, navigate, settings.autoOpenLiveMatch]);

  if (!ready) return <div className="app-backdrop flex min-h-screen items-center justify-center"><img src="/assets/brand/fennec-a-mark-primary.svg" alt="" className="size-16 animate-pulse" /></div>;
  return <AppShell>
    <Routes>
      <Route path="/" element={<GamesPage />} />
      <Route path="/live" element={activeMatch ? <MatchPage match={activeMatch} /> : <Navigate to="/" replace />} />
      <Route path="/matches/:matchId" element={<MatchPage />} />
      <Route path="/sessions/:sessionId" element={<SessionPage />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </AppShell>;
}
