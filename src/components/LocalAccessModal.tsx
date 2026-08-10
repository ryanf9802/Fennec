import { LockKeyhole, RefreshCw, Settings } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalAccess } from '../platform/LocalAccessContext';

export function LocalAccessModal() {
  const { state, request, recheck } = useLocalAccess();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const denied = state === 'denied';
  const act = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-access-title"
    >
      <section className="surface max-w-xl rounded-3xl p-6 shadow-2xl sm:p-8">
        <LockKeyhole className="size-10 text-fennec-orange" />
        <h1 id="local-access-title" className="mt-4 text-2xl font-black">
          Allow access to apps on this device
        </h1>
        <p className="text-muted mt-3">
          Fennec cannot connect to Rocket League or the companion until this
          browser permission is enabled. When your browser asks, choose the
          persistent option, usually <strong>Always allow</strong> or{' '}
          <strong>Allow on every visit</strong>, so capture keeps working.
        </p>
        {denied && (
          <div className="surface-strong mt-4 rounded-xl p-4 text-sm">
            Permission is blocked. Open the site controls beside the address,
            set <strong>Local network access</strong> or{' '}
            <strong>Apps on this device</strong> to Allow, then check again.
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {!denied && (
            <button
              className="button-primary"
              disabled={busy}
              onClick={() => void act(request)}
            >
              <LockKeyhole className="size-4" />
              Allow device access
            </button>
          )}
          <button
            className="button-secondary"
            disabled={busy}
            onClick={() => void act(recheck)}
          >
            <RefreshCw className="size-4" /> Check again
          </button>
          <button
            className="button-secondary"
            onClick={() => navigate('/setup')}
          >
            <Settings className="size-4" /> Open setup guide
          </button>
        </div>
      </section>
    </div>
  );
}
