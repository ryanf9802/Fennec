import {
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  Monitor,
  TriangleAlert,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useFennec } from '../app/FennecContext';
import { CompanionLaunchControls } from '../components/CompanionSettings';
import { StatsApiSetup } from '../components/StatsApiSetup';
import {
  acceptCompanionPairing,
  companionCommand,
  companionDownloadUrl,
  companionOpenUrl,
  companionProtocolVersion,
} from '../companion/client';
import { useCompanionStatus } from '../companion/useCompanionStatus';
import { isStatsApiConnected } from '../domain/connectionPresentation';
import { useLocalAccess } from '../platform/LocalAccessContext';

type SetupPath = 'companion' | 'browser';
const setupPathKey = 'fennec-setup-path-explicit-v2';

function storedSetupPath(): SetupPath | undefined {
  if (new URLSearchParams(location.hash.slice(1)).has('companion'))
    return 'companion';
  try {
    const stored = window.localStorage?.getItem(setupPathKey);
    return stored === 'browser' || stored === 'companion' ? stored : undefined;
  } catch {
    return undefined;
  }
}

function Requirement({
  complete,
  title,
  children,
}: {
  complete: boolean;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="surface-strong rounded-2xl p-4">
      <div className="flex gap-3">
        {complete ? (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
        ) : (
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-fennec-orange" />
        )}
        <div>
          <strong>{title}</strong>
          <div className="text-muted mt-1 text-sm">{children}</div>
        </div>
      </div>
    </li>
  );
}

