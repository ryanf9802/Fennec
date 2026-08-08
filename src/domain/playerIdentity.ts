import type { ParticipantState } from './types';

export type PlayerIdentityKind = 'platform' | 'name';

export function isTrackablePrimaryId(primaryId?: string): primaryId is string {
  if (!primaryId) return false;
  const [platform, uid] = primaryId.split('|');
  return (
    !!platform && platform.toLowerCase() !== 'unknown' && !!uid && uid !== '0'
  );
}

export function normalizePlayerName(name?: string): string | undefined {
  if (!name) return undefined;
  const normalized = name.normalize('NFKC').trim().toLowerCase();
  return normalized && normalized !== 'unknown player' ? normalized : undefined;
}

export function playerKeyFor(
  participant: Pick<ParticipantState, 'name' | 'primaryId'>,
): string | undefined {
  if (isTrackablePrimaryId(participant.primaryId))
    return `id:${participant.primaryId}`;
  const name = normalizePlayerName(participant.name);
  return name ? `name:${name}` : undefined;
}

export function playerKeyForPrimaryId(primaryId?: string): string | undefined {
  return isTrackablePrimaryId(primaryId) ? `id:${primaryId}` : undefined;
}

export function normalizePlayerKey(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith('id:')) return playerKeyForPrimaryId(value.slice(3));
  if (value.startsWith('name:')) {
    const name = normalizePlayerName(value.slice(5));
    return name ? `name:${name}` : undefined;
  }
  return playerKeyForPrimaryId(value);
}

export function playerIdentityKind(
  playerKey?: string,
): PlayerIdentityKind | undefined {
  return playerKey?.startsWith('id:')
    ? 'platform'
    : playerKey?.startsWith('name:')
      ? 'name'
      : undefined;
}

export function playerPrimaryId(playerKey?: string): string | undefined {
  return playerKey?.startsWith('id:') ? playerKey.slice(3) : undefined;
}
