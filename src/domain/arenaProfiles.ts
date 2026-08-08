import type { MatchState } from './types';

export type ArenaProfileKind = 'soccar' | 'hoops' | 'dropshot' | 'generic';
export type ArenaPoint = readonly [x: number, y: number];

export interface ArenaGoal {
  halfWidth: number;
  height: number;
  depth: number;
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

const roundedFootprint = (
  xExtent: number,
  yExtent: number,
  radius: number,
): readonly ArenaPoint[] => {
  const points: ArenaPoint[] = [];
  for (const [cx, cy, start] of [
    [xExtent - radius, yExtent - radius, 0],
    [-xExtent + radius, yExtent - radius, 90],
    [-xExtent + radius, -yExtent + radius, 180],
    [xExtent - radius, -yExtent + radius, 270],
  ] as const) {
    for (let step = 0; step <= 4; step++) {
      const angle = ((start + step * 22.5) * Math.PI) / 180;
      points.push([
        cx + Math.cos(angle) * radius,
        cy + Math.sin(angle) * radius,
      ]);
    }
  }
  return points;
};

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
    xMin: -2967,
    xMax: 2967,
    yMin: -3581,
    yMax: 3581,
    zMax: 1820,
    footprint: roundedFootprint(2967, 3581, 720),
  },
  dropshot: {
    kind: 'dropshot',
    label: 'Dropshot',
    xMin: -4555,
    xMax: 4555,
    yMin: -5026,
    yMax: 5026,
    zMax: 1986,
    footprint: [
      [-4555, -2513],
      [0, -5026],
      [4555, -2513],
      [4555, 2513],
      [0, 5026],
      [-4555, 2513],
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
  if (arena.includes('drop')) return 'dropshot';
  return 'generic';
}

export function arenaProfile(match: MatchState): ArenaProfile {
  return profiles[profileKind(match)];
}
