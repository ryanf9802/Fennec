import { fireEvent, render, screen } from '@testing-library/react';
import { BallTouchMap } from '../src/components/BallTouchMap';
import type { BallTouchSceneProps } from '../src/components/BallTouchScene';
import type { MatchState } from '../src/domain/types';

const scene = vi.hoisted(() => ({
  props: undefined as BallTouchSceneProps | undefined,
  fail: false,
}));

vi.mock('../src/components/BallTouchScene', () => ({
  BallTouchScene: (props: BallTouchSceneProps) => {
    if (scene.fail) throw new Error('WebGL unavailable');
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
          PreHitSpeed: 72.8,
          PostHitSpeed: 108.9,
          Location: { X: 10, Y: 20, Z: 30 },
        },
      },
    },
    {
      id: 'map:4',
      matchId: 'map',
      sequence: 4,
      eventName: 'StatfeedEvent',
      receivedAt: '2026-08-08T00:01:00.100Z',
      matchClockSeconds: 240,
      elapsedSeconds: 60.1,
      payload: {
        EventName: 'EpicSave',
        Type: 'Epic Save',
        MainTarget: { Name: 'Me', Shortcut: 1, TeamNum: 0 },
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
        BallSpeed: 7,
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
          PreHitSpeed: 50,
          PostHitSpeed: 80,
          Location: { X: 40, Y: 50, Z: 60 },
        },
      },
    },
  ],
};

