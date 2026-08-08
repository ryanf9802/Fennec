import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { RotateCcw } from 'lucide-react';
import { arenaProfile } from '../domain/arenaProfiles';
import { formatClock } from '../domain/timeline';
import {
  spatialEventPoints,
  type SpatialEventPoint,
} from '../domain/analytics';
import {
  constrainCameraState,
  defaultCameraState,
  type TouchMapCameraState,
} from '../domain/touchMapGeometry';
import type { MatchState } from '../domain/types';
import { BallTouchScene } from './BallTouchScene';

type Filter = 'all' | 'self' | 'team' | 'opponents' | `player:${string}`;

function formatSpeed(value?: number): string {
  return value === undefined ? '—' : `${Math.round(value)} uu/s`;
}

function pointLabel(point: SpatialEventPoint): string {
  const actors =
    point.actors.map((actor) => actor.name).join(', ') || 'Unknown player';
  if (point.kind === 'touch')
    return `${actors}, touch at ${formatClock(point.elapsedSeconds)}, ${formatSpeed(point.postHitSpeed)}`;
  return `${actors}, goal at ${formatClock(point.elapsedSeconds)}, ${formatSpeed(point.speed)}`;
}

class SceneErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // The inline fallback keeps the analytics tab available when WebGL fails.
  }

  render() {
    if (this.state.failed)
      return (
        <div
          role="alert"
          className="text-muted grid h-full place-items-center p-8 text-center text-sm"
        >
          The 3D touch map is unavailable in this browser. Ball analytics is
          still available through its tab.
        </div>
      );
    return this.props.children;
  }
}

