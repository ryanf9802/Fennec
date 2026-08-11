import { CheckCircle2, Shield } from 'lucide-react';
import { useState } from 'react';
import { useStorageStatistics } from '../data/historyQueries';

type StorageProtectionLayout = 'setup' | 'settings';
type RequestOutcome = 'declined' | 'error' | 'unavailable';

interface StorageProtectionProps {
  companionBacked: boolean;
  layout: StorageProtectionLayout;
}

/** Requests persistent browser storage while keeping optional setup states visually neutral. */
export function StorageProtection({
  companionBacked,
  layout,
}: StorageProtectionProps) {
  const storageQuery = useStorageStatistics();
  const persisted = storageQuery.data?.persisted === true;
  const supported =
    typeof navigator !== 'undefined' && !!navigator.storage?.persist;
  const [requesting, setRequesting] = useState(false);
  const [outcome, setOutcome] = useState<RequestOutcome>();

  const requestProtection = async () => {
    if (!navigator.storage?.persist) {
      setOutcome('unavailable');
      return;
    }
    setRequesting(true);
    setOutcome(undefined);
    try {
      const granted = await navigator.storage.persist();
      await storageQuery.refetch();
      if (!granted) setOutcome('declined');
    } catch {
      setOutcome('error');
    } finally {
      setRequesting(false);
    }
  };

  const description = companionBacked
    ? "Ask this browser to keep Fennec's synchronized offline cache instead of automatically removing it when device storage is low. The companion remains the durable copy."
    : 'Ask this browser to keep your match history, selected player, and settings instead of automatically removing them when device storage is low.';
  const status = persisted
    ? 'Browser storage protection is on.'
    : outcome === 'declined'
      ? 'The browser did not grant protection. Fennec can still run, but its local data remains eligible for automatic cleanup.'
      : outcome === 'error'
        ? 'The browser could not complete the request. Fennec can still run, and you can try again.'
        : outcome === 'unavailable' || !supported
          ? 'This browser does not offer storage protection. Fennec can still run normally.'
          : 'This reduces automatic browser cleanup. It is not a backup, and clearing site data can still remove it.';
  const content = (
    <div className="flex gap-3">
      {persisted ? (
        <CheckCircle2
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-emerald-400"
        />
      ) : (
        <Shield
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-fennec-cyan"
        />
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong>Protect app data</strong>
          {!persisted && (
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-xs font-bold text-cyan-300">
              Highly recommended
            </span>
          )}
        </div>
        <p className="text-muted mt-1 text-sm">{description}</p>
        <p className="text-muted mt-2 text-sm" role="status">
          {status}
        </p>
        {!persisted && supported && (
          <button
            className="button-secondary mt-3"
            disabled={requesting}
            onClick={() => void requestProtection()}
          >
            <Shield aria-hidden="true" className="size-4" />
            {requesting
              ? 'Requesting protection…'
              : outcome
                ? 'Try again'
                : 'Protect app data'}
          </button>
        )}
      </div>
    </div>
  );

  if (layout === 'setup')
    return (
      <li
        className="surface-strong rounded-2xl p-4"
        data-storage-protection-state={persisted ? 'protected' : 'recommended'}
      >
        {content}
      </li>
    );

  return (
    <div
      className="surface-strong mt-5 rounded-2xl p-4"
      data-storage-protection-state={persisted ? 'protected' : 'recommended'}
    >
      {content}
    </div>
  );
}
