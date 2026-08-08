import type { MatchState, ParticipantState } from './types';

export interface PlayerAverages {
  score: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  touches: number;
  demos: number;
}

export interface RelationshipHistory {
  games: number;
  wins: number;
  losses: number;
  winRate?: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsForPerGame: number;
  goalsAgainstPerGame: number;
  firstSeen?: string;
  lastSeen?: string;
  you: PlayerAverages;
  player: PlayerAverages;
}

export interface RecentMeeting {
  matchId: string;
  startedAt: string;
  playlistName: string;
  relationship: 'together' | 'against';
  result: 'win' | 'loss' | 'incomplete';
  score: string;
}

export interface PlayerHistory {
  primaryId: string;
  latestName: string;
  totalMeetings: number;
  firstSeen: string;
  lastSeen: string;
  together: RelationshipHistory;
  against: RelationshipHistory;
  recent: RecentMeeting[];
}

export function isTrackablePrimaryId(primaryId?: string): primaryId is string {
  if (!primaryId) return false;
  const [platform, uid] = primaryId.split('|');
  return !!platform && platform.toLowerCase() !== 'unknown' && !!uid && uid !== '0';
}

const emptyAverages = (): PlayerAverages => ({ score: 0, goals: 0, assists: 0, saves: 0, shots: 0, touches: 0, demos: 0 });

function averages(players: ParticipantState[]): PlayerAverages {
  if (!players.length) return emptyAverages();
  const total = players.reduce((sum, player) => ({
    score: sum.score + player.score,
    goals: sum.goals + player.goals,
    assists: sum.assists + player.assists,
    saves: sum.saves + player.saves,
    shots: sum.shots + player.shots,
    touches: sum.touches + player.touches,
    demos: sum.demos + player.demos,
  }), emptyAverages());
  return Object.fromEntries(Object.entries(total).map(([key, value]) => [key, Math.round(value * 10 / players.length) / 10])) as unknown as PlayerAverages;
}

function relationship(matches: MatchState[], profileId: string, playerId: string, together: boolean): RelationshipHistory {
  const related = matches.filter((match) => {
    const you = match.participants.find((player) => player.primaryId === profileId);
    const player = match.participants.find((participant) => participant.primaryId === playerId);
    return !!you && !!player && (you.teamNumber === player.teamNumber) === together;
  });
  const completed = related.filter((match) => match.lifecycle === 'completed' && match.winnerTeamNumber !== undefined);
  const wins = completed.filter((match) => match.participants.find((player) => player.primaryId === profileId)?.teamNumber === match.winnerTeamNumber).length;
  const goalsFor = completed.reduce((sum, match) => {
    const team = match.participants.find((player) => player.primaryId === profileId)?.teamNumber;
    return sum + (match.teams.find((item) => item.teamNumber === team)?.score ?? 0);
  }, 0);
  const goalsAgainst = completed.reduce((sum, match) => {
    const team = match.participants.find((player) => player.primaryId === profileId)?.teamNumber;
    return sum + match.teams.filter((item) => item.teamNumber !== team).reduce((total, item) => total + item.score, 0);
  }, 0);
  const divisor = completed.length || 1;
  return {
    games: completed.length,
    wins,
    losses: completed.length - wins,
    winRate: completed.length ? Math.round(wins * 100 / completed.length) : undefined,
    goalsFor,
    goalsAgainst,
    goalsForPerGame: Math.round(goalsFor * 10 / divisor) / 10,
    goalsAgainstPerGame: Math.round(goalsAgainst * 10 / divisor) / 10,
    firstSeen: completed.at(0)?.startedAt,
    lastSeen: completed.at(-1)?.startedAt,
    you: averages(completed.flatMap((match) => match.participants.filter((player) => player.primaryId === profileId))),
    player: averages(completed.flatMap((match) => match.participants.filter((player) => player.primaryId === playerId))),
  };
}

export function calculatePlayerHistory(matches: MatchState[], profileId?: string, playerId?: string): PlayerHistory | undefined {
  if (!isTrackablePrimaryId(profileId) || !isTrackablePrimaryId(playerId) || profileId === playerId) return undefined;
  const related = [...matches].filter((match) => match.participants.some((player) => player.primaryId === profileId) && match.participants.some((player) => player.primaryId === playerId)).sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  if (!related.length) return undefined;
  const latestPlayer = [...related].reverse().flatMap((match) => match.participants).find((player) => player.primaryId === playerId)!;
  const recent = [...related].reverse().slice(0, 8).map((match): RecentMeeting => {
    const you = match.participants.find((player) => player.primaryId === profileId)!;
    const player = match.participants.find((item) => item.primaryId === playerId)!;
    const teams = [...match.teams].sort((a, b) => a.teamNumber - b.teamNumber);
    const completed = match.lifecycle === 'completed' && match.winnerTeamNumber !== undefined;
    return {
      matchId: match.id,
      startedAt: match.startedAt,
      playlistName: match.playlistName,
      relationship: you.teamNumber === player.teamNumber ? 'together' : 'against',
      result: !completed ? 'incomplete' : match.winnerTeamNumber === you.teamNumber ? 'win' : 'loss',
      score: teams.length >= 2 ? `${teams[0]!.score}–${teams.at(-1)!.score}` : '—',
    };
  });
  return {
    primaryId: playerId,
    latestName: latestPlayer.name,
    totalMeetings: related.length,
    firstSeen: related[0]!.startedAt,
    lastSeen: related.at(-1)!.startedAt,
    together: relationship(related, profileId, playerId, true),
    against: relationship(related, profileId, playerId, false),
    recent,
  };
}
