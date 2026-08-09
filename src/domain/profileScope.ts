import type { MatchState } from './types';

export function matchBelongsToProfile(
  match: Pick<MatchState, 'observedByPrimaryId' | 'participants'>,
  primaryId?: string,
): boolean {
  return Boolean(
    primaryId &&
    (match.observedByPrimaryId === primaryId ||
      match.participants.some((player) => player.primaryId === primaryId)),
  );
}
