import type { PlaylistCategory } from './types';

const playlists: Record<number, [string, PlaylistCategory]> = {
  1: ['Casual Duel', 'casual'],
  2: ['Casual Doubles', 'casual'],
  3: ['Casual Standard', 'casual'],
  4: ['Casual Chaos', 'casual'],
  6: ['Private Match', 'private'],
  7: ['Season', 'unknown'],
  8: ['Exhibition', 'unknown'],
  10: ['Ranked Duel', 'ranked'],
  11: ['Ranked Doubles', 'ranked'],
  13: ['Ranked Standard', 'ranked'],
  27: ['Hoops', 'ranked'],
  28: ['Rumble', 'ranked'],
  29: ['Dropshot', 'ranked'],
  30: ['Snow Day', 'ranked'],
  34: ['Tournament', 'unknown'],
  37: ['Dropshot', 'casual'],
  38: ['Snow Day', 'casual'],
  39: ['Hoops', 'casual'],
  40: ['Rumble', 'casual'],
};

export function resolvePlaylist(id: number): {
  name: string;
  category: PlaylistCategory;
} {
  const found = playlists[id];
  return found
    ? { name: found[0], category: found[1] }
    : { name: `Playlist ${id}`, category: 'unknown' };
}
