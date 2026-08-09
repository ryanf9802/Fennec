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
import { formatSpeed } from '../domain/speed';
import { formatClock } from '../domain/timeline';
import {
  spatialEventPoints,
  type SpatialEventPoint,
} from '../domain/analytics';
import {
  constrainCameraState,
  defaultCameraState,
  viewRelativePanDelta,
  type TouchMapCameraState,
} from '../domain/touchMapGeometry';
import type { MatchState, SpeedUnit } from '../domain/types';
import { resolveTeamPresentation } from '../domain/teamPresentation';
import { BallTouchScene } from './BallTouchScene';

type Filter = 'all' | 'self' | 'team' | 'opponents' | `player:${string}`;

function goalLabel(point: SpatialEventPoint): string {
  return point.goalNumber ? `Goal #${point.goalNumber} scored` : 'Goal scored';
}

function actorNames(point: SpatialEventPoint): string {
  if (point.kind === 'fifty') {
    const teams = new Map<number, string[]>();
    for (const actor of point.actors) {
      const names = teams.get(actor.teamNumber) ?? [];
      names.push(actor.name);
      teams.set(actor.teamNumber, names);
    }
    return [...teams.entries()]
      .sort(([first], [second]) => first - second)
      .map(([, names]) => names.join(' + '))
      .join(' vs ');
  }
  return point.actors.map((actor) => actor.name).join(', ') || 'Unknown player';
}

function pointTitle(point: SpatialEventPoint): string {
  const actors = actorNames(point);
  if (point.kind === 'goal') return `${actors} · ${goalLabel(point)}`;
  const scoring = point.isScoringTouch
    ? point.goalNumber
      ? `Goal #${point.goalNumber} scoring touch`
      : 'Goal scoring touch'
    : undefined;
  const details = [
    point.kind === 'fifty' ? '50/50' : undefined,
    point.isSave ? 'Save' : undefined,
    scoring,
  ].filter((value): value is string => !!value);
  return `${actors} · ${details.join(' · ') || point.kind}`;
}

function pointLabel(point: SpatialEventPoint, speedUnit: SpeedUnit): string {
  const speed =
    point.kind === 'goal'
      ? formatSpeed(point.speed, speedUnit, { source: 'kilometers-per-hour' })
      : formatSpeed(point.postHitSpeed, speedUnit);
  return `${pointTitle(point)}, at ${formatClock(point.elapsedSeconds)}, ${speed}`;
}

function isTouchMarker(point: SpatialEventPoint): boolean {
  return point.kind === 'touch' || point.kind === 'fifty';
}

function matchesFilter(
  point: SpatialEventPoint,
  filter: Filter,
  profileId: string | undefined,
  profileTeam: number | undefined,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'self')
    return point.actors.some((actor) => actor.primaryId === profileId);
  if (filter === 'team')
    return point.actors.some((actor) => actor.teamNumber === profileTeam);
  if (filter === 'opponents')
    return point.actors.some(
      (actor) => profileTeam !== undefined && actor.teamNumber !== profileTeam,
    );
  const id = filter.slice('player:'.length);
  return point.actors.some((actor) => actor.primaryId === id);
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

/**
 * Coordinates semantic point filtering with the map's mouse, touch, camera,
 * team-orientation, and accessible marker controls in one shared viewport.
 */
