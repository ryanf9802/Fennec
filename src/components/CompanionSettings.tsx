import { Activity, ExternalLink, Link2, Power, Rocket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  companionCommand,
  companionProtocolVersion,
  type CompanionHealth,
  type CompanionResourceUsage,
} from '../companion/client';
import { useCompanionStatus } from '../companion/useCompanionStatus';

/** Converts optional, backward-compatible updater telemetry into non-interactive status copy. */
function updateMessage(
  status: NonNullable<
    ReturnType<typeof useCompanionStatus>['health']
  >['updateStatus'],
  version?: string,
): string {
  if (!status)
    return 'Install the latest companion once to enable automatic updates.';
  switch (status) {
    case 'checking':
      return 'Checking for companion updates…';
    case 'downloading':
      return `Downloading companion ${version ?? 'update'}…`;
    case 'waitingForIdle':
      return `Companion ${version ?? 'update'} is ready and will install after Rocket League closes.`;
    case 'installing':
      return `Installing companion ${version ?? 'update'}…`;
    case 'retrying':
      return 'The automatic update check will retry in the background.';
    case 'current':
      return 'Companion updates install automatically in the background.';
  }
}

function formatCpu(value: number): string {
  const safe = Math.max(0, value);
  if (safe > 0 && safe < 0.1) return '<0.1%';
  return `${safe.toFixed(1)}%`;
}

function formatMemory(bytes: number): string {
  return `${(Math.max(0, bytes) / 1024 / 1024).toFixed(1)} MiB`;
}

