import type { EncounterSummary, MatchState } from './types';
import { normalizePlayerKey, playerIdentityKind, playerKeyFor, playerPrimaryId } from './playerIdentity';

type Accumulator = EncounterSummary;

export function calculateEncounters(matches: MatchState[], profilePrimaryId?: string): EncounterSummary[] {
  const profileKey = normalizePlayerKey(profilePrimaryId);
  if (!profileKey) return [];
  const values = new Map<string, Accumulator>();
  for (const match of [...matches].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const profile = match.participants.find((player) => playerKeyFor(player) === profileKey);
    if (!profile) continue;
    const profileWon = match.lifecycle === 'completed' && match.winnerTeamNumber === profile.teamNumber;
    for (const player of match.participants) {
      const playerKey = playerKeyFor(player);
      if (!playerKey || playerKey === profileKey) continue;
      const current = values.get(playerKey) ?? {
        playerKey,
        primaryId: playerPrimaryId(playerKey),
        identityKind: playerIdentityKind(playerKey)!,
        latestName: player.name,
        gamesTogether: 0,
        winsTogether: 0,
        lossesTogether: 0,
        gamesOpposed: 0,
        winsAgainst: 0,
        lossesAgainst: 0,
        firstSeen: match.startedAt,
        lastSeen: match.startedAt,
      };
      current.latestName = player.name;
      current.lastSeen = match.startedAt;
      if (player.teamNumber === profile.teamNumber) {
        current.gamesTogether++;
        if (match.lifecycle === 'completed') {
          if (profileWon) current.winsTogether++;
          else current.lossesTogether++;
        }
      } else {
        current.gamesOpposed++;
        if (match.lifecycle === 'completed') {
          if (profileWon) current.winsAgainst++;
          else current.lossesAgainst++;
        }
      }
      values.set(playerKey, current);
    }
  }
  return [...values.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
