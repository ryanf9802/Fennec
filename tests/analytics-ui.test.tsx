import { fireEvent, render, screen } from '@testing-library/react';
import { BallTouchMap } from '../src/components/BallTouchMap';
import type { MatchState } from '../src/domain/types';

const match: MatchState = {
  id: 'map',
  lifecycle: 'completed',
  startedAt: '2026-08-08T00:00:00Z',
  lastEventAt: '2026-08-08T00:05:00Z',
  endedAt: '2026-08-08T00:05:00Z',
  playlistId: 11,
  playlistName: 'Ranked Doubles',
  playlistCategory: 'ranked',
  arena: 'Stadium_P',
  timeSeconds: 0,
  isOvertime: false,
  isReplay: false,
  teams: [],
  participants: [
    {
      name: 'Me',
      primaryId: 'Steam|1|0',
      shortcut: 1,
      teamNumber: 0,
      score: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      shots: 0,
      touches: 1,
      demos: 0,
    },
    {
      name: 'Them',
      primaryId: 'Epic|2|0',
      shortcut: 2,
      teamNumber: 1,
      score: 0,
      goals: 0,
      assists: 0,
      saves: 0,
      shots: 0,
      touches: 1,
      demos: 0,
    },
  ],
  events: [
    {
      id: 'map:1',
      matchId: 'map',
      sequence: 1,
      eventName: 'BallHit',
      receivedAt: '2026-08-08T00:01:00Z',
      matchClockSeconds: 240,
      payload: {
        Players: [{ Name: 'Me', Shortcut: 1, TeamNum: 0 }],
        Ball: {
          PreHitSpeed: 300,
          PostHitSpeed: 900,
          Location: { X: 10, Y: 20, Z: 30 },
        },
      },
    },
    {
      id: 'map:2',
      matchId: 'map',
      sequence: 2,
      eventName: 'BallHit',
      receivedAt: '2026-08-08T00:02:00Z',
      matchClockSeconds: 180,
      payload: {
        Players: [{ Name: 'Them', Shortcut: 2, TeamNum: 1 }],
        Ball: {
          PreHitSpeed: 500,
          PostHitSpeed: 800,
          Location: { X: 40, Y: 50, Z: 60 },
        },
      },
    },
  ],
};

describe('ball touch map', () => {
  it('defaults to the selected player and supports all-touch filtering', () => {
    render(<BallTouchMap match={match} profileId="Steam|1|0" />);
    const map = screen.getByRole('img', { name: /soccar ball touch map/i });
    expect(map).toBeInTheDocument();
    expect(
      map.querySelector('line[x1="300"][y1="8"][x2="300"][y2="292"]'),
    ).toBeInTheDocument();
    expect(
      map.querySelector('rect[x="8"][y="95"][width="28"][height="110"]'),
    ).toBeInTheDocument();
    expect(
      map.querySelector('rect[x="564"][y="95"][width="28"][height="110"]'),
    ).toBeInTheDocument();

    const selectedTouch = screen.getByRole('button', { name: /Me, touch/ });
    const marker = selectedTouch.querySelector('circle');
    expect(Number(marker?.getAttribute('cx'))).toBeCloseTo(301.09, 1);
    expect(Number(marker?.getAttribute('cy'))).toBeCloseTo(149.66, 1);
    expect(selectedTouch).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Them, touch/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(
      screen.getByRole('button', { name: /Them, touch/ }),
    ).toBeInTheDocument();
  });
});