export function BallTouchMap({
  match,
  profileId,
  speedUnit,
}: {
  match: MatchState;
  profileId?: string;
  speedUnit: SpeedUnit;
}) {
  const points = useMemo(
    () =>
      spatialEventPoints(match).filter((point) => point.kind !== 'crossbar'),
    [match],
  );
  const touchPoints = points.filter(isTouchMarker);
  const profilePlayer = match.participants.find(
    (player) => player.primaryId === profileId,
  );
  const hasProfileTouches =
    !!profileId &&
    touchPoints.some((point) =>
      point.actors.some((actor) => actor.primaryId === profileId),
    );
  const orientationYaw = profilePlayer?.teamNumber === 1 ? 180 : 0;
  const leftTeamNumber = profilePlayer?.teamNumber ?? 0;
  const rightTeamNumber = leftTeamNumber === 0 ? 1 : 0;
  const teamNumbers = [
    ...new Set([0, 1, ...match.teams.map((team) => team.teamNumber)]),
  ];
  const teams = teamNumbers.map((teamNumber) =>
    resolveTeamPresentation(match.teams, teamNumber),
  );
  const teamPresentation = (teamNumber: number) =>
    teams.find((team) => team.teamNumber === teamNumber) ??
    resolveTeamPresentation(match.teams, teamNumber);
  const [filter, setFilter] = useState<Filter>(
    hasProfileTouches ? 'self' : 'all',
  );
  const [active, setActive] = useState<string>();
  const arena = arenaProfile(match);
  const goalLabels = arena.goal
    ? [
        {
          teamNumber: leftTeamNumber,
          label: profilePlayer
            ? 'Your goal'
            : `${teamPresentation(leftTeamNumber).name} goal`,
          teamName: teamPresentation(leftTeamNumber).name,
          primaryColor: teamPresentation(leftTeamNumber).primaryColor,
          secondaryColor: teamPresentation(leftTeamNumber).secondaryColor,
        },
        {
          teamNumber: rightTeamNumber,
          label: profilePlayer
            ? 'Opponent goal'
            : `${teamPresentation(rightTeamNumber).name} goal`,
          teamName: teamPresentation(rightTeamNumber).name,
          primaryColor: teamPresentation(rightTeamNumber).primaryColor,
          secondaryColor: teamPresentation(rightTeamNumber).secondaryColor,
        },
      ]
    : [];
  const [camera, setCamera] = useState<TouchMapCameraState>(() =>
    defaultCameraState(arena),
  );
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | undefined>(undefined);
  const rotation = useRef<
    { pointerId: number; x: number; y: number } | undefined
  >(undefined);
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
  const activePoint = points.find((point) => point.id === active);
  const emphasizedIds = new Set(
    activePoint
      ? [activePoint.id, activePoint.associatedPointId].filter(
          (id): id is string => !!id,
        )
      : [],
  );
  const visible = points.filter(
    (point) =>
      matchesFilter(point, filter, profileId, profilePlayer?.teamNumber) ||
      emphasizedIds.has(point.id),
  );

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

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button === 2) {
      event.preventDefault();
      rotation.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
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
  const moveDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (rotation.current?.pointerId === event.pointerId) {
      const dx = event.clientX - rotation.current.x;
      const dy = event.clientY - rotation.current.y;
      rotation.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      updateCamera((current) => ({
        ...current,
        pitch: current.pitch - dy * 0.3,
        yaw: current.yaw - dx * 0.3,
      }));
      return;
    }
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
    updateCamera((current) => {
      const delta = viewRelativePanDelta(dx, dy, orientationYaw + current.yaw);
      return {
        ...current,
        targetX: current.targetX + delta.x * scale,
        targetZ: current.targetZ + delta.z * scale,
      };
    });
  };
  const stopDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (rotation.current?.pointerId === event.pointerId) {
      rotation.current = undefined;
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    pointers.current.delete(event.pointerId);
    pinch.current = undefined;
    const remaining = [...pointers.current.values()][0];
    drag.current = remaining ? { ...remaining } : undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
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
        data-camera-yaw={Math.round(camera.yaw)}
        className="surface-flat relative h-[clamp(22rem,56vw,38rem)] cursor-grab touch-none overflow-hidden rounded-2xl active:cursor-grabbing"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
        onContextMenu={(event) => event.preventDefault()}
      >
        <SceneErrorBoundary>
          <BallTouchScene
            profile={arena}
            teams={teams}
            points={visible}
            cameraState={camera}
            goalLabels={goalLabels}
            orientationYaw={orientationYaw}
            activeId={active}
            emphasizedIds={[...emphasizedIds]}
            onActivate={setActive}
          />
        </SceneErrorBoundary>

        <div className="surface-strong text-muted pointer-events-none absolute left-3 top-3 rounded-lg px-3 py-2 text-xs shadow-xl">
          Left drag to pan · right drag to rotate · scroll or pinch to zoom
        </div>

        <div
          className="absolute right-3 top-3 flex items-start drop-shadow-xl"
          onPointerDown={(event) => event.stopPropagation()}
          onPointerMove={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="surface-strong flex h-[3.25rem] items-center rounded-l-xl px-3">
            <input
              aria-label="Field rotation"
              aria-valuetext={`${Math.round(camera.yaw)} degrees`}
              type="range"
              min="-90"
              max="90"
              step="1"
              value={camera.yaw}
              onChange={(event) =>
                updateCamera((current) => ({
                  ...current,
                  yaw: Number(event.target.value),
                }))
              }
              className="w-36 cursor-pointer accent-cyan-400"
            />
          </div>
          <div className="surface-strong flex flex-col items-center gap-2 rounded-b-xl rounded-tr-xl p-2">
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
            <div className="font-bold">{pointTitle(activePoint)}</div>
            <div className="text-muted mt-1">
              {formatClock(activePoint.elapsedSeconds)} · XYZ{' '}
              {Math.round(activePoint.x)}, {Math.round(activePoint.y)},{' '}
              {Math.round(activePoint.z)}
              {activePoint.kind !== 'goal'
                ? ` · ${formatSpeed(activePoint.preHitSpeed, speedUnit)} → ${formatSpeed(activePoint.postHitSpeed, speedUnit)}`
                : ` · ${formatSpeed(activePoint.speed, speedUnit, { source: 'kilometers-per-hour' })}`}
            </div>
          </div>
        )}
      </div>

      <div className="sr-only" aria-label="Touch map points">
        {visible.map((point) => (
          <button
            key={point.id}
            type="button"
            aria-label={pointLabel(point, speedUnit)}
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
