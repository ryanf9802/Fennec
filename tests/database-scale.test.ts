import { db, historyRepository, replaceAll } from '../src/data/database';
import {
  defaultSettings,
  type MatchState,
  type ParticipantState,
} from '../src/domain/types';

const you: ParticipantState = {
  name: 'You',
  primaryId: 'Steam|scale-you|0',
  teamNumber: 0,
  score: 100,
  goals: 0,
  assists: 0,
  passes: 0,
  fifties: 0,
  saves: 0,
  shots: 1,
  touches: 10,
  demos: 0,
};
const other: ParticipantState = {
  name: 'Rival',
  primaryId: 'Epic|scale-rival|0',
  teamNumber: 1,
  score: 100,
  goals: 0,
  assists: 0,
  passes: 0,
  fifties: 0,
  saves: 0,
  shots: 1,
  touches: 10,
  demos: 0,
};

function match(index: number): MatchState {
  const startedAt = new Date(
    Date.UTC(2020, 0, 1) + index * 600_000,
  ).toISOString();
  return {
    id: `scale-${String(index).padStart(5, '0')}`,
    lifecycle: 'completed',
    startedAt,
    lastEventAt: startedAt,
    endedAt: startedAt,
    playlistId: 11,
    playlistName: 'Ranked Doubles',
    playlistCategory: 'ranked',
    arena: '',
    timeSeconds: 0,
    isOvertime: false,
    isReplay: false,
    winnerTeamNumber: index % 2,
    teams: [
      {
        teamNumber: 0,
        name: 'Blue',
        score: index % 2 ? 1 : 2,
        colorPrimary: '',
      },
      {
        teamNumber: 1,
        name: 'Orange',
        score: index % 2 ? 2 : 1,
        colorPrimary: '',
      },
    ],
    participants: [you, other],
    events: [],
  };
}

describe('25,000-match local archive', () => {
  beforeAll(async () => {
    await db.delete();
    await db.open();
  });
  afterAll(async () => {
    await db.delete();
  });

  // The aggregate web gate runs this archive fixture alongside browser work.
  it('returns a bounded player page and constant-size all-time summary', async () => {
    await replaceAll(
      Array.from({ length: 25_000 }, (_, index) => match(index)),
      defaultSettings,
    );
    await historyRepository.initialize();
    expect(await historyRepository.countMatches()).toBe(25_000);

    const first = await historyRepository.getPlayerHistory(
      'id:Steam|scale-you|0',
      'id:Epic|scale-rival|0',
      { limit: 50 },
    );
    expect(first.summary).toMatchObject({
      gamesOpposed: 25_000,
      winsAgainst: 12_500,
      lossesAgainst: 12_500,
    });
    expect(first.matches.items).toHaveLength(50);
    expect(first.matches.nextCursor).toBeTruthy();

    const second = await historyRepository.getPlayerHistory(
      'id:Steam|scale-you|0',
      'id:Epic|scale-rival|0',
      { limit: 50, cursor: first.matches.nextCursor },
    );
    expect(second.matches.items).toHaveLength(50);
    expect(
      new Set(
        [...first.matches.items, ...second.matches.items].map(
          (item) => item.id,
        ),
      ).size,
    ).toBe(100);
  }, 120_000);
});
