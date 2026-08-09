import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useFennec } from '../app/FennecContext';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaLifecycle() {
  const { activeMatch } = useFennec();
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onNeedRefresh() {
      setNeedRefresh(true);
      if ('BroadcastChannel' in window) {
        const channel = new BroadcastChannel('fennec-pwa-update');
        channel.postMessage('ready');
        channel.close();
      }
    },
    onRegisteredSW(
      _url: string,
      registration: ServiceWorkerRegistration | undefined,
    ) {
      if (!registration) return;
      const check = () => void registration.update();
      const timer = window.setInterval(check, 60 * 60 * 1_000);
      window.addEventListener('online', check);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      void registration.update();
      window.addEventListener('pagehide', () => window.clearInterval(timer), {
        once: true,
      });
    },
  });

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('fennec-pwa-update');
    channel.onmessage = (event) => {
      if (event.data === 'ready') setNeedRefresh(true);
    };
    return () => channel.close();
  }, [setNeedRefresh]);

  useEffect(() => {
    if (needRefresh && !activeMatch) void updateServiceWorker(true);
  }, [activeMatch, needRefresh, updateServiceWorker]);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', beforeInstall);
    return () =>
      window.removeEventListener('beforeinstallprompt', beforeInstall);
  }, []);

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(undefined);
  };

  return (
    <>
      {needRefresh && activeMatch && (
        <div className="fixed right-4 bottom-24 z-50 max-w-sm rounded-2xl border border-cyan-400/30 bg-slate-950 p-4 shadow-2xl md:bottom-4">
          <strong className="flex items-center gap-2">
            <RefreshCw className="size-4" /> Update ready
          </strong>
          <p className="text-muted mt-1 text-sm">
            Fennec will refresh automatically after the live match finishes.
          </p>
        </div>
      )}
      {installPrompt && location.pathname === '/setup' && (
        <button
          className="button-secondary fixed right-4 bottom-24 z-40 shadow-xl md:bottom-4"
          onClick={() => void install()}
        >
          <Download className="size-4" /> Install Fennec
        </button>
      )}
    </>
  );
}
