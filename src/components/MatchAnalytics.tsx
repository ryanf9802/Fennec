import { useCallback, useState } from 'react';
import {
  observedBallSpeed,
  playerTouchAnalytics,
  territorialImpactAnalytics,
} from '../domain/analytics';
import { formatSpeed } from '../domain/speed';
import type { FennecSettings, MatchState } from '../domain/types';
import BallTouchMap from './BallTouchMap';
import { FennecLoadingOverlay } from './FennecLoadingOverlay';
import { PressureAnalytics } from './PressureAnalytics';

function LoadingBallTouchMap({
  match,
  profileId,
  speedUnit,
}: {
  match: MatchState;
  profileId?: string;
  speedUnit: FennecSettings['speedUnit'];
}) {
  const [sceneReady, setSceneReady] = useState(false);
  const [revealComplete, setRevealComplete] = useState(false);
  const markSceneReady = useCallback(() => setSceneReady(true), []);
  const finishReveal = useCallback(() => setRevealComplete(true), []);

  return (
    <div
      className="relative overflow-hidden rounded-2xl"
      data-testid="ball-touch-map-frame"
    >
      <div data-testid="ball-touch-map-content" inert={!revealComplete}>
        <BallTouchMap
          match={match}
          profileId={profileId}
          speedUnit={speedUnit}
          onReady={markSceneReady}
        />
      </div>
      {!revealComplete && (
        <FennecLoadingOverlay
          loading={!sceneReady}
          placement="contained"
          loadingLabel="Loading 3D touch map"
          revealingLabel="Opening 3D touch map"
          onRevealComplete={finishReveal}
          testId="ball-touch-map-loading-overlay"
        />
      )}
    </div>
  );
}

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
  const touches = playerTouchAnalytics(match, profileId);
  const ballSpeed = observedBallSpeed(match);
  const pressure = territorialImpactAnalytics(match);
  const selectedView = view === 'pressure' && !pressure ? 'analytics' : view;
  const cards = [
    ['Your ball hits', profileId ? touches.touches : '—'],
    [
      'Team touch share',
      touches.touchShare === undefined
        ? '—'
        : `${Math.round(touches.touchShare * 100)}%`,
    ],
    [
      'Average hit speed',
      formatSpeed(touches.averagePostHitSpeed, speedUnit, {
        source: 'kilometers-per-hour',
      }),
    ],
    [
      'Fastest hit',
      formatSpeed(touches.maximumPostHitSpeed, speedUnit, {
        source: 'kilometers-per-hour',
      }),
    ],
    [
      'Average speed gain',
      formatSpeed(touches.averageSpeedChange, speedUnit, {
        source: 'kilometers-per-hour',
        signed: true,
      }),
    ],
    [
      'Observed ball speed',
      formatSpeed(ballSpeed.average, speedUnit, {
        source: 'meters-per-second',
      }),
    ],
    [
      'Maximum ball speed',
      formatSpeed(ballSpeed.maximum, speedUnit, {
        source: 'meters-per-second',
      }),
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
            {selectedView === 'analytics'
              ? 'Ball analytics'
              : selectedView === 'pressure'
                ? 'Pressure'
                : 'Ball touch map'}
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
              ...(pressure ? ([['pressure', 'Pressure']] as const) : []),
              ['touch-map', 'Touch map'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`ball-${value}-tab`}
              aria-selected={selectedView === value}
              aria-controls={`ball-${value}-panel`}
              disabled={saving}
              onClick={() => void selectView(value)}
              className={`rounded-lg px-3 py-2 text-xs font-bold transition ${selectedView === value ? 'bg-cyan-400/15 text-fennec-cyan' : 'text-muted hover:text-main'}`}
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

      {selectedView === 'analytics' ? (
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
              Snapshot-derived ball-speed analytics were not recorded for this
              legacy match.
            </p>
          )}
        </div>
      ) : selectedView === 'pressure' && pressure ? (
        <div
          id="ball-pressure-panel"
          role="tabpanel"
          aria-labelledby="ball-pressure-tab"
        >
          <PressureAnalytics
            match={match}
            analytics={pressure}
            profileId={profileId}
          />
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
          <LoadingBallTouchMap
            key={match.id}
            match={match}
            profileId={profileId}
            speedUnit={speedUnit}
          />
        </div>
      )}
    </section>
  );
}
