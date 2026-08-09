import type { SpatialEventPoint } from './analytics';
import type { ArenaPoint, ArenaProfile } from './arenaProfiles';

export interface ScenePoint {
  x: number;
  y: number;
  z: number;
}

export interface TouchMapCameraState {
  pitch: number;
  targetX: number;
  targetZ: number;
  distance: number;
}

export interface WallPanel {
  start: ArenaPoint;
  end: ArenaPoint;
  zMin: number;
  zMax: number;
}

export function gameToScene(
  point: Pick<SpatialEventPoint, 'x' | 'y' | 'z'>,
): ScenePoint {
  return { x: point.y, y: point.z, z: point.x };
}

export function goalMarkerPosition(
  profile: ArenaProfile,
  point: Pick<SpatialEventPoint, 'x' | 'y' | 'z'>,
): ScenePoint {
  if (!profile.goal) return gameToScene(point);
  const wallY = point.y < 0 ? profile.yMin : profile.yMax;
  return {
    x: wallY,
    y: Math.max(0, Math.min(profile.goal.height, point.z)),
    z: Math.max(
      -profile.goal.halfWidth,
      Math.min(profile.goal.halfWidth, point.x),
    ),
  };
}

export function sceneToGameFloor(sceneX: number, sceneZ: number): ArenaPoint {
  return [sceneZ, sceneX];
}

export function pointInPolygon(
  [x, y]: ArenaPoint,
  polygon: readonly ArenaPoint[],
): boolean {
  let inside = false;
  for (
    let index = 0, prior = polygon.length - 1;
    index < polygon.length;
    prior = index++
  ) {
    const [xi, yi] = polygon[index]!;
    const [xj, yj] = polygon[prior]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function inGoal(profile: ArenaProfile, [x, y]: ArenaPoint): boolean {
  const goal = profile.goal;
  if (!goal || Math.abs(x) > goal.halfWidth) return false;
  return (
    (y >= profile.yMax && y <= profile.yMax + goal.depth) ||
    (y <= profile.yMin && y >= profile.yMin - goal.depth)
  );
}

function closestOnSegment(
  point: ArenaPoint,
  start: ArenaPoint,
  end: ArenaPoint,
): ArenaPoint {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  const amount = lengthSquared
    ? Math.max(
        0,
        Math.min(
          1,
          ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) /
            lengthSquared,
        ),
      )
    : 0;
  return [start[0] + dx * amount, start[1] + dy * amount];
}

function playableEdges(profile: ArenaProfile): Array<[ArenaPoint, ArenaPoint]> {
  const edges = profile.footprint.map((point, index) => [
    point,
    profile.footprint[(index + 1) % profile.footprint.length]!,
  ]) as Array<[ArenaPoint, ArenaPoint]>;
  if (!profile.goal) return edges;
  for (const side of [-1, 1]) {
    const wallY = side < 0 ? profile.yMin : profile.yMax;
    const backY = wallY + side * profile.goal.depth;
    const left: ArenaPoint = [-profile.goal.halfWidth, wallY];
    const right: ArenaPoint = [profile.goal.halfWidth, wallY];
    const backLeft: ArenaPoint = [-profile.goal.halfWidth, backY];
    const backRight: ArenaPoint = [profile.goal.halfWidth, backY];
    edges.push([left, backLeft], [backLeft, backRight], [backRight, right]);
  }
  return edges;
}

export function clampPanTarget(
  profile: ArenaProfile,
  sceneX: number,
  sceneZ: number,
): { x: number; z: number } {
  const gamePoint = sceneToGameFloor(sceneX, sceneZ);
  if (
    pointInPolygon(gamePoint, profile.footprint) ||
    inGoal(profile, gamePoint)
  )
    return { x: sceneX, z: sceneZ };

  let nearest = profile.footprint[0]!;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [start, end] of playableEdges(profile)) {
    const candidate = closestOnSegment(gamePoint, start, end);
    const dx = candidate[0] - gamePoint[0];
    const dy = candidate[1] - gamePoint[1];
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return { x: nearest[1], z: nearest[0] };
}

export function arenaWallPanels(profile: ArenaProfile): WallPanel[] {
  const panels: WallPanel[] = [];
  profile.footprint.forEach((start, index) => {
    const end = profile.footprint[(index + 1) % profile.footprint.length]!;
    const isBackWall =
      !!profile.goal &&
      start[1] === end[1] &&
      (start[1] === profile.yMin || start[1] === profile.yMax);
    if (!isBackWall || !profile.goal) {
      panels.push({ start, end, zMin: 0, zMax: profile.zMax });
      return;
    }
    const left = Math.min(start[0], end[0]);
    const right = Math.max(start[0], end[0]);
    panels.push(
      {
        start: [left, start[1]],
        end: [-profile.goal.halfWidth, start[1]],
        zMin: 0,
        zMax: profile.zMax,
      },
      {
        start: [profile.goal.halfWidth, start[1]],
        end: [right, start[1]],
        zMin: 0,
        zMax: profile.zMax,
      },
      {
        start: [left, start[1]],
        end: [right, start[1]],
        zMin: profile.goal.height,
        zMax: profile.zMax,
      },
    );
  });
  return panels;
}

export function cameraDistanceBounds(profile: ArenaProfile): {
  min: number;
  default: number;
  max: number;
} {
  const width = profile.yMax - profile.yMin + (profile.goal?.depth ?? 0) * 2;
  const depth = profile.xMax - profile.xMin;
  const extent = Math.max(width, depth);
  return { min: extent * 0.72, default: extent * 1.28, max: extent * 2.5 };
}

export function defaultCameraState(profile: ArenaProfile): TouchMapCameraState {
  return {
    pitch: 0,
    targetX: 0,
    targetZ: 0,
    distance: cameraDistanceBounds(profile).default,
  };
}

export function constrainCameraState(
  profile: ArenaProfile,
  state: TouchMapCameraState,
): TouchMapCameraState {
  const target = clampPanTarget(profile, state.targetX, state.targetZ);
  const distances = cameraDistanceBounds(profile);
  return {
    pitch: Math.max(0, Math.min(90, state.pitch)),
    targetX: target.x,
    targetZ: target.z,
    distance: Math.max(distances.min, Math.min(distances.max, state.distance)),
  };
}
