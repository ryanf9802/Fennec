import type { MatchState } from './types';
import type { SpatialEventPoint } from './analytics';

export type ArenaProfileKind = 'soccar' | 'hoops' | 'dropshot' | 'generic';

export interface ArenaProfile {
  kind: ArenaProfileKind;
  label: string;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMax: number;
}

const profiles: Record<ArenaProfileKind, ArenaProfile> = {
  soccar: { kind: 'soccar', label: 'Soccar', xMin: -4096, xMax: 4096, yMin: -5120, yMax: 5120, zMax: 2044 },
  hoops: { kind: 'hoops', label: 'Hoops', xMin: -2967, xMax: 2967, yMin: -3581, yMax: 3581, zMax: 1820 },
  dropshot: { kind: 'dropshot', label: 'Dropshot', xMin: -4600, xMax: 4600, yMin: -5200, yMax: 5200, zMax: 2020 },
  generic: { kind: 'generic', label: 'Arena coordinates', xMin: -4096, xMax: 4096, yMin: -5120, yMax: 5120, zMax: 2044 },
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

export function arenaProfile(match: MatchState, points: SpatialEventPoint[]): ArenaProfile {
  const base = profiles[profileKind(match)];
  const xExtent = Math.max(Math.abs(base.xMin), Math.abs(base.xMax), ...points.map((point) => Math.abs(point.x))) * 1.05;
  const yExtent = Math.max(Math.abs(base.yMin), Math.abs(base.yMax), ...points.map((point) => Math.abs(point.y))) * 1.05;
  const zMax = Math.max(base.zMax, ...points.map((point) => point.z));
  return { ...base, xMin: -xExtent, xMax: xExtent, yMin: -yExtent, yMax: yExtent, zMax };
}
