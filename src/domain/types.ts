export type MatchLifecycle = 'live' | 'completed' | 'incomplete';
export type PlaylistCategory =
  'ranked' | 'casual' | 'private' | 'lan' | 'unknown';
export type FeedConnectionState =
  'stopped' | 'connecting' | 'waiting' | 'live' | 'unavailable';
export type TimelinePreset = 'curated' | 'everything' | 'custom';

export interface StatsEnvelope {
  event: string;
  data: Record<string, unknown>;
}

export interface ParticipantState {
  name: string;
  primaryId?: string;
  shortcut?: number;
  teamNumber: number;
  score: number;
  goals: number;
  assists: number;
  passes: number;
  saves: number;
  shots: number;
  touches: number;
  carTouches?: number;
  demos: number;
  loadout?: string[];
  isPresent?: boolean;
}

export interface TeamState {
  teamNumber: number;
  name: string;
  score: number;
  colorPrimary: string;
  colorSecondary?: string;
}

export interface PlayerReference {
  name: string;
  shortcut?: number;
  teamNumber: number;
}

export interface BallState {
  speed: number;
  lastTouchTeamNumber?: number;
}

export interface NumericAggregate {
  samples: number;
  sum: number;
  min?: number;
  max?: number;
}

export interface MatchCapture {
  version: 1;
  updateStatePackets: number;
  activePlayPackets: number;
  ballSpeed: NumericAggregate;
  lastTouchSamplesByTeam: Record<string, number>;
}

export interface TimelineEvent {
  id: string;
  matchId: string;
  sequence: number;
  eventName: string;
  receivedAt: string;
  matchClockSeconds?: number;
  elapsedSeconds?: number;
  payload: Record<string, unknown>;
  rawPayloadAvailable?: boolean;
}

export interface MatchState {
  id: string;
  matchGuid?: string;
  lifecycle: MatchLifecycle;
  startedAt: string;
  lastEventAt: string;
  endedAt?: string;
  playlistId: number;
  playlistName: string;
  playlistCategory: PlaylistCategory;
  arena: string;
  timeSeconds: number;
  regulationDurationSeconds?: number;
  elapsedSeconds?: number;
  isOvertime: boolean;
  isReplay: boolean;
  roundActive?: boolean;
  roundPhaseObserved?: boolean;
  isPaused?: boolean;
  hasWinner?: boolean;
  winnerName?: string;
  ball?: BallState;
  viewTarget?: PlayerReference;
  capture?: MatchCapture;
  winnerTeamNumber?: number;
  teams: TeamState[];
  participants: ParticipantState[];
  events: TimelineEvent[];
  sessionEndedAfter?: true;
}

export interface SessionGroup {
  id: string;
  startedAt: string;
  endedAt: string;
  matches: MatchState[];
  endedManually: boolean;
}

export interface EncounterSummary {
  playerKey: string;
  primaryId?: string;
  identityKind: 'platform' | 'name';
  latestName: string;
  gamesTogether: number;
  winsTogether: number;
  lossesTogether: number;
  gamesOpposed: number;
  winsAgainst: number;
  lossesAgainst: number;
  firstSeen: string;
  lastSeen: string;
}

export interface FennecProfile {
  primaryId: string;
  displayName: string;
}

export interface FennecSettings {
  webSocketPort: number;
  sessionGapMinutes: number;
  autoOpenLiveMatch: boolean;
  theme: 'dark' | 'light' | 'system';
  timelinePreset: TimelinePreset;
  enabledTimelineEvents: string[];
  timelineAttributes: Record<string, string[]>;
  sidebarCollapsed: boolean;
  matchAnalyticsView: 'analytics' | 'touch-map';
  analytics: {
    playlistMode: 'ranked';
    groupByPlaylist: true;
  };
}

export const defaultSettings: FennecSettings = {
  webSocketPort: 49124,
  sessionGapMinutes: 30,
  autoOpenLiveMatch: false,
  theme: 'dark',
  timelinePreset: 'curated',
  enabledTimelineEvents: [],
  timelineAttributes: {},
  sidebarCollapsed: false,
  matchAnalyticsView: 'analytics',
  analytics: { playlistMode: 'ranked', groupByPlaylist: true },
};

/**
 * Merges persisted settings with defaults while constraining numeric ranges and
 * preserving only valid timeline selections and appearance values.
 */
export function normalizeSettings(
  input?: Partial<FennecSettings>,
): FennecSettings {
  const webSocketPort = Number(input?.webSocketPort);
  const sessionGapMinutes = Number(input?.sessionGapMinutes);
  const theme =
    input?.theme && ['dark', 'light', 'system'].includes(input.theme)
      ? input.theme
      : defaultSettings.theme;
  const timelinePreset =
    input?.timelinePreset &&
    ['curated', 'everything', 'custom'].includes(input.timelinePreset)
      ? input.timelinePreset
      : defaultSettings.timelinePreset;
  const matchAnalyticsView =
    input?.matchAnalyticsView === 'touch-map' ? 'touch-map' : 'analytics';
  return {
    ...defaultSettings,
    ...input,
    webSocketPort:
      Number.isInteger(webSocketPort) &&
      webSocketPort >= 1024 &&
      webSocketPort <= 65535
        ? webSocketPort
        : defaultSettings.webSocketPort,
    sessionGapMinutes:
      Number.isInteger(sessionGapMinutes) &&
      sessionGapMinutes >= 1 &&
      sessionGapMinutes <= 240
        ? sessionGapMinutes
        : defaultSettings.sessionGapMinutes,
    theme,
    timelinePreset,
    enabledTimelineEvents: Array.isArray(input?.enabledTimelineEvents)
      ? input.enabledTimelineEvents.filter(
          (item): item is string => typeof item === 'string',
        )
      : [],
    timelineAttributes:
      input?.timelineAttributes && typeof input.timelineAttributes === 'object'
        ? input.timelineAttributes
        : {},
    sidebarCollapsed: input?.sidebarCollapsed === true,
    matchAnalyticsView,
    autoOpenLiveMatch: input?.autoOpenLiveMatch === true,
    analytics: defaultSettings.analytics,
  };
}

export interface SessionMetrics {
  record: string;
  winRate: string;
  games: number;
  streak: string;
  goalDifference: number;
  goalsFor: number;
  goalsAgainst: number;
  goals: number;
  assists: number;
  passes: number;
  saves: number;
  shots: number;
  shootingPercentage?: number;
  averageScore: number;
  demos: number;
  touches: number;
}