function CollapsibleRequirement({
  complete,
  title,
  defaultExpanded,
  children,
}: {
  complete: boolean;
  title: string;
  defaultExpanded: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <li className="surface-strong rounded-2xl p-4">
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary className="text-main flex cursor-pointer list-none gap-3">
          {complete ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
          ) : (
            <TriangleAlert className="mt-0.5 size-5 shrink-0 text-fennec-orange" />
          )}
          <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
            <strong>{title}</strong>
            <ChevronDown
              aria-hidden="true"
              className={`size-4 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </span>
        </summary>
        <div className="text-muted mt-1 ml-8 text-sm">{children}</div>
      </details>
    </li>
  );
}

function SetupPathChooser({
  path,
  onSelect,
}: {
  path?: SetupPath;
  onSelect(path: SetupPath): void;
}) {
  const cardClass = (candidate: SetupPath) =>
    `surface cursor-pointer rounded-3xl p-6 text-left transition-[opacity,filter,box-shadow] ${
      path === candidate
        ? 'opacity-100 ring-2 ring-cyan-400'
        : path
          ? 'opacity-65 hover:opacity-90 focus-visible:opacity-100'
          : 'opacity-100 hover:brightness-110'
    }`;
  return (
    <section
      aria-label="Choose a setup path"
      className="grid w-full gap-4 lg:grid-cols-2"
    >
      <button
        aria-pressed={path === 'companion'}
        className={cardClass('companion')}
        onClick={() => onSelect('companion')}
      >
        <span className="eyebrow">Recommended</span>
        <h2 className="mt-2 text-xl font-extrabold">With companion</h2>
        <p className="text-muted mt-2 text-sm">
          Background capture, guided Steam/Epic setup, tray operation, and
          synchronized browser history.
        </p>
      </button>
      <button
        aria-pressed={path === 'browser'}
        className={cardClass('browser')}
        onClick={() => onSelect('browser')}
      >
        <span className="eyebrow">No installation</span>
        <h2 className="mt-2 text-xl font-extrabold">Browser only</h2>
        <p className="text-muted mt-2 text-sm">
          Works without the companion, but Fennec must remain open and protected
          configuration may need manual editing.
        </p>
      </button>
    </section>
  );
}

/** Presents both setup paths from live browser, companion, storefront, and feed evidence instead of user-checked documentation. */
export function OnboardingPage() {
  const access = useLocalAccess();
  const { connection, statsApiVerified } = useFennec();
  const companion = useCompanionStatus();
  const { health, recheck } = companion;
  const [path, setPath] = useState<SetupPath | undefined>(storedSetupPath);
  const [configuring, setConfiguring] = useState<'steam' | 'epic'>();
  const [companionMessage, setCompanionMessage] = useState<string>();
  const selectPath = useCallback((nextPath: SetupPath) => {
    setPath(nextPath);
    try {
      window.localStorage?.setItem(setupPathKey, nextPath);
    } catch {
      // Setup remains usable when browser storage is blocked.
    }
  }, []);
  useEffect(() => {
    if (acceptCompanionPairing()) {
      try {
        window.localStorage?.setItem(setupPathKey, 'companion');
      } catch {
        // Pairing remains active for this visit when storage is blocked.
      }
      void recheck();
    }
  }, [recheck]);
  const paired = Boolean(health?.paired);
  const compatible =
    paired && health?.protocolVersion === companionProtocolVersion;
  const statsApiConnected = isStatsApiConnected(connection);
  const storesConfigured = Boolean(
    health?.stores?.length &&
    health.stores.every((store) => health.configuredStores?.includes(store)),
  );
  const setupComplete =
    access.satisfied &&
    (path === 'browser'
      ? statsApiVerified
      : paired &&
        compatible &&
        storesConfigured &&
        Boolean(health?.lastPacketAt));
  const configuredStores = health?.stores
    ?.map((store) => (store === 'steam' ? 'Steam' : 'Epic'))
    .join(' and ');
  const configureStore = async (store: 'steam' | 'epic') => {
    setConfiguring(store);
    const configured = await companionCommand(`configure-${store}`);
    setCompanionMessage(
      configured
        ? `${store === 'steam' ? 'Steam' : 'Epic'} configuration saved and verified.`
        : `Could not configure ${store === 'steam' ? 'Steam' : 'Epic'}.`,
    );
    await recheck();
    setConfiguring(undefined);
  };
  if (!path)
    return (
      <div className="flex min-h-[calc(100vh-8rem)] items-center">
        <div className="w-full space-y-6" data-testid="setup-path-intro">
          <header className="mx-auto max-w-2xl text-center">
            <h1 className="text-3xl font-black sm:text-4xl">
              Choose your setup approach
            </h1>
            <p className="text-muted mt-3">
              Select how you want to set up Fennec. You can change this at any
              time from the Setup page.
            </p>
          </header>
          <SetupPathChooser onSelect={selectPath} />
        </div>
      </div>
    );
  return (
    <div className="space-y-7">
      <header>
        <div className="eyebrow">Setup center</div>
        <h1 className="mt-1 text-3xl font-black sm:text-4xl">Connect Fennec</h1>
        <p className="text-muted mt-2">
          Return here whenever you want to verify permissions, configuration,
          the companion, or the live feed.
        </p>
      </header>

      <SetupPathChooser path={path} onSelect={selectPath} />

      <section
        aria-labelledby="setup-instructions-title"
        className="surface rounded-3xl p-5 sm:p-7"
      >
        <h2 id="setup-instructions-title" className="text-xl font-extrabold">
          Setup instructions
        </h2>
        <ol className="mt-5 grid gap-3">
          <Requirement
            complete={access.satisfied}
            title="Allow apps on this device"
          >
            {access.satisfied ? (
              'Browser permission is ready.'
            ) : (
              <>
                Choose the persistent option when prompted.{' '}
                <button
                  className="cursor-pointer text-fennec-cyan underline"
                  onClick={() => void access.request()}
                >
                  Request access
                </button>
              </>
            )}
          </Requirement>
          {path === 'companion' ? (
            <>
              <Requirement
                complete={paired}
                title="Install and pair the companion"
              >
                {paired
                  ? `Companion ${health?.version} is paired and responding.`
                  : health
                    ? `Companion ${health.version} is responding but is not paired with this browser.`
                    : 'The companion is not running or cannot be reached from this browser.'}
                {!paired && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <a className="button-primary" href={companionOpenUrl()}>
                      Open installed companion
                    </a>
                    <a
                      className="button-secondary"
                      href={companionDownloadUrl}
                      download
                    >
                      <Download className="size-4" /> Download latest companion
                    </a>
                  </div>
                )}
              </Requirement>
              <Requirement
                complete={compatible}
                title="Use a compatible companion protocol"
              >
                {compatible
                  ? 'Browser and companion protocol versions match.'
                  : !health
                    ? 'Protocol verification starts after the companion responds.'
                    : !paired
                      ? 'Pair this browser to verify protocol compatibility.'
                      : 'Update the browser app or companion before synchronization.'}
              </Requirement>
              <Requirement
                complete={storesConfigured}
                title="Detect and configure Steam or Epic"
              >
                {!health
                  ? 'Storefront detection starts after the companion responds.'
                  : health.stores?.length
                    ? `Detected ${health.stores.join(' and ')}. ${health.stores.every((store) => health.configuredStores?.includes(store)) ? 'Stats API configuration is verified.' : 'Configure each installation you use.'}`
                    : 'The companion did not find a supported Steam or Epic installation.'}
                {health?.stores?.length ? (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {health.stores?.includes('steam') && (
                      <button
                        className="button-secondary"
                        disabled={Boolean(configuring)}
                        onClick={() => void configureStore('steam')}
                      >
                        Configure Steam
                      </button>
                    )}
                    {health.stores?.includes('epic') && (
                      <button
                        className="button-secondary"
                        disabled={Boolean(configuring)}
                        onClick={() => void configureStore('epic')}
                      >
                        Configure Epic
                      </button>
                    )}
                  </div>
                ) : null}
                {companionMessage && <p className="mt-2">{companionMessage}</p>}
              </Requirement>
              <Requirement
                complete={Boolean(health?.lastPacketAt)}
                title="Verify live capture"
              >
                {health?.lastPacketAt
                  ? `Feed connected${health.lastPacketAt ? `; last packet ${new Date(health.lastPacketAt).toLocaleTimeString()}` : ''}.`
                  : health?.feedConnected
                    ? 'Connected to Rocket League; waiting for the first Stats API packet.'
                    : 'Start Rocket League after configuration and wait for the first Stats API packet.'}
              </Requirement>
            </>
          ) : (
            <>
              <CollapsibleRequirement
                key={statsApiVerified ? 'verified' : 'unverified'}
                complete={statsApiVerified}
                defaultExpanded={!statsApiVerified}
                title="Enable the Rocket League Stats API"
              >
                <p>
                  {statsApiConnected
                    ? "Fennec is connected to Rocket League's Stats API."
                    : statsApiVerified
                      ? 'Fennec previously connected successfully. Start Rocket League to reconnect.'
                      : 'Follow these steps, restart Rocket League, and keep Fennec open. This step will complete automatically when the connection is ready.'}
                </p>
                <StatsApiSetup />
              </CollapsibleRequirement>
            </>
          )}
        </ol>
        {path === 'companion' && compatible && health && (
          <div className="mt-6 border-t border-white/10 pt-6">
            <h3 className="text-lg font-extrabold">
              Launch Fennec with Rocket League
            </h3>
            <p className="text-muted mt-1 text-sm">
              Windows startup is the recommended hands-off option. Store
              shortcuts are available when you prefer to run the companion only
              for a game session, and dashboard opening remains optional.
            </p>
            <div className="mt-4">
              <CompanionLaunchControls health={health} recheck={recheck} />
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-white/10 pt-5">
          <a
            className="button-secondary"
            href="https://www.rocketleague.com/developer/stats-api"
            target="_blank"
            rel="noreferrer"
          >
            Official Stats API guide <ExternalLink className="size-4" />
          </a>
          <span className="text-muted flex items-center gap-2 text-sm">
            <Monitor className="size-4" /> Setup instructions remain available
            from the navigation.
          </span>
        </div>
      </section>
      {setupComplete && (
        <section
          aria-labelledby="setup-complete-title"
          className="rounded-3xl border border-emerald-400/30 bg-emerald-400/8 p-5 sm:p-7"
        >
          <div className="flex gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-400" />
            <div>
              <h2 id="setup-complete-title" className="text-xl font-extrabold">
                Fennec is set up and ready to go
              </h2>
              <p className="text-muted mt-1 text-sm">
                {path === 'companion'
                  ? `Companion setup is complete${configuredStores ? ` for ${configuredStores}` : ''}. Fennec can capture matches in the background.`
                  : 'Browser-only setup is complete. Start Rocket League and keep Fennec open while you play to capture matches.'}
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
