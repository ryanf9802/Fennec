import { lazy, Suspense, useState } from 'react';
import { observedBallSpeed, playerTouchAnalytics } from '../domain/analytics';
import { formatSpeed } from '../domain/speed';
import type { FennecSettings, MatchState } from '../domain/types';

const BallTouchMap = lazy(() => import('./BallTouchMap'));

/**
 * Presents one persisted match-telemetry view at a time, keeping the WebGL
 * renderer out of the page until the user selects the touch map.
 */
export function MatchAnalytics({
  match,
  profileId,
  speedUnit,
  view,
  onViewChange,
}: {
  match: MatchState;
  profileId?: string;
  speedUnit: FennecSettings['speedUnit'];
  view: FennecSettings['matchAnalyticsView'];
  onViewChange(next: FennecSettings['matchAnalyticsView']): Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const player = match.participants.find(
    (value) => value.primaryId === profileId,
  );
  const touches = playerTouchAnalytics(match, profileId);
  const ballSpeed = observedBallSpeed(match);
  const lastTouchSamples = match.capture?.lastTouchSamplesByTeam ?? {};
  const totalControl = Object.values(lastTouchSamples).reduce(
    (sum, value) => sum + value,
    0,
  );
  const ownControl = player
    ? (lastTouchSamples[String(player.teamNumber)] ?? 0)
    : 0;
  const cards = [
    ['Your ball hits', profileId ? touches.touches : '—'],
    [
      'Team touch share',
      touches.touchShare === undefined
        ? '—'
        : `${Math.round(touches.touchShare * 100)}%`,
    ],
    ['Average hit speed', formatSpeed(touches.averagePostHitSpeed, speedUnit)],
    ['Fastest hit', formatSpeed(touches.maximumPostHitSpeed, speedUnit)],
    [
      'Average speed gain',
      formatSpeed(touches.averageSpeedChange, speedUnit, { signed: true }),
    ],
    ['Observed ball speed', formatSpeed(ballSpeed.average, speedUnit)],
    ['Maximum ball speed', formatSpeed(ballSpeed.maximum, speedUnit)],
    [
      'Last-touch control',
      !player || !totalControl
        ? '—'
        : `${Math.round((ownControl * 100) / totalControl)}%`,
    ],
  ];

  const selectView = async (next: FennecSettings['matchAnalyticsView']) => {
    if (next === view || saving) return;
    setSaving(true);
    setError(undefined);
    try {
      await onViewChange(next);
    } catch (reason) {
      setError(
        `Could not save telemetry view: ${reason instanceof Error ? reason.message : String(reason)}`,
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Normal-play telemetry</div>
          <h2 className="mt-1 text-xl font-extrabold">
            {view === 'analytics' ? 'Ball analytics' : 'Ball touch map'}
          </h2>
        </div>
        <div
          role="tablist"
          aria-label="Ball telemetry view"
          className="surface-flat flex rounded-xl p-1"
        >
          {(
            [
              ['analytics', 'Ball analytics'],
              ['touch-map', 'Touch map'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`ball-${value}-tab`}
              aria-selected={view === value}
              aria-controls={`ball-${value}-panel`}
              disabled={saving}
              onClick={() => void selectView(value)}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${view === value ? 'bg-cyan-400/15 text-fennec-cyan' : 'text-muted hover:text-main'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-fennec-orange text-xs">
          {error}
        </p>
      )}

      {view === 'analytics' ? (
        <div
          id="ball-analytics-panel"
          role="tabpanel"
          aria-labelledby="ball-analytics-tab"
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {cards.map(([label, value]) => (
              <div key={label} className="surface-flat rounded-xl p-3">
                <div className="text-muted text-[0.68rem] font-black uppercase tracking-wider">
                  {label}
                </div>
                <div className="mt-1 text-lg font-extrabold">{value}</div>
              </div>
            ))}
          </div>
          {!match.capture && (
            <p className="text-muted text-xs">
              Snapshot-derived speed and control analytics were not recorded for
              this legacy match.
            </p>
          )}
        </div>
      ) : (
        <div
          id="ball-touch-map-panel"
          role="tabpanel"
          aria-labelledby="ball-touch-map-tab"
          className="space-y-3"
        >
          <div className="flex flex-wrap items-end justify-between gap-2">
            <p className="text-muted text-xs">
              Explore exact ball-hit and goal locations in three dimensions.
            </p>
            <span className="eyebrow">{match.arena || match.playlistName}</span>
          </div>
          <Suspense
            fallback={
              <div className="surface-flat text-muted grid h-96 place-items-center rounded-2xl text-sm">
                Loading 3D touch map…
              </div>
            }
          >
            <BallTouchMap
              key={match.id}
              match={match}
              profileId={profileId}
              speedUnit={speedUnit}
            />
          </Suspense>
        </div>
      )}
    </section>
  );
}
