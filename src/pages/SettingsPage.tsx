import {
  Check,
  Database,
  Download,
  FileJson,
  ListChecks,
  Save,
  Trash2,
  Upload,
  RefreshCw,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFennec } from '../app/FennecContext';
import {
  CompanionLaunchControls,
  CompanionResourceMonitor,
  CompanionSettings,
} from '../components/CompanionSettings';
import { StatsApiSetup } from '../components/StatsApiSetup';
import { ConnectionStatus } from '../components/ConnectionStatus';
import { LocalNetworkAccessHelp } from '../components/LocalNetworkAccessHelp';
import { StorageProtection } from '../components/StorageProtection';
import {
  createBackup,
  downloadText,
  matchesCsv,
  parseBackup,
  streamBackup,
} from '../data/backup';
import { historyRepository, loadMatches } from '../data/database';
import { useStorageStatistics } from '../data/historyQueries';
import type { FennecSettings } from '../domain/types';
import { playerKeyForPrimaryId } from '../domain/playerIdentity';
import { useCompanionStatus } from '../companion/useCompanionStatus';
import {
  companionDataSyncVersion,
  companionSnapshot,
} from '../companion/client';

/**
 * Manages validated settings drafts, backup transfer, destructive history
 * actions, and browser-storage diagnostics.
 */
