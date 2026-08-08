import { QueryClient, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { MatchHistoryQuery } from './historyRepository';
import { historyRepository } from './database';

export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } });

export const historyKeys = {
  all: ['history'] as const,
  sessions: ['history', 'sessions'] as const,
  session: (id?: string) => ['history', 'session', id] as const,
  match: (id?: string) => ['history', 'match', id] as const,
  players: (query = '') => ['history', 'players', query] as const,
  playerHistory: (profileKey?: string, playerKey?: string, filters?: Omit<MatchHistoryQuery, 'profileKey' | 'playerKey' | 'cursor'>) => ['history', 'player', profileKey, playerKey, filters] as const,
  overview: ['history', 'overview'] as const,
  catalog: ['history', 'catalog'] as const,
  storage: ['history', 'storage'] as const,
};

export function useSessions() {
  return useInfiniteQuery({
    queryKey: historyKeys.sessions,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => historyRepository.listSessions(pageParam),
    getNextPageParam: (page) => page.nextCursor,
  });
}

export function useSession(id?: string) {
  return useQuery({ queryKey: historyKeys.session(id), queryFn: () => historyRepository.getSession(id!), enabled: !!id });
}

export function useMatch(id?: string) {
  return useQuery({ queryKey: historyKeys.match(id), queryFn: () => historyRepository.getMatch(id!), enabled: !!id });
}

export function usePlayers(query = '') {
  return useQuery({ queryKey: historyKeys.players(query), queryFn: () => historyRepository.searchPlayers(query) });
}

export function useOverview() {
  return useQuery({ queryKey: historyKeys.overview, queryFn: async () => {
    const [matches, sessions, firstMatchStartedAt] = await Promise.all([historyRepository.countMatches(), historyRepository.countSessions(), historyRepository.firstMatchStartedAt()]);
    return { matches, sessions, firstMatchStartedAt };
  } });
}

export function usePlayerHistory(profileKey?: string, playerKey?: string, filters: Omit<MatchHistoryQuery, 'profileKey' | 'playerKey' | 'cursor'> = {}) {
  return useInfiniteQuery({
    queryKey: historyKeys.playerHistory(profileKey, playerKey, filters),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => historyRepository.getPlayerHistory(profileKey!, playerKey!, { ...filters, cursor: pageParam }),
    getNextPageParam: (page) => page.matches.nextCursor,
    enabled: !!profileKey && !!playerKey && profileKey !== playerKey,
  });
}

export function useTimelineCatalog() {
  return useQuery({ queryKey: historyKeys.catalog, queryFn: () => historyRepository.getTimelineCatalog() });
}

export function useStorageStatistics() {
  return useQuery({ queryKey: historyKeys.storage, queryFn: () => historyRepository.storageStatistics() });
}