export function BallTouchMap({
  match,
  profileId,
}: {
  match: MatchState;
  profileId?: string;
}) {
  const points = useMemo(
    () =>
      spatialEventPoints(match).filter((point) => point.kind !== 'crossbar'),
    [match],
  );
  const touchPoints = points.filter((point) => point.kind === 'touch');
  const profilePlayer = match.participants.find(
    (player) => player.primaryId === profileId,
  );
  const hasProfileTouches =
    !!profileId &&
    touchPoints.some((point) =>
      point.actors.some((actor) => actor.primaryId === profileId),
    );
  const [filter, setFilter] = useState<Filter>(
    hasProfileTouches ? 'self' : 'all',
  );
  const [active, setActive] = useState<string>();
  const arena = arenaProfile(match);
  const [camera, setCamera] = useState<TouchMapCameraState>(() =>
    defaultCameraState(arena),
  );
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; x: number; y: number } | undefined>(
    undefined,
  );

  const players = match.participants.filter(
    (player) =>
      player.primaryId &&
      player.primaryId !== profileId &&
      touchPoints.some((point) =>
        point.actors.some((actor) => actor.primaryId === player.primaryId),
      ),
  );
  const visible = points.filter((point) => {
    if (filter === 'all') return true;
    if (filter === 'self')
      return point.actors.some((actor) => actor.primaryId === profileId);
    if (filter === 'team')
      return point.actors.some(
        (actor) => actor.teamNumber === profilePlayer?.teamNumber,
      );
    if (filter === 'opponents')
      return point.actors.some(
        (actor) =>
          profilePlayer && actor.teamNumber !== profilePlayer.teamNumber,
      );
    const id = filter.slice('player:'.length);
    return point.actors.some((actor) => actor.primaryId === id);
  });

  const updateCamera = (
    update: (current: TouchMapCameraState) => TouchMapCameraState,
  ) => setCamera((current) => constrainCameraState(arena, update(current)));

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const zoom = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      setCamera((current) =>
        constrainCameraState(arena, {
          ...current,
          distance: current.distance * (event.deltaY > 0 ? 1.1 : 0.9),
        }),
      );
    };
    element.addEventListener('wheel', zoom, { passive: false });
    return () => element.removeEventListener('wheel', zoom);
  }, [arena]);

  const startPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    drag.current = { x: event.clientX, y: event.clientY };
    if (pointers.current.size === 2) {
      const [first, second] = [...pointers.current.values()];
      pinch.current = {
        distance: Math.hypot(second!.x - first!.x, second!.y - first!.y),
        x: (first!.x + second!.x) / 2,
        y: (first!.y + second!.y) / 2,
      };
    }
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const pan = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId) || !drag.current) return;
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointers.current.size >= 2) {
      const [first, second] = [...pointers.current.values()];
      const next = {
        distance: Math.max(
          1,
          Math.hypot(second!.x - first!.x, second!.y - first!.y),
        ),
        x: (first!.x + second!.x) / 2,
        y: (first!.y + second!.y) / 2,
      };
      if (pinch.current) {
        const scale =
          camera.distance / Math.max(320, event.currentTarget.clientHeight);
        const previous = pinch.current;
        updateCamera((current) => ({
          ...current,
          distance: current.distance * (previous.distance / next.distance),
          targetX: current.targetX - (next.x - previous.x) * scale,
          targetZ: current.targetZ - (next.y - previous.y) * scale,
        }));
      }
      pinch.current = next;
      return;
    }
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    const scale =
      camera.distance / Math.max(320, event.currentTarget.clientHeight);
    updateCamera((current) => ({
      ...current,
      targetX: current.targetX - dx * scale,
      targetZ: current.targetZ - dy * scale,
    }));
  };
  const stopPan = (event: ReactPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pinch.current = undefined;
    const remaining = [...pointers.current.values()][0];
    drag.current = remaining ? { ...remaining } : undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const activePoint = visible.find((point) => point.id === active);
  return (
    <div className="relative space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Touch map filters">
        {(
          [
            ['all', 'All'],
            ...(hasProfileTouches ? [['self', 'You']] : []),
            ...(profilePlayer
              ? [
                  ['team', 'Your team'],
                  ['opponents', 'Opponents'],
                ]
              : []),
            ...players.map((player) => [
              `player:${player.primaryId}`,
              player.name,
            ]),
          ] as Array<[Filter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setActive(undefined);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === value ? 'bg-cyan-400/20 text-fennec-cyan' : 'surface-flat text-muted hover:text-fennec-cyan'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={viewport}
        data-testid="ball-touch-map-viewport"
        data-camera-target={`${Math.round(camera.targetX)},${Math.round(camera.targetZ)}`}
        data-camera-distance={Math.round(camera.distance)}
        className="surface-flat relative h-[clamp(22rem,56vw,38rem)] cursor-grab touch-none overflow-hidden rounded-2xl active:cursor-grabbing"
        onPointerDown={startPan}
        onPointerMove={pan}
        onPointerUp={stopPan}
        onPointerCancel={stopPan}
      >
        <SceneErrorBoundary>
          <BallTouchScene
            profile={arena}
            points={visible}
            cameraState={camera}
            activeId={active}
            onActivate={setActive}
          />
        </SceneErrorBoundary>

        <div
          className="surface-strong absolute right-3 top-3 flex flex-col items-center gap-2 rounded-xl p-2 shadow-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            aria-label="Reset 3D touch map view"
            title="Reset view"
            className="text-muted hover:text-fennec-cyan grid size-9 place-items-center rounded-lg transition"
            onClick={() => setCamera(defaultCameraState(arena))}
          >
            <RotateCcw className="size-4" />
          </button>
          <input
            aria-label="Field pitch"
            aria-valuetext={`${Math.round(camera.pitch)} degrees`}
            type="range"
            min="0"
            max="90"
            step="1"
            value={camera.pitch}
            onChange={(event) =>
              updateCamera((current) => ({
                ...current,
                pitch: Number(event.target.value),
              }))
            }
            className="h-40 w-5 cursor-pointer accent-cyan-400"
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
          />
        </div>

        {!visible.length && (
          <div className="surface-strong pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-center text-xs">
            {points.length
              ? 'No ball touches match this filter.'
              : 'No ball touches were captured for this match.'}
          </div>
        )}
        {activePoint && (
          <div className="surface-strong pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl px-3 py-2 text-xs shadow-xl sm:left-auto sm:max-w-sm">
            <div className="font-bold">
              {activePoint.actors.map((actor) => actor.name).join(', ') ||
                'Unknown player'}{' '}
              · {activePoint.kind}
            </div>
            <div className="text-muted mt-1">
              {formatClock(activePoint.elapsedSeconds)} · XYZ{' '}
              {Math.round(activePoint.x)}, {Math.round(activePoint.y)},{' '}
              {Math.round(activePoint.z)}
              {activePoint.kind === 'touch'
                ? ` · ${formatSpeed(activePoint.preHitSpeed)} → ${formatSpeed(activePoint.postHitSpeed)}`
                : ` · ${formatSpeed(activePoint.speed)}`}
            </div>
          </div>
        )}
      </div>

      <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>● Blue touch</span>
        <span className="text-fennec-orange">● Orange touch</span>
        <span className="text-amber-400">● Goal</span>
        <span className="ml-auto">Drag to pan · scroll or pinch to zoom</span>
      </div>
      <div className="sr-only" aria-label="Touch map points">
        {visible.map((point) => (
          <button
            key={point.id}
            type="button"
            aria-label={pointLabel(point)}
            onFocus={() => setActive(point.id)}
            onBlur={() => setActive(undefined)}
            onClick={() => setActive(point.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default BallTouchMap;
