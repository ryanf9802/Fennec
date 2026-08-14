import type { MatchState, StatsEnvelope } from '../src/domain/types';
import { BrowserMatchReducer } from '../src/feed/BrowserMatchReducer';

const matchCreated: StatsEnvelope = { event: 'MatchCreated', data: {} };

function reducerState() {
  let current: MatchState | undefined;
  return {
    read: () => current,
    commit: (match: MatchState) => {
      current = match;
    },
  };
}

describe('browser match identity coordination', () => {
  let randomUuid: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    randomUuid = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValue('22222222-2222-4222-8222-222222222222');
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    let tail = Promise.resolve<unknown>(undefined);
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: (_name: string, callback: () => unknown) => {
          const result = tail.then(callback);
          tail = result.catch(() => undefined);
          return result;
        },
      },
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'locks');
    randomUuid.mockRestore();
  });

  it('shares a guid-less match id across browser contexts', async () => {
    const first = reducerState();
    const second = reducerState();

    const [firstResult, secondResult] = await Promise.all([
      new BrowserMatchReducer().reduce(
        first.read,
        matchCreated,
        first.commit,
        '2026-08-14T00:00:00.000Z',
      ),
      new BrowserMatchReducer().reduce(
        second.read,
        matchCreated,
        second.commit,
        '2026-08-14T00:00:00.010Z',
      ),
    ]);

    expect(secondResult.result.current.id).toBe(firstResult.result.current.id);
    expect(randomUuid).toHaveBeenCalledOnce();
  });

  it('allocates one new shared id for the next guid-less match', async () => {
    const first = reducerState();
    const second = reducerState();
    const firstReducer = new BrowserMatchReducer();
    const secondReducer = new BrowserMatchReducer();
    const original = await firstReducer.reduce(
      first.read,
      matchCreated,
      first.commit,
      '2026-08-14T00:00:00.000Z',
    );
    await secondReducer.reduce(
      second.read,
      matchCreated,
      second.commit,
      '2026-08-14T00:00:00.010Z',
    );
    for (const [reducer, state] of [
      [firstReducer, first],
      [secondReducer, second],
    ] as const)
      await reducer.reduce(
        state.read,
        { event: 'MatchEnded', data: {} },
        state.commit,
        '2026-08-14T00:05:00.000Z',
      );

    const nextFirst = await firstReducer.reduce(
      first.read,
      matchCreated,
      first.commit,
      '2026-08-14T00:06:00.000Z',
    );
    const nextSecond = await secondReducer.reduce(
      second.read,
      matchCreated,
      second.commit,
      '2026-08-14T00:06:00.010Z',
    );

    expect(nextFirst.result.current.id).not.toBe(original.result.current.id);
    expect(nextSecond.result.current.id).toBe(nextFirst.result.current.id);
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it('keeps a supplied match guid authoritative', async () => {
    const state = reducerState();
    const result = await new BrowserMatchReducer().reduce(
      state.read,
      { event: 'MatchCreated', data: { MatchGuid: 'authoritative-guid' } },
      state.commit,
    );

    expect(result.result.current.id).toBe('authoritative-guid');
  });

  it('does not reuse a stale live identity for a new browser visit', async () => {
    const first = reducerState();
    const original = await new BrowserMatchReducer().reduce(
      first.read,
      matchCreated,
      first.commit,
      '2026-08-14T00:00:00.000Z',
    );
    const later = reducerState();
    const restarted = await new BrowserMatchReducer().reduce(
      later.read,
      matchCreated,
      later.commit,
      '2026-08-14T00:16:00.000Z',
    );

    expect(restarted.result.current.id).not.toBe(original.result.current.id);
    expect(randomUuid).toHaveBeenCalledTimes(2);
  });

  it('does not let a lagging tab reopen a completed shared identity', async () => {
    const first = reducerState();
    const lagging = reducerState();
    const firstReducer = new BrowserMatchReducer();
    const laggingReducer = new BrowserMatchReducer();
    const original = await firstReducer.reduce(
      first.read,
      matchCreated,
      first.commit,
      '2026-08-14T00:00:00.000Z',
    );
    await laggingReducer.reduce(
      lagging.read,
      matchCreated,
      lagging.commit,
      '2026-08-14T00:00:00.010Z',
    );
    await firstReducer.reduce(
      first.read,
      { event: 'MatchEnded', data: {} },
      first.commit,
      '2026-08-14T00:05:00.000Z',
    );
    await laggingReducer.reduce(
      lagging.read,
      { event: 'UpdateState', data: {} },
      lagging.commit,
      '2026-08-14T00:05:00.010Z',
    );

    const restarted = reducerState();
    const next = await new BrowserMatchReducer().reduce(
      restarted.read,
      matchCreated,
      restarted.commit,
      '2026-08-14T00:05:01.000Z',
    );

    expect(next.result.current.id).not.toBe(original.result.current.id);
  });
});