/** Presents truthful process-only measurements without implying browser or game usage is included. */
export function CompanionResourceMonitor({
  usage,
}: {
  usage: CompanionResourceUsage | null | undefined;
}) {
  const peakLabel = usage
    ? `${Math.round(usage.recentWindowSeconds / 60)} min peak`
    : undefined;
  const measurementStatus =
    usage === undefined
      ? 'Requires latest companion'
      : usage === null
        ? 'Measuring on this device'
        : 'Live on this device';
  return (
    <div
      aria-label="Live companion footprint"
      className="surface-strong mb-4 rounded-2xl p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="flex items-center gap-2">
          <Activity className="size-4 text-fennec-cyan" /> Live companion
          footprint
        </strong>
        <span className="text-muted flex items-center gap-1.5 text-xs">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-fennec-cyan"
          />
          {measurementStatus}
        </span>
      </div>
      <p className="text-muted mt-1 text-xs">
        Companion process only · refreshes every 5 seconds
      </p>
      {usage === undefined ? (
        <p className="text-muted mt-3 text-sm">
          Install the latest companion to see live CPU and memory use.
        </p>
      ) : usage === null ? (
        <p className="text-muted mt-3 text-sm">Measuring resource use…</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-white/5 p-3">
            <dt className="text-muted text-xs font-bold uppercase tracking-wider">
              CPU
            </dt>
            <dd className="mt-1 text-xl font-black tabular-nums">
              {formatCpu(usage.cpuPercent)}
            </dd>
            <dd className="text-muted mt-0.5 text-xs tabular-nums">
              {formatCpu(usage.recentPeakCpuPercent)} {peakLabel}
            </dd>
          </div>
          <div className="rounded-xl border border-white/5 p-3">
            <dt className="text-muted text-xs font-bold uppercase tracking-wider">
              Memory
            </dt>
            <dd className="mt-1 text-xl font-black tabular-nums">
              {formatMemory(usage.memoryBytes)}
            </dd>
            <dd className="text-muted mt-0.5 text-xs tabular-nums">
              {formatMemory(usage.recentPeakMemoryBytes)} {peakLabel}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Provides the connected companion's shared storefront, startup, and dashboard launch controls. */
export function CompanionLaunchControls({
  health,
  recheck,
}: {
  health: CompanionHealth;
  recheck(): Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const run = async (
    command: Parameters<typeof companionCommand>[0],
    success: string,
  ) => {
    setBusy(true);
    const completed = await companionCommand(command);
    setMessage(
      completed ? success : 'The companion could not complete that change.',
    );
    await recheck();
    setBusy(false);
  };

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <div className="surface-strong rounded-2xl p-4">
          <strong className="flex items-center gap-2">
            <Rocket className="size-4 text-fennec-cyan" /> Rocket League
            shortcuts
          </strong>
          <p className="text-muted mt-2 text-sm">
            Each shortcut starts the companion, launches the selected store, and
            monitors that exact game process. When Windows startup is off, the
            companion closes after the game exits.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {health.stores?.includes('steam') && (
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    'create-steam-shortcut',
                    'Steam launcher shortcut added to the desktop.',
                  )
                }
              >
                <Link2 className="size-4" /> Add Steam shortcut
              </button>
            )}
            {health.stores?.includes('epic') && (
              <button
                className="button-secondary"
                disabled={busy}
                onClick={() =>
                  void run(
                    'create-epic-shortcut',
                    'Epic launcher shortcut added to the desktop.',
                  )
                }
              >
                <Link2 className="size-4" /> Add Epic shortcut
              </button>
            )}
          </div>
        </div>
        <div className="surface-strong rounded-2xl p-4">
          <strong className="flex items-center gap-2">
            <Power className="size-4 text-fennec-cyan" /> Windows startup
          </strong>
          <p className="text-muted mt-2 text-sm">
            Start the tray collector when you sign in to Windows so it captures
            every launch path, even when no Fennec window is open. The companion
            remains lightweight and idle outside brief update checks.
          </p>
          <button
            className="button-secondary mt-3"
            disabled={busy}
            onClick={() =>
              void run(
                health.launchOnStartup ? 'disable-startup' : 'enable-startup',
                health.launchOnStartup
                  ? 'Windows startup disabled.'
                  : 'Windows startup enabled.',
              )
            }
          >
            {health.launchOnStartup
              ? 'Disable Windows startup'
              : 'Enable Windows startup (recommended)'}
          </button>
        </div>
        <div className="surface-strong rounded-2xl p-4">
          <strong className="flex items-center gap-2">
            <ExternalLink className="size-4 text-fennec-cyan" /> Open dashboard
          </strong>
          <p className="text-muted mt-2 text-sm">
            Optionally open the Fennec dashboard once when Rocket League starts.
            An installed PWA may handle the link; otherwise it opens in your
            default browser.
          </p>
          {health.openDashboardOnGameStart === undefined ? (
            <p className="text-muted mt-3 text-sm">
              Install the latest companion to enable automatic dashboard
              opening.
            </p>
          ) : (
            <button
              className="button-secondary mt-3"
              disabled={busy}
              onClick={() =>
                void run(
                  health.openDashboardOnGameStart
                    ? 'disable-dashboard-auto-open'
                    : 'enable-dashboard-auto-open',
                  health.openDashboardOnGameStart
                    ? 'Automatic dashboard opening disabled.'
                    : 'The dashboard will open when Rocket League starts.',
                )
              }
            >
              {health.openDashboardOnGameStart
                ? 'Stop opening automatically'
                : 'Open dashboard with Rocket League'}
            </button>
          )}
        </div>
      </div>
      {message && <p className="text-muted mt-3 text-sm">{message}</p>}
    </>
  );
}

/** Shows only operating-system controls proven available by a connected, protocol-compatible companion. */
export function CompanionSettings() {
  const { health, checking, recheck } = useCompanionStatus();
  const ready =
    health?.paired && health.protocolVersion === companionProtocolVersion;

  return (
    <section className="surface rounded-3xl p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">Companion service</h2>
      <p className="text-muted mt-1 text-sm">
        Optional operating-system integrations are available while a compatible
        Windows companion is running.
      </p>
      {checking && !health ? (
        <p className="text-muted mt-4 text-sm">Checking the companion…</p>
      ) : !ready ? (
        <p className="surface-strong mt-4 rounded-2xl p-4 text-sm">
          {health
            ? `Companion ${health.version} is running and needs to finish updating. Keep it running, or manage it in the `
            : 'No compatible companion is running. Start or update it in the '}
          <Link
            className="text-fennec-cyan underline"
            to="/setup?path=companion"
          >
            Setup center
          </Link>
          .
        </p>
      ) : (
        <div className="mt-5">
          <CompanionResourceMonitor usage={health.resourceUsage} />
          <CompanionLaunchControls health={health} recheck={recheck} />
        </div>
      )}
      {ready && (
        <p className="text-muted mt-4 text-sm">
          {updateMessage(health.updateStatus, health.availableUpdateVersion)}
        </p>
      )}
    </section>
  );
}
