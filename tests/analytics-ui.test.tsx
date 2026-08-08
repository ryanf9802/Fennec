import { fireEvent, render, screen } from '@testing-library/react';
import { BallTouchMap } from '../src/components/BallTouchMap';
import type { BallTouchSceneProps } from '../src/components/BallTouchScene';
import type { MatchState } from '../src/domain/types';

const scene = vi.hoisted(() => ({
  props: undefined as BallTouchSceneProps | undefined,
}));

vi.mock('../src/components/BallTouchScene', () => ({
  BallTouchScene: (props: BallTouchSceneProps) => {
    scene.props = props;
    return (
      <div role="img" aria-label={`${props.profile.label} 3D ball touch map`} />
    );
  },
}));

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
  regulationDurationSeconds: 300,
  elapsedSeconds: 300,
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
      passes: 1,
      fifties: 1,
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
      passes: 0,
      fifties: 0,
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
      elapsedSeconds: 60,
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
      id: 'map:3',
      matchId: 'map',
      sequence: 3,
      eventName: 'CrossbarHit',
      receivedAt: '2026-08-08T00:03:00Z',
      matchClockSeconds: 120,
      elapsedSeconds: 180,
      payload: {
        BallLocation: { X: 100, Y: 5000, Z: 600 },
        BallSpeed: 700,
        BallLastTouch: {
          Player: { Name: 'Them', Shortcut: 2, TeamNum: 1 },
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
      elapsedSeconds: 120,
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
    const map = screen.getByRole('img', { name: /soccar 3d ball touch map/i });
    expect(map).toBeInTheDocument();
    expect(scene.props?.profile.goal).toEqual({
      halfWidth: 892.755,
      height: 642.775,
      depth: 880,
    });
    expect(scene.props?.points.map((point) => point.kind)).toEqual(['touch']);
    expect(screen.getByText('■ Blue goal')).toHaveClass('text-fennec-cyan');
    expect(screen.getByText('■ Orange goal')).toHaveClass('text-fennec-orange');

    const selectedTouch = screen.getByRole('button', { name: /Me, touch/ });
    expect(selectedTouch).toHaveAccessibleName(/touch at 1:00/);
    expect(selectedTouch).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Them, touch/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(
      screen.getByRole('button', { name: /Them, touch/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Them, touch/ }),
    ).toHaveAccessibleName(/touch at 2:00/);
    expect(scene.props?.points.map((point) => point.kind)).toEqual([
      'touch',
      'touch',
    ]);
    expect(
      screen.queryByRole('button', { name: /crossbar/i }),
    ).not.toBeInTheDocument();

    const pitch = screen.getByRole('slider', { name: 'Field pitch' });
    expect(pitch).toHaveValue('0');
    fireEvent.change(pitch, { target: { value: '45' } });
    expect(scene.props?.cameraState.pitch).toBe(45);
    fireEvent.click(
      screen.getByRole('button', { name: /reset 3d touch map/i }),
    );
    expect(scene.props?.cameraState.pitch).toBe(0);
  });

  it('labels Hoops goals by team color', () => {
    render(
      <BallTouchMap
        match={{ ...match, playlistId: 27, arena: 'Dunk House' }}
        profileId="Steam|1|0"
      />,
    );

    expect(scene.props?.profile.kind).toBe('hoops');
    expect(screen.getByText('■ Blue goal')).toHaveClass('text-fennec-cyan');
    expect(screen.getByText('■ Orange goal')).toHaveClass('text-fennec-orange');
  });
});
