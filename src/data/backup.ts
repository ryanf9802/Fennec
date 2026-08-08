import { normalizeSettings, type FennecProfile, type FennecSettings, type MatchState } from '../domain/types';

export interface FennecBackup {
  format: 'fennec-backup';
  version: 1;
  exportedAt: string;
  settings: FennecSettings;
  profile?: FennecProfile;
  matches: MatchState[];
}

export function createBackup(matches: MatchState[], settings: FennecSettings, profile?: FennecProfile): FennecBackup {
  return { format: 'fennec-backup', version: 1, exportedAt: new Date().toISOString(), settings, profile, matches };
}

export function parseBackup(text: string): FennecBackup {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Backup must be a JSON object.');
  const backup = value as Partial<FennecBackup>;
  if (backup.format !== 'fennec-backup' || backup.version !== 1 || !Array.isArray(backup.matches)) {
    throw new Error('This is not a supported Fennec backup.');
  }
  for (const match of backup.matches) {
    if (!match || typeof match.id !== 'string' || !Array.isArray(match.events) || !Array.isArray(match.participants)) {
      throw new Error('The backup contains an invalid match.');
    }
  }
  return {
    format: 'fennec-backup', version: 1,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : new Date().toISOString(),
    settings: normalizeSettings(backup.settings),
    profile: backup.profile,
    matches: backup.matches,
  };
}

export function matchesCsv(matches: MatchState[], profileId?: string): string {
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['match_id', 'started_at', 'playlist', 'lifecycle', 'result', 'team_score', 'opponent_score', 'goals', 'assists', 'saves', 'shots']];
  for (const match of [...matches].sort((a, b) => a.startedAt.localeCompare(b.startedAt))) {
    const player = match.participants.find((item) => item.primaryId === profileId);
    const ownTeam = player ? match.teams.find((team) => team.teamNumber === player.teamNumber) : undefined;
    const opponentScore = player ? match.teams.filter((team) => team.teamNumber !== player.teamNumber).reduce((sum, team) => sum + team.score, 0) : '';
    const result = !player || match.lifecycle !== 'completed' ? '' : match.winnerTeamNumber === player.teamNumber ? 'win' : 'loss';
    rows.push([match.id, match.startedAt, match.playlistName, match.lifecycle, result, ownTeam?.score ?? '', opponentScore, player?.goals ?? '', player?.assists ?? '', player?.saves ?? '', player?.shots ?? ''].map(String));
  }
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
