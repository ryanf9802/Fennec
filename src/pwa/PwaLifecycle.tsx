import { Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const UPDATE_CHECK_INTERVAL_MS = 60 * 1_000;

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PwaLifecycle() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent>();
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
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
      nextRegistration: ServiceWorkerRegistration | undefined,
    ) {
      setRegistration(nextRegistration);
    },
  });

  useEffect(() => {
    if (!registration) return;
    const check = () => {
      void registration.update().catch(() => {
        // Update checks are best effort while the browser is offline.
      });
    };
    const checkWhenVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const timer = window.setInterval(check, UPDATE_CHECK_INTERVAL_MS);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', checkWhenVisible);
    check();
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', check);
      document.removeEventListener('visibilitychange', checkWhenVisible);
    };
  }, [registration]);

  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('fennec-pwa-update');
    channel.onmessage = (event) => {
      if (event.data === 'ready') setNeedRefresh(true);
    };
    return () => channel.close();
  }, [setNeedRefresh]);

  useEffect(() => {
    if (needRefresh) void updateServiceWorker(true);
  }, [needRefresh, updateServiceWorker]);

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
