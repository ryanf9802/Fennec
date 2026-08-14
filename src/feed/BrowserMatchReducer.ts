import { reduceStatsEnvelope, type ReduceResult } from '../domain/reducer';
import type { MatchState, StatsEnvelope } from '../domain/types';

const identityKey = 'fennec-browser-match-identity-v1';
const identityLock = 'fennec-browser-match-identity';
const liveIdentityMaxAgeMs = 15 * 60_000;

interface SharedMatchIdentity {
  id: string;
  lifecycle: MatchState['lifecycle'];
  lastSeenAt: string;
}

interface MatchReduction {
  previous?: MatchState;
  result: ReduceResult;
}

function validIdentity(value: unknown): value is SharedMatchIdentity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    ['live', 'completed', 'incomplete'].includes(String(record.lifecycle)) &&
    typeof record.lastSeenAt === 'string'
  );
}

/** Coordinates guid-less match identity across tabs sharing the same origin. */
export class BrowserMatchReducer {
  async reduce(
    readPrevious: () => MatchState | undefined,
    envelope: StatsEnvelope,
    commit: (match: MatchState) => void,
    now = new Date().toISOString(),
  ): Promise<MatchReduction> {
    const operation = () => {
      const previous = readPrevious();
      const fallbackId = this.fallbackId(previous, envelope, now);
      const result = reduceStatsEnvelope(previous, envelope, now, fallbackId);
      this.remember(result.current);
      commit(result.current);
      return { previous, result };
    };
    const locks = navigator.locks;
    return locks
      ? locks.request(identityLock, operation)
      : Promise.resolve(operation());
  }

  /** Reuses only a recent live identity, while completed matches force a fresh allocation. */
  private fallbackId(
    previous: MatchState | undefined,
    envelope: StatsEnvelope,
    now: string,
  ): string | undefined {
    if (
      typeof envelope.data.MatchGuid === 'string' &&
      envelope.data.MatchGuid.trim()
    )
      return undefined;
    const startsMatch = ['MatchCreated', 'MatchInitialized'].includes(
      envelope.event,
    );
    const needsNew =
      !previous || (previous.lifecycle !== 'live' && startsMatch);
    if (!needsNew) return undefined;

    const shared = this.load();
    const sharedAge = shared
      ? Date.parse(now) - Date.parse(shared.lastSeenAt)
      : Number.POSITIVE_INFINITY;
    const reusable =
      shared?.lifecycle === 'live' &&
      sharedAge >= 0 &&
      sharedAge <= liveIdentityMaxAgeMs &&
      (!previous || shared.id !== previous.id);
    return reusable ? shared.id : crypto.randomUUID().replaceAll('-', '');
  }

  private load(): SharedMatchIdentity | undefined {
    try {
      const value = window.localStorage.getItem(identityKey);
      if (!value) return undefined;
      const parsed: unknown = JSON.parse(value);
      return validIdentity(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }

  private remember(match: MatchState): void {
    try {
      const shared = this.load();
      if (
        shared?.id === match.id &&
        shared.lifecycle === 'completed' &&
        match.lifecycle === 'live'
      )
        return;
      window.localStorage.setItem(
        identityKey,
        JSON.stringify({
          id: match.id,
          lifecycle: match.lifecycle,
          lastSeenAt: match.lastEventAt,
        } satisfies SharedMatchIdentity),
      );
    } catch {
      // Match capture remains available when shared browser storage is blocked.
    }
  }
}
