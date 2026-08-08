import type { EncounterSummary, MatchState } from './types';

type Accumulator = EncounterSummary;

export function calculateEncounters(matches: MatchState[], profilePrimaryId?: string): EncounterSummary[] {
  if (!profilePrimaryId) return [];
  const values = new Map<string, Accumulator>();
  for (const match of [...matches].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const profile = match.participants.find((player) => player.primaryId === profilePrimaryId);
    if (!profile) continue;
    const profileWon = match.lifecycle === 'completed' && match.winnerTeamNumber === profile.teamNumber;
    for (const player of match.participants) {
      if (!player.primaryId || player.primaryId === profilePrimaryId) continue;
      const current = values.get(player.primaryId) ?? {
        primaryId: player.primaryId,
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
      values.set(player.primaryId, current);
    }
  }
  return [...values.values()].sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}
