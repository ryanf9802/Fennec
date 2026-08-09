import type { MatchState } from './types';

export type ArenaProfileKind = 'soccar' | 'hoops' | 'dropshot' | 'generic';
export type ArenaPoint = readonly [x: number, y: number];

export interface ArenaGoal {
  halfWidth: number;
  height: number;
  depth: number;
}

export interface ArenaHoop {
  centerY: number;
  height: number;
  radius: number;
  tubeRadius: number;
}

export interface ArenaProfile {
  kind: ArenaProfileKind;
  label: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMax: number;
  footprint: readonly ArenaPoint[];
  goal?: ArenaGoal;
  hoop?: ArenaHoop;
}

const soccarFootprint: readonly ArenaPoint[] = [
  [-2944, -5120],
  [2944, -5120],
  [4096, -3968],
  [4096, 3968],
  [2944, 5120],
  [-2944, 5120],
  [-4096, 3968],
  [-4096, -3968],
];

const hoopsSideWall = 2966.67;
const hoopsBackWall = 3581;
const hoopsDiagonalIntercept = 5782;
const hoopsBackCornerX = hoopsDiagonalIntercept - hoopsBackWall;
const hoopsSideCornerY = hoopsDiagonalIntercept - hoopsSideWall;

const profiles: Record<ArenaProfileKind, ArenaProfile> = {
  soccar: {
    kind: 'soccar',
    label: 'Soccar',
    xMin: -4096,
    xMax: 4096,
    yMin: -5120,
    yMax: 5120,
    zMax: 2044,
    footprint: soccarFootprint,
    goal: { halfWidth: 892.755, height: 642.775, depth: 880 },
  },
  hoops: {
    kind: 'hoops',
    label: 'Hoops',
    xMin: -hoopsSideWall,
    xMax: hoopsSideWall,
    yMin: -hoopsBackWall,
    yMax: hoopsBackWall,
    zMax: 1820,
    footprint: [
      [-hoopsBackCornerX, -hoopsBackWall],
      [hoopsBackCornerX, -hoopsBackWall],
      [hoopsSideWall, -hoopsSideCornerY],
      [hoopsSideWall, hoopsSideCornerY],
      [hoopsBackCornerX, hoopsBackWall],
      [-hoopsBackCornerX, hoopsBackWall],
      [-hoopsSideWall, hoopsSideCornerY],
      [-hoopsSideWall, -hoopsSideCornerY],
    ],
    hoop: { centerY: 2969, height: 364, radius: 655, tubeRadius: 21 },
  },
  dropshot: {
    kind: 'dropshot',
    label: 'Dropshot',
    xMin: -5026,
    xMax: 5026,
    yMin: -4555,
    yMax: 4555,
    zMax: 1986,
    footprint: [
      [-2513, -4555],
      [2513, -4555],
      [5026, 0],
      [2513, 4555],
      [-2513, 4555],
      [-5026, 0],
    ],
  },
  generic: {
    kind: 'generic',
    label: 'Arena coordinates',
    xMin: -4096,
    xMax: 4096,
    yMin: -5120,
    yMax: 5120,
    zMax: 2044,
    footprint: soccarFootprint,
    goal: { halfWidth: 892.755, height: 642.775, depth: 880 },
  },
};

const soccarPlaylists = new Set([1, 2, 3, 4, 10, 11, 13, 28, 30, 34, 38, 40]);
const hoopsPlaylists = new Set([27, 39]);
const dropshotPlaylists = new Set([29, 37]);

function profileKind(match: MatchState): ArenaProfileKind {
  if (hoopsPlaylists.has(match.playlistId)) return 'hoops';
  if (dropshotPlaylists.has(match.playlistId)) return 'dropshot';
  if (soccarPlaylists.has(match.playlistId)) return 'soccar';
  const arena = match.arena.toLowerCase();
  if (arena.includes('hoop') || arena.includes('basket')) return 'hoops';
  if (
    arena.includes('drop') ||
    arena.includes('shattershot') ||
    arena.includes('core707')
  )
    return 'dropshot';
  return 'generic';
}

export function arenaProfile(match: MatchState): ArenaProfile {
  return profiles[profileKind(match)];
}