export function SettingsPage() {
  const context = useFennec();
  const {
    profile,
    settings,
    connection,
    diagnostic,
    syncStatus,
    updateSettings,
    deleteHistory,
    restoreBackup,
    rebuildBrowserCache,
  } = context;
  const [draft, setDraft] = useState(settings);
  const [message, setMessage] = useState<string>();
  const hasUnsavedChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const fileInput = useRef<HTMLInputElement>(null);
  const storageQuery = useStorageStatistics();
  const storage = storageQuery.data;
  const companion = useCompanionStatus();
  const companionReady = Boolean(
    companion.health?.paired &&
    companion.health.dataSyncVersion === companionDataSyncVersion,
  );
  const syncBusy = ['connecting', 'restoring', 'reconciling'].includes(
    syncStatus.mode,
  );
  const gameRunning = Boolean(companionReady && companion.health?.gameRunning);
  const dataActionMessage = !companionReady
    ? undefined
    : syncBusy && gameRunning
      ? 'Close Rocket League and wait for companion synchronization to finish before restoring a backup, rebuilding the browser cache, or deleting history.'
      : syncBusy
        ? 'Wait for companion synchronization to finish before restoring a backup, rebuilding the browser cache, or deleting history.'
        : gameRunning
          ? 'Close Rocket League before restoring a backup or deleting history.'
          : undefined;
  const dataActionStatusId = dataActionMessage
    ? 'data-action-availability'
    : undefined;
  const patchDraft = (patch: Partial<FennecSettings>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const restore = async (file?: File) => {
    if (!file) return;
    try {
      const backup = parseBackup(await file.text());
      if (
        !confirm(
          companionReady
            ? `Replace the companion's durable Fennec data and this browser cache with ${backup.matches.length} matches from this backup?`
            : `Replace local Fennec data with ${backup.matches.length} matches from this backup?`,
        )
      )
        return;
      await restoreBackup(backup, companionReady);
      setDraft(backup.settings);
      setMessage('Backup restored.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const saveDraft = async () => {
    if (
      !Number.isInteger(draft.webSocketPort) ||
      draft.webSocketPort < 1024 ||
      draft.webSocketPort > 65535
    ) {
      setMessage('WebSocket port must be a whole number from 1024 to 65535.');
      return;
    }
    if (
      !Number.isInteger(draft.sessionGapMinutes) ||
      draft.sessionGapMinutes < 1 ||
      draft.sessionGapMinutes > 240
    ) {
      setMessage('Session idle time must be a whole number from 1 to 240.');
      return;
    }
    try {
      await updateSettings(draft);
      setMessage('Settings saved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const exportJson = async () => {
    const filename = `fennec-backup-${new Date().toISOString().slice(0, 10)}`;
    try {
      if (companionReady) {
        const canonical = await companionSnapshot();
        downloadText(
          `${filename}.json`,
          JSON.stringify(
            createBackup(
              canonical.matches,
              canonical.settings ?? settings,
              canonical.profile,
            ),
            null,
            2,
          ),
          'application/json',
        );
        return;
      }
      if (
        await streamBackup(
          `${filename}.ndjson`,
          historyRepository.iterateMatches(),
          draft,
          profile,
        )
      )
        return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setMessage(error instanceof Error ? error.message : String(error));
      return;
    }
    const matches = await loadMatches();
    downloadText(
      `${filename}.json`,
      JSON.stringify(createBackup(matches, draft, profile), null, 2),
      'application/json',
    );
  };

  const exportCsv = async () => {
    if (!profile?.primaryId) {
      setMessage('Select a player profile before exporting CSV.');
      return;
    }
    const matches = await loadMatches(playerKeyForPrimaryId(profile.primaryId));
    downloadText(
      `fennec-matches-${new Date().toISOString().slice(0, 10)}.csv`,
      matchesCsv(matches, profile.primaryId),
      'text/csv',
    );
  };

  const rebuildCache = async () => {
    try {
      await rebuildBrowserCache();
      await storageQuery.refetch();
      setMessage('Browser cache rebuilt from the companion.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const removeHistory = async () => {
    try {
      await deleteHistory(companionReady);
      await storageQuery.refetch();
      setMessage(
        companionReady
          ? 'History deleted from the companion and browser cache.'
          : 'Match history deleted.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const dataControls = (
    <>
      <StorageProtection companionBacked={companionReady} layout="settings" />
      {storage?.usage !== undefined && (
        <p className="text-muted mt-2 text-sm">
          Browser cache: {(storage.usage / 1_048_576).toFixed(1)} MB
          {storage.quota
            ? ` of ${(storage.quota / 1_073_741_824).toFixed(1)} GB available`
            : ''}{' '}
          ·{' '}
          {storage.persisted
            ? 'persistent storage granted'
            : 'best-effort browser storage'}
        </p>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="button-secondary" onClick={() => void exportJson()}>
          <FileJson className="size-4" />
          Export backup
        </button>
        <button className="button-secondary" onClick={() => void exportCsv()}>
          <Download className="size-4" />
          Export CSV
        </button>
        <button
          aria-describedby={dataActionStatusId}
          className="button-secondary"
          disabled={companionReady && (syncBusy || gameRunning)}
          onClick={() => fileInput.current?.click()}
        >
          <Upload className="size-4" />
          Restore backup
        </button>
        <input
          ref={fileInput}
          className="hidden"
          type="file"
          accept="application/json,application/x-ndjson,.json,.ndjson"
          onChange={(event) => void restore(event.target.files?.[0])}
        />
        {companionReady && (
          <button
            aria-describedby={syncBusy ? dataActionStatusId : undefined}
            className="button-secondary"
            disabled={syncBusy}
            onClick={() => void rebuildCache()}
          >
            <RefreshCw className="size-4" />
            Rebuild browser cache
          </button>
        )}
        <button
          aria-describedby={dataActionStatusId}
          className="button-danger"
          disabled={companionReady && (syncBusy || gameRunning)}
          onClick={() => {
            const count = companionReady
              ? (companion.health?.canonicalMatches ?? storage?.matches ?? 0)
              : (storage?.matches ?? 0);
            if (
              confirm(
                companionReady
                  ? `Permanently delete ${count} matches from the companion and synchronized browsers? This cannot be undone.`
                  : `Delete ${count} locally stored matches? This cannot be undone.`,
              )
            )
              void removeHistory();
          }}
        >
          <Trash2 className="size-4" />
          {companionReady ? 'Delete all history' : 'Delete history'}
        </button>
      </div>
      {dataActionMessage && (
        <p
          id="data-action-availability"
          className="text-muted mt-3 text-sm"
          role="status"
        >
          {dataActionMessage}
        </p>
      )}
    </>
  );

  return (
    <div className="space-y-7">
      <header>
        <h1 className="text-3xl font-black sm:text-4xl">Settings</h1>
        <p className="text-muted mt-2">
          Sessions, appearance, capture, and durable Fennec data.
        </p>
      </header>

      <section className="surface rounded-3xl p-5 sm:p-7">
        <h2 className="text-xl font-extrabold">Setup center</h2>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-muted max-w-2xl text-sm">
            Verify browser permissions, Rocket League configuration, the
            optional recommended companion, and live capture.
          </p>
          <Link className="button-primary" to="/setup">
            <ListChecks className="size-4" />
            Open setup
          </Link>
        </div>
      </section>

      <section className="surface-flat rounded-3xl p-5 sm:p-7">
        <h2 className="text-xl font-extrabold">Sessions and behavior</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <label>
            <span className="eyebrow">New session after idle minutes</span>
            <input
              className="control mt-2"
              type="number"
              min="1"
              max="240"
              value={draft.sessionGapMinutes}
              onChange={(event) =>
                patchDraft({ sessionGapMinutes: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span className="eyebrow">Appearance</span>
            <select
              className="control mt-2"
              value={draft.theme}
              onChange={(event) =>
                patchDraft({
                  theme: event.target.value as FennecSettings['theme'],
                })
              }
            >
              <option value="dark">Dark</option>
              <option value="system">System</option>
              <option value="light">Light</option>
            </select>
          </label>
          <label>
            <span className="eyebrow">Speed units</span>
            <select
              className="control mt-2"
              value={draft.speedUnit}
              onChange={(event) =>
                patchDraft({
                  speedUnit: event.target.value as FennecSettings['speedUnit'],
                })
              }
            >
              <option value="kmh">Kilometers per hour (km/h)</option>
              <option value="mph">Miles per hour (mph)</option>
            </select>
          </label>
        </div>
        <label
          className={`mt-5 flex max-w-2xl items-start gap-3 ${profile ? 'cursor-pointer' : 'cursor-not-allowed'}`}
        >
          <input
            type="checkbox"
            className="mt-1 size-4 accent-cyan-400"
            checked={draft.autoOpenLiveMatch}
            disabled={!profile}
            aria-describedby={
              profile ? undefined : 'auto-open-live-player-required'
            }
            onChange={(event) =>
              patchDraft({ autoOpenLiveMatch: event.target.checked })
            }
          />
          <span>
            <strong>Automatically open the live monitor</strong>
            <span className="text-muted mt-1 block text-sm">
              On by default. Turn this off to keep an active game highlighted
              until you open it.
            </span>
          </span>
        </label>
        {!profile && (
          <p
            id="auto-open-live-player-required"
            role="note"
            className="mt-3 max-w-2xl rounded-xl border border-amber-300/30 bg-amber-400/10 px-4 py-3 text-sm"
          >
            <strong>Player required.</strong> Select your player before Fennec
            can automatically open the live monitor.{' '}
            <Link
              className="font-bold text-fennec-cyan underline decoration-cyan-300/50 underline-offset-4"
              to="/profile#player-selection"
            >
              Choose your player
            </Link>
            .
          </p>
        )}
      </section>

      {companionReady && companion.health ? (
        <section className="surface rounded-3xl p-5 sm:p-7">
          <h2 className="text-xl font-extrabold">Data and companion</h2>
          <p className="text-muted mt-2 max-w-3xl">
            The companion keeps the durable copy of your Fennec history,
            selected player, and settings. This browser maintains a synchronized
            offline cache for fast access.
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div className="surface-strong rounded-2xl p-4">
              <strong className="flex items-center gap-2">
                <Database className="size-4 text-fennec-cyan" /> Durable data
              </strong>
              <p className="text-muted mt-2 text-sm" role="status">
                {syncStatus.mode === 'restoring'
                  ? `Restoring ${syncStatus.completedMatches ?? 0} of ${syncStatus.totalMatches ?? 0} matches…`
                  : syncStatus.mode === 'reconciling'
                    ? `Reconciling ${syncStatus.pendingFrames ?? companion.health.pendingFrames ?? 0} captured frames…`
                    : syncStatus.mode === 'error'
                      ? `Sync needs attention: ${syncStatus.error ?? 'Unknown error'}`
                      : syncStatus.mode === 'connecting'
                        ? 'Connecting to the durable data store…'
                        : syncStatus.mode === 'unavailable'
                          ? 'Companion sync is unavailable; browser capture continues locally.'
                          : syncStatus.mode === 'synchronized'
                            ? `Up to date${companion.health.lastSyncedAt ? ` · last synchronized ${new Date(companion.health.lastSyncedAt).toLocaleString()}` : ''}`
                            : 'Waiting for companion synchronization.'}
              </p>
              <p className="text-muted mt-2 text-sm">
                {companion.health.canonicalMatches ?? 0} matches ·{' '}
                {((companion.health.databaseBytes ?? 0) / 1_048_576).toFixed(1)}{' '}
                MB in the companion
              </p>
            </div>
            <div className="surface-strong rounded-2xl p-4">
              <strong>Offline browser cache</strong>
              <p className="text-muted mt-2 text-sm">
                Full technical payloads are retained for{' '}
                {storage?.rawRetentionDays ?? 90} days. Clearing this cache is
                recoverable while the companion data remains available.
              </p>
            </div>
          </div>
          {dataControls}
          <div className="mt-7 border-t border-white/10 pt-6">
            <CompanionResourceMonitor usage={companion.health.resourceUsage} />
            <CompanionLaunchControls
              health={companion.health}
              recheck={companion.recheck}
            />
          </div>
        </section>
      ) : (
        <>
          <CompanionSettings />
          <section className="surface-flat rounded-3xl p-5 sm:p-7">
            <h2 className="text-xl font-extrabold">Local data</h2>
            <p className="text-muted mt-2">
              When a compatible companion is not running, match history and
              compact analytics stay in this browser. Full technical payloads
              are retained for {storage?.rawRetentionDays ?? 90} days.
            </p>
            {dataControls}
          </section>
        </>
      )}

      <section className="surface rounded-3xl p-5 sm:p-7">
        <h2 className="text-xl font-extrabold">Monitoring</h2>
        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <label className="block">
            <span className="eyebrow">WebSocket port</span>
            <input
              className="control mt-2"
              type="number"
              min="1024"
              max="65535"
              value={draft.webSocketPort}
              onChange={(event) =>
                patchDraft({ webSocketPort: Number(event.target.value) })
              }
            />
          </label>
          <div>
            <div className="eyebrow">Connection</div>
            <ConnectionStatus
              connection={connection}
              className="surface-strong mt-2 min-h-11 rounded-xl px-4"
            />
          </div>
        </div>
        <div className="mt-5">
          <LocalNetworkAccessHelp />
        </div>
        <div className="mt-6">
          <div className="eyebrow">Rocket League configuration</div>
          <p className="text-muted mt-1 text-sm">
            Update one Stats API setting from the game's installation directory.
          </p>
          <StatsApiSetup />
        </div>
      </section>

      <section className="surface-flat rounded-2xl p-5">
        <div className="eyebrow">Developer diagnostics</div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted">Endpoint:</span>{' '}
            <code>ws://127.0.0.1:{draft.webSocketPort}</code>
          </div>
          <div>
            <span className="text-muted">Matches:</span>{' '}
            {storage?.matches ?? '—'}
          </div>
          <div>
            <span className="text-muted">Semantic events:</span>{' '}
            {storage?.semanticEvents ?? '—'}
          </div>
          <div>
            <span className="text-muted">Raw events:</span>{' '}
            {storage?.rawEvents ?? '—'}
          </div>
          <div className="truncate">
            <span className="text-muted">Last warning:</span>{' '}
            {diagnostic ?? 'None'}
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-muted mr-auto text-sm">{message}</span>
        {message === 'Settings saved.' && (
          <Check className="size-5 text-fennec-cyan" />
        )}
      </div>
      {hasUnsavedChanges && (
        <button
          className="settings-save-fab button-primary"
          onClick={() => void saveDraft()}
        >
          <Save className="size-5" />
          Save settings
        </button>
      )}
    </div>
  );
}
