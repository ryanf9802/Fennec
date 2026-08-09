import { Link2, Power, Rocket } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  companionCommand,
  companionProtocolVersion,
} from '../companion/client';
import { useCompanionStatus } from '../companion/useCompanionStatus';

/** Shows only the store-specific shortcuts and startup controls proven available by a paired, protocol-compatible companion. */
export function CompanionSettings() {
  const { health, checking, recheck } = useCompanionStatus();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const ready =
    health?.paired && health.protocolVersion === companionProtocolVersion;
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
    <section className="surface rounded-3xl p-5 sm:p-7">
      <h2 className="text-xl font-extrabold">Companion service</h2>
      <p className="text-muted mt-1 text-sm">
        Optional operating-system integrations are only available after the
        Windows companion is installed and paired.
      </p>
      {checking && !health ? (
        <p className="text-muted mt-4 text-sm">Checking the companion…</p>
      ) : !ready ? (
        <p className="surface-strong mt-4 rounded-2xl p-4 text-sm">
          No compatible paired companion is available. Complete pairing in the{' '}
          <Link className="text-fennec-cyan underline" to="/setup">
            Setup center
          </Link>
          .
        </p>
      ) : (
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="surface-strong rounded-2xl p-4">
            <strong className="flex items-center gap-2">
              <Rocket className="size-4 text-fennec-cyan" /> Rocket League
              shortcuts
            </strong>
            <p className="text-muted mt-2 text-sm">
              Each shortcut starts the companion, launches the selected store,
              and closes the companion when that exact game process exits.
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
              Start the tray collector when you sign in to Windows so it can
              capture even when no Fennec window is open.
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
                : 'Enable Windows startup'}
            </button>
          </div>
        </div>
      )}
      {message && <p className="text-muted mt-3 text-sm">{message}</p>}
    </section>
  );
}