describe('ball touch map', () => {
  afterEach(() => {
    scene.fail = false;
    vi.restoreAllMocks();
  });

  it('settles the loader when the 3D scene fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onReady = vi.fn();
    scene.fail = true;

    render(
      <BallTouchMap
        match={match}
        profileId="Steam|1|0"
        speedUnit="kmh"
        onReady={onReady}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'The 3D touch map is unavailable in this browser',
    );
    expect(onReady).toHaveBeenCalledOnce();
  });

  it('uses extra-mode profiles and corrected goal locations', () => {
    render(
      <BallTouchMap
        match={{
          ...match,
          playlistId: 6,
          playlistName: 'Private Match',
          playlistCategory: 'private',
          arena: 'HoopsStadium_P',
          events: [
            ...match.events,
            {
              id: 'map:4',
              matchId: 'map',
              sequence: 4,
              eventName: 'GoalScored',
              receivedAt: '2026-08-08T00:04:00Z',
              matchClockSeconds: 60,
              elapsedSeconds: 240,
              payload: {
                MatchGuid: 'hoops-match',
                Scorer: { Name: 'Me', Shortcut: 1, TeamNum: 0 },
                GoalSpeed: 58.968,
                GoalTime: 30,
                ImpactLocation: { X: -2423, Y: 1013, Z: -219 },
              },
            },
            {
              id: 'map:5',
              matchId: 'map',
              sequence: 5,
              eventName: 'GoalReplayStart',
              receivedAt: '2026-08-08T00:04:00Z',
              matchClockSeconds: 60,
              elapsedSeconds: 240,
              payload: { MatchGuid: 'hoops-match' },
            },
            {
              id: 'map:6',
              matchId: 'map',
              sequence: 6,
              eventName: 'GoalScored',
              receivedAt: '2026-08-08T00:04:00Z',
              matchClockSeconds: 60,
              elapsedSeconds: 240,
              payload: {
                MatchGuid: 'hoops-match',
                Scorer: { Name: '', Shortcut: 0, TeamNum: 0 },
                GoalSpeed: 0,
                GoalTime: 0,
                ImpactLocation: { X: 462, Y: 2578, Z: 241 },
              },
            },
          ],
        }}
        profileId="Steam|1|0"
        speedUnit="kmh"
      />,
    );

    expect(scene.props?.profile).toMatchObject({
      kind: 'hoops',
      hoop: { centerY: 2969, height: 364, radius: 655, tubeRadius: 21 },
    });
    expect(
      scene.props?.points.find((point) => point.kind === 'goal'),
    ).toMatchObject({
      id: 'map:4',
      sourceEventIds: ['map:4', 'map:6'],
      x: 462,
      y: 2578,
      z: 241,
    });
  });

  it('passes normalized custom team palettes into the 3D scene', () => {
    render(
      <BallTouchMap
        match={{
          ...match,
          teams: [
            {
              teamNumber: 0,
              name: 'Neon Foxes',
              score: 2,
              colorPrimary: '65D9EE',
              colorSecondary: '2563EB',
            },
            {
              teamNumber: 1,
              name: 'Solar Flare',
              score: 1,
              colorPrimary: 'FACC15',
              colorSecondary: 'EF4444',
            },
          ],
        }}
        profileId="Steam|1|0"
        speedUnit="kmh"
      />,
    );

    expect(scene.props?.teams).toEqual([
      {
        teamNumber: 0,
        name: 'Neon Foxes',
        primaryColor: '#65d9ee',
        secondaryColor: '#2563eb',
      },
      {
        teamNumber: 1,
        name: 'Solar Flare',
        primaryColor: '#facc15',
        secondaryColor: '#ef4444',
      },
    ]);
    expect(scene.props?.goalLabels).toEqual([
      {
        teamNumber: 0,
        label: 'Your goal',
        teamName: 'Neon Foxes',
        primaryColor: '#65d9ee',
        secondaryColor: '#2563eb',
      },
      {
        teamNumber: 1,
        label: 'Opponent goal',
        teamName: 'Solar Flare',
        primaryColor: '#facc15',
        secondaryColor: '#ef4444',
      },
    ]);
  });

  it('defaults to the selected player and supports all-touch filtering', () => {
    render(
      <BallTouchMap match={match} profileId="Steam|1|0" speedUnit="kmh" />,
    );
    const map = screen.getByRole('img', { name: /soccar 3d ball touch map/i });
    expect(map).toBeInTheDocument();
    expect(scene.props?.profile.goal).toEqual({
      halfWidth: 892.755,
      height: 642.775,
      depth: 880,
    });
    expect(scene.props?.points.map((point) => point.kind)).toEqual(['touch']);
    const hint = screen.getByText(
      'Left drag to pan · right drag to rotate · scroll or pinch to zoom',
    );
    expect(screen.getByTestId('ball-touch-map-viewport')).toContainElement(
      hint,
    );
    expect(scene.props?.cameraState.yaw).toBe(0);
    expect(scene.props?.orientationYaw).toBe(0);
    expect(scene.props?.goalLabels).toEqual([
      {
        teamNumber: 0,
        label: 'Your goal',
        teamName: 'Blue',
        primaryColor: '#36d7ff',
        secondaryColor: '#2563eb',
      },
      {
        teamNumber: 1,
        label: 'Opponent goal',
        teamName: 'Orange',
        primaryColor: '#ff8a3d',
        secondaryColor: '#c2410c',
      },
    ]);
    for (const keyLabel of [
      '● Blue touch',
      '● Orange touch',
      '● Goal event',
      '■ Blue goal',
      '■ Orange goal',
    ])
      expect(screen.queryByText(keyLabel)).not.toBeInTheDocument();

    const selectedTouch = screen.getByRole('button', { name: /Me · Save/ });
    expect(selectedTouch).toHaveAccessibleName(/Save, at 1:00/);
    expect(selectedTouch).toHaveAccessibleName(/109 km\/h/);
    expect(selectedTouch).toBeInTheDocument();
    fireEvent.focus(selectedTouch);
    expect(scene.props?.emphasizedIds).toEqual(['map:1']);
    expect(scene.props?.points.map((point) => point.id)).not.toContain('map:2');
    fireEvent.blur(selectedTouch);
    expect(
      screen.queryByRole('button', { name: /Them · touch/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(
      screen.getByRole('button', { name: /Them · touch/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Them · touch/ }),
    ).toHaveAccessibleName(/touch, at 2:00/);
    fireEvent.focus(screen.getByRole('button', { name: /Them · touch/ }));
    expect(scene.props?.emphasizedIds).toEqual(['map:2']);
    expect(scene.props?.points.map((point) => point.kind)).toEqual([
      'touch',
      'touch',
    ]);
    expect(
      screen.queryByRole('button', { name: /crossbar/i }),
    ).not.toBeInTheDocument();

    const pitch = screen.getByRole('slider', { name: 'Field pitch' });
    const rotation = screen.getByRole('slider', { name: 'Field rotation' });
    expect(pitch).toHaveValue('0');
    expect(rotation).toHaveValue('0');
    fireEvent.change(pitch, { target: { value: '45' } });
    fireEvent.change(rotation, { target: { value: '90' } });
    expect(scene.props?.cameraState.pitch).toBe(45);
    expect(scene.props?.cameraState.yaw).toBe(90);
    fireEvent.click(
      screen.getByRole('button', { name: /reset 3d touch map/i }),
    );
    expect(scene.props?.cameraState.pitch).toBe(0);
    expect(scene.props?.cameraState.yaw).toBe(0);
  });

  it('identifies scored goals by their match-wide sequence number', () => {
    const goalMatch: MatchState = {
      ...match,
      events: [
        ...match.events,
        {
          id: 'map:5',
          matchId: 'map',
          sequence: 5,
          eventName: 'GoalScored',
          receivedAt: '2026-08-08T00:04:00Z',
          matchClockSeconds: 60,
          elapsedSeconds: 240,
          payload: {
            Scorer: { Name: 'Them', Shortcut: 2, TeamNum: 1 },
            GoalSpeed: 120,
            ImpactLocation: { X: 200, Y: 5000, Z: 500 },
          },
        },
        {
          id: 'map:4',
          matchId: 'map',
          sequence: 4,
          eventName: 'GoalScored',
          receivedAt: '2026-08-08T00:03:30Z',
          matchClockSeconds: 90,
          elapsedSeconds: 210,
          payload: {
            Scorer: { Name: 'Me', Shortcut: 1, TeamNum: 0 },
            GoalSpeed: 110,
            ImpactLocation: { X: -200, Y: -5000, Z: 450 },
          },
        },
      ],
    };
    render(<BallTouchMap match={goalMatch} speedUnit="kmh" />);

    expect(
      scene.props?.points.filter((point) => point.kind === 'goal'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'map:4', goalNumber: 1 }),
        expect.objectContaining({ id: 'map:5', goalNumber: 2 }),
      ]),
    );
    const secondGoal = screen.getByRole('button', {
      name: /Them · Goal #2 scored, at 4:00, 120 km\/h/,
    });
    fireEvent.focus(secondGoal);
    expect(screen.getByText('Them · Goal #2 scored')).toBeInTheDocument();
    expect(screen.getByText(/4:00 · XYZ 200, 5000, 500/)).toBeInTheDocument();
    expect(scene.props?.emphasizedIds).toEqual(['map:5']);
  });

  it('converts BallHit and GoalSpeed values from their km/h scale', () => {
    render(
      <BallTouchMap
        match={{
          ...match,
          events: [
            match.events[0]!,
            {
              id: 'map:5',
              matchId: 'map',
              sequence: 5,
              eventName: 'GoalScored',
              receivedAt: '2026-08-08T00:04:00Z',
              matchClockSeconds: 60,
              elapsedSeconds: 240,
              payload: {
                Scorer: { Name: 'Them', Shortcut: 2, TeamNum: 1 },
                GoalSpeed: 100,
                ImpactLocation: { X: 200, Y: 5000, Z: 500 },
              },
            },
          ],
        }}
        speedUnit="mph"
      />,
    );

    expect(
      screen.getByRole('button', { name: /Me · touch/ }),
    ).toHaveAccessibleName(/68 mph/);
    expect(
      screen.getByRole('button', { name: /Them · Goal #1 scored/ }),
    ).toHaveAccessibleName(/62 mph/);
  });

  it('orients the selected orange team goal on the left', () => {
    render(
      <BallTouchMap
        match={{
          ...match,
          participants: match.participants.map((participant) => ({
            ...participant,
            teamNumber: participant.name === 'Me' ? 1 : 0,
          })),
        }}
        profileId="Steam|1|0"
        speedUnit="kmh"
      />,
    );

    expect(scene.props?.cameraState.yaw).toBe(0);
    expect(scene.props?.orientationYaw).toBe(180);
    expect(scene.props?.goalLabels).toEqual([
      {
        teamNumber: 1,
        label: 'Your goal',
        teamName: 'Orange',
        primaryColor: '#ff8a3d',
        secondaryColor: '#c2410c',
      },
      {
        teamNumber: 0,
        label: 'Opponent goal',
        teamName: 'Blue',
        primaryColor: '#36d7ff',
        secondaryColor: '#2563eb',
      },
    ]);
  });

  it('combines a scoring 50 and reveals its filtered goal association', () => {
    const fiftyMatch: MatchState = {
      ...match,
      events: [
        {
          id: 'map:10',
          matchId: 'map',
          sequence: 10,
          eventName: 'BallHit',
          receivedAt: '2026-08-08T00:01:00.000Z',
          elapsedSeconds: 60,
          payload: {
            Players: [{ Name: 'Me', Shortcut: 1, TeamNum: 0 }],
            Ball: {
              PostHitSpeed: 80,
              Location: { X: 10, Y: 20, Z: 30 },
            },
          },
        },
        {
          id: 'map:11',
          matchId: 'map',
          sequence: 11,
          eventName: 'BallHit',
          receivedAt: '2026-08-08T00:01:00.200Z',
          elapsedSeconds: 60.2,
          payload: {
            Players: [{ Name: 'Them', Shortcut: 2, TeamNum: 1 }],
            Ball: {
              PreHitSpeed: 80,
              PostHitSpeed: 120,
              Location: { X: 40, Y: 50, Z: 60 },
            },
          },
        },
        {
          id: 'map:12',
          matchId: 'map',
          sequence: 12,
          eventName: 'GoalScored',
          receivedAt: '2026-08-08T00:01:01.000Z',
          elapsedSeconds: 61,
          payload: {
            Scorer: { Name: 'Them', Shortcut: 2, TeamNum: 1 },
            GoalSpeed: 120,
            ImpactLocation: { X: 100, Y: 5000, Z: 400 },
          },
        },
      ],
    };
    render(
      <BallTouchMap match={fiftyMatch} profileId="Steam|1|0" speedUnit="kmh" />,
    );

    const fifty = screen.getByRole('button', {
      name: /Me vs Them · 50\/50 · Goal #1 scoring touch/,
    });
    expect(screen.queryByRole('button', { name: /Goal #1 scored/ })).toBeNull();
    fireEvent.focus(fifty);
    expect(
      screen.getByRole('button', { name: /Them · Goal #1 scored/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Me vs Them · 50/50 · Goal #1 scoring touch'),
    ).toBeInTheDocument();
    expect(scene.props?.emphasizedIds).toEqual(['fifty:map:11', 'map:12']);
    expect(scene.props?.points.map((point) => point.kind)).toEqual([
      'fifty',
      'goal',
    ]);
    fireEvent.focus(
      screen.getByRole('button', { name: /Them · Goal #1 scored/ }),
    );
    expect(scene.props?.emphasizedIds).toEqual(['map:12', 'fifty:map:11']);
  });
});
