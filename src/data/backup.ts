import {
  normalizeSettings,
  type FennecProfile,
  type FennecSettings,
  type MatchState,
} from '../domain/types';
import { playerTouchAnalytics } from '../domain/analytics';
import { recalculateDerivedTouchStats } from '../domain/passes';

export interface FennecBackup {
  format: 'fennec-backup';
  version: 5;
  exportedAt: string;
  settings: FennecSettings;
  profile?: FennecProfile;
  matches: MatchState[];
}

interface StreamBackupHeader {
  format: 'fennec-backup';
  version: 3 | 4 | 5;
  encoding: 'ndjson';
  exportedAt: string;
  settings: FennecSettings;
  profile?: FennecProfile;
}

interface FileWriter {
  write(value: string): Promise<void>;
  close(): Promise<void>;
}
interface SaveFileHandle {
  createWritable(): Promise<FileWriter>;
}
type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

export function createBackup(
  matches: MatchState[],
  settings: FennecSettings,
  profile?: FennecProfile,
): FennecBackup {
  return {
    format: 'fennec-backup',
    version: 5,
    exportedAt: new Date().toISOString(),
    settings,
    profile,
    matches: matches.map(normalizeMatch),
  };
}

function normalizeMatch(match: MatchState): MatchState {
  const normalized = {
    ...match,
    participants: match.participants.map((player) => ({
      ...player,
      passes: player.passes ?? 0,
      fifties: player.fifties ?? 0,
      carTouches: player.carTouches ?? 0,
      loadout: player.loadout ?? [],
      isPresent: player.isPresent ?? true,
    })),
    teams: match.teams.map((team) => ({
      ...team,
      colorSecondary: team.colorSecondary ?? '',
    })),
    events: [...match.events].sort((a, b) => a.sequence - b.sequence),
  };
  recalculateDerivedTouchStats(normalized);
  return normalized;
}

/**
 * Parses JSON or streamed NDJSON backups, validates supported historical
 * versions and match records, then upgrades them to the current normalized shape.
 */
export function parseBackup(text: string): FennecBackup {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    const lines = text
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line) as unknown);
    const header = lines[0] as Partial<StreamBackupHeader> | undefined;
    if (
      header?.format !== 'fennec-backup' ||
      ![3, 4, 5].includes(header.version ?? 0) ||
      header.encoding !== 'ndjson'
    )
      throw new Error('This is not a supported Fennec backup.');
    const records = lines
      .slice(1)
      .map((line) => line as { type?: string; value?: unknown });
    if (
      records.some(
        (record) =>
          record.type !== 'match' ||
          !record.value ||
          typeof record.value !== 'object',
      )
    )
      throw new Error('The backup contains an invalid record.');
    value = { ...header, matches: records.map((record) => record.value) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Backup must be a JSON object.');
  const backup = value as Partial<FennecBackup> & { version?: number };
  if (
    backup.format !== 'fennec-backup' ||
    ![1, 2, 3, 4, 5].includes(backup.version ?? 0) ||
    !Array.isArray(backup.matches)
  ) {
    throw new Error('This is not a supported Fennec backup.');
  }
  for (const match of backup.matches) {
    if (
      !match ||
      typeof match.id !== 'string' ||
      !Array.isArray(match.events) ||
      !Array.isArray(match.participants)
    ) {
      throw new Error('The backup contains an invalid match.');
    }
  }
  return {
    format: 'fennec-backup',
    version: 5,
    exportedAt:
      typeof backup.exportedAt === 'string'
        ? backup.exportedAt
        : new Date().toISOString(),
    settings: normalizeSettings(backup.settings),
    profile: backup.profile,
    matches: backup.matches.map(normalizeMatch),
  };
}

export async function streamBackup(
  filename: string,
  matches: AsyncIterable<MatchState>,
  settings: FennecSettings,
  profile?: FennecProfile,
): Promise<boolean> {
  const picker = (window as Window & { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  if (!picker) return false;
  const handle = await picker.call(window, {
    suggestedName: filename,
    types: [
      {
        description: 'Fennec backup',
        accept: { 'application/x-ndjson': ['.ndjson'] },
      },
    ],
  });
  const writer = await handle.createWritable();
  const header: StreamBackupHeader = {
    format: 'fennec-backup',
    version: 5,
    encoding: 'ndjson',
    exportedAt: new Date().toISOString(),
    settings,
    profile,
  };
  try {
    await writer.write(`${JSON.stringify(header)}\n`);
    for await (const match of matches)
      await writer.write(
        `${JSON.stringify({ type: 'match', value: normalizeMatch(match) })}\n`,
      );
  } finally {
    await writer.close();
  }
  return true;
}

/**
 * Serializes chronological, profile-relative match results and telemetry into
 * an escaped CSV suitable for spreadsheet import.
 */
export function matchesCsv(matches: MatchState[], profileId?: string): string {
  const escape = (value: unknown) =>
    `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [
    [
      'match_id',
      'started_at',
      'playlist',
      'lifecycle',
      'result',
      'team_score',
      'opponent_score',
      'goals',
      'assists',
      'passes',
      'fifties',
      'saves',
      'shots',
      'car_touches',
      'ball_hits',
      'average_post_hit_speed',
      'maximum_post_hit_speed',
    ],
  ];
  for (const match of [...matches].sort((a, b) =>
    a.startedAt.localeCompare(b.startedAt),
  )) {
    const player = match.participants.find(
      (item) => item.primaryId === profileId,
    );
    const ownTeam = player
      ? match.teams.find((team) => team.teamNumber === player.teamNumber)
      : undefined;
    const opponentScore = player
      ? match.teams
          .filter((team) => team.teamNumber !== player.teamNumber)
          .reduce((sum, team) => sum + team.score, 0)
      : '';
    const result =
      !player || match.lifecycle !== 'completed'
        ? ''
        : match.winnerTeamNumber === player.teamNumber
          ? 'win'
          : 'loss';
    const touchAnalytics = playerTouchAnalytics(match, profileId);
    rows.push(
      [
        match.id,
        match.startedAt,
        match.playlistName,
        match.lifecycle,
        result,
        ownTeam?.score ?? '',
        opponentScore,
        player?.goals ?? '',
        player?.assists ?? '',
        player?.passes ?? '',
        player?.fifties ?? '',
        player?.saves ?? '',
        player?.shots ?? '',
        player?.carTouches ?? '',
        touchAnalytics.touches,
        touchAnalytics.averagePostHitSpeed?.toFixed(1) ?? '',
        touchAnalytics.maximumPostHitSpeed?.toFixed(1) ?? '',
      ].map(String),
    );
  }
  return rows.map((row) => row.map(escape).join(',')).join('\r\n');
}

export function downloadText(
  filename: string,
  text: string,
  type: string,
): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
