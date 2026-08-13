import { isTrackablePrimaryId, normalizePlayerName } from './playerIdentity';
import { isTrainingMatch } from './playlists';
import type { FennecProfile, MatchState, ParticipantState } from './types';

export type InitialProfileInference =
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'resolved'; profile: FennecProfile };

function resolved(
  participant: ParticipantState,
): Extract<InitialProfileInference, { status: 'resolved' }> {
  return {
    status: 'resolved',
    profile: {
      primaryId: participant.primaryId!,
      displayName: participant.name,
    },
  };
}

/**
 * Infers the first user profile from ordinary play while leaving ambiguous or
 * incomplete snapshots available for an explicit profile-page selection.
 */
export function inferInitialProfile(
  match: MatchState,
): InitialProfileInference {
  if (match.lifecycle !== 'live' || match.isReplay)
    return { status: 'pending' };

  const participants = match.participants.filter((participant) =>
    isTrackablePrimaryId(participant.primaryId),
  );
  if (!participants.length) return { status: 'pending' };

  if (isTrainingMatch(match))
    return participants.length === 1
      ? resolved(participants[0]!)
      : { status: 'failed' };

  const target = match.viewTarget;
  if (!target) return { status: 'failed' };

  if (target.shortcut !== undefined) {
    const shortcutMatches = participants.filter(
      (participant) => participant.shortcut === target.shortcut,
    );
    if (shortcutMatches.length === 1) return resolved(shortcutMatches[0]!);
  }

  const targetName = normalizePlayerName(target.name);
  if (!targetName) return { status: 'failed' };
  const identityMatches = participants.filter(
    (participant) =>
      participant.teamNumber === target.teamNumber &&
      normalizePlayerName(participant.name) === targetName,
  );
  return identityMatches.length === 1
    ? resolved(identityMatches[0]!)
    : { status: 'failed' };
}
