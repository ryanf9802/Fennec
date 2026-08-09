import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { MatchHistoryQuery } from './historyRepository';
import { historyRepository } from './database';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000, refetchOnWindowFocus: false },
  },
});

export const historyKeys = {
  all: ['history'] as const,
  sessions: (profileKey?: string) =>
    ['history', 'sessions', profileKey] as const,
  session: (id?: string, profileKey?: string) =>
    ['history', 'session', id, profileKey] as const,
  match: (id?: string, profileKey?: string) =>
    ['history', 'match', id, profileKey] as const,
  players: (query = '', platformOnly = false) =>
    ['history', 'players', query, platformOnly] as const,
  playerHistory: (
    profileKey?: string,
    playerKey?: string,
    filters?: Omit<MatchHistoryQuery, 'profileKey' | 'playerKey' | 'cursor'>,
  ) => ['history', 'player', profileKey, playerKey, filters] as const,
  playerHistoryAvailability: (
    profileKey?: string,
    playerKeys: string[] = [],
    excludingMatchId?: string,
  ) =>
    [
      'history',
      'player-availability',
      profileKey,
      [...playerKeys].sort(),
      excludingMatchId,
    ] as const,
  overview: (profileKey?: string) =>
    ['history', 'overview', profileKey] as const,
  catalog: ['history', 'catalog'] as const,
  storage: ['history', 'storage'] as const,
};

export function useSessions(profileKey?: string) {
  return useInfiniteQuery({
    queryKey: historyKeys.sessions(profileKey),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      historyRepository.listSessions(profileKey, pageParam),
    getNextPageParam: (page) => page.nextCursor,
    enabled: !!profileKey,
  });
}

export function useSession(id?: string, profileKey?: string) {
  return useQuery({
    queryKey: historyKeys.session(id, profileKey),
    queryFn: () => historyRepository.getSession(id!, profileKey),
    enabled: !!id && !!profileKey,
  });
}

export function useMatch(id?: string, profileKey?: string) {
  return useQuery({
    queryKey: historyKeys.match(id, profileKey),
    queryFn: async () =>
      (await historyRepository.getMatch(id!, profileKey)) ?? null,
    enabled: !!id && !!profileKey,
  });
}

export function usePlayers(query = '', platformOnly = false) {
  return useQuery({
    queryKey: historyKeys.players(query, platformOnly),
    queryFn: () =>
      historyRepository.searchPlayers(
        query,
        100,
        platformOnly ? 'platform' : undefined,
      ),
  });
}

export function useOverview(profileKey?: string) {
  return useQuery({
    queryKey: historyKeys.overview(profileKey),
    queryFn: async () => {
      const [matches, sessions, firstMatchStartedAt] = await Promise.all([
        historyRepository.countMatches(profileKey),
        historyRepository.countSessions(profileKey),
        historyRepository.firstMatchStartedAt(profileKey),
      ]);
      return { matches, sessions, firstMatchStartedAt };
    },
    enabled: !!profileKey,
  });
}

export function usePlayerHistory(
  profileKey?: string,
  playerKey?: string,
  filters: Omit<MatchHistoryQuery, 'profileKey' | 'playerKey' | 'cursor'> = {},
) {
  return useInfiniteQuery({
    queryKey: historyKeys.playerHistory(profileKey, playerKey, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      historyRepository.getPlayerHistory(profileKey!, playerKey!, {
        ...filters,
        cursor: pageParam,
      }),
    getNextPageParam: (page) => page.matches.nextCursor,
    enabled: !!profileKey && !!playerKey && profileKey !== playerKey,
  });
}

export function usePlayerHistoryAvailability(
  profileKey?: string,
  playerKeys: string[] = [],
  excludingMatchId?: string,
) {
  return useQuery({
    queryKey: historyKeys.playerHistoryAvailability(
      profileKey,
      playerKeys,
      excludingMatchId,
    ),
    queryFn: () =>
      historyRepository.listPlayerKeysWithHistory(
        profileKey!,
        playerKeys,
        excludingMatchId!,
      ),
    enabled: !!profileKey && !!excludingMatchId && playerKeys.length > 0,
  });
}

export function useTimelineCatalog() {
  return useQuery({
    queryKey: historyKeys.catalog,
    queryFn: () => historyRepository.getTimelineCatalog(),
  });
}

export function useStorageStatistics() {
  return useQuery({
    queryKey: historyKeys.storage,
    queryFn: () => historyRepository.storageStatistics(),
  });
}
