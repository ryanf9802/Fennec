import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MatchAnalytics } from '../src/components/MatchAnalytics';
import type { FennecSettings, MatchState } from '../src/domain/types';

vi.mock('../src/components/BallTouchMap', () => ({
  default: () => <div role="img" aria-label="Mock 3D ball touch map" />,
}));

const match: MatchState = {
  id: 'analytics',
  lifecycle: 'completed',
  startedAt: '2026-08-08T00:00:00Z',
  lastEventAt: '2026-08-08T00:05:00Z',
  endedAt: '2026-08-08T00:05:00Z',
  playlistId: 11,
  playlistName: 'Ranked Doubles',
  playlistCategory: 'ranked',
  arena: 'DFH Stadium',
  timeSeconds: 0,
  isOvertime: false,
  isReplay: false,
  teams: [],
  participants: [],
  events: [],
};

function Harness({
  save = async () => undefined,
  speedUnit = 'kmh',
  value = match,
}: {
  save?(next: FennecSettings['matchAnalyticsView']): Promise<void>;
  speedUnit?: FennecSettings['speedUnit'];
  value?: MatchState;
}) {
  const [view, setView] =
    useState<FennecSettings['matchAnalyticsView']>('analytics');
  return (
    <MatchAnalytics
      match={value}
      profileId="Steam|1|0"
      speedUnit={speedUnit}
      view={view}
      onViewChange={async (next) => {
        await save(next);
        setView(next);
      }}
    />
  );
}

describe('match analytics view switch', () => {
  it.each([
    ['kmh', '36 km/h', '+22 km/h'],
    ['mph', '22 mph', '+13 mph'],
  ] as const)('formats telemetry in %s', (speedUnit, maximum, gain) => {
    render(
      <Harness
        speedUnit={speedUnit}
        value={{
          ...match,
          capture: {
            version: 1,
            updateStatePackets: 1,
            activePlayPackets: 1,
            ballSpeed: { samples: 1, sum: 1000, max: 1000 },
            lastTouchSamplesByTeam: {},
          },
          participants: [
            {
              name: 'You',
              primaryId: 'Steam|1|0',
              teamNumber: 0,
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
              id: 'analytics:1',
              matchId: 'analytics',
              sequence: 1,
              eventName: 'BallHit',
              receivedAt: '2026-08-09T00:01:00Z',
              payload: {
                Players: [{ Name: 'You', PrimaryId: 'Steam|1|0', TeamNum: 0 }],
                Ball: {
                  PreHitSpeed: 400,
                  PostHitSpeed: 1000,
                  Location: { X: 0, Y: 0, Z: 0 },
                },
              },
            },
          ],
        }}
      />,
    );

    expect(
      screen.getByText('Fastest hit').nextElementSibling,
    ).toHaveTextContent(maximum);
    expect(
      screen.getByText('Average speed gain').nextElementSibling,
    ).toHaveTextContent(gain);
  });

  it('mounts only the selected view and retains the controlled preference', async () => {
    render(<Harness />);

    expect(
      screen.getByRole('heading', { name: 'Ball analytics' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Touch map' }));
    expect(
      await screen.findByRole('heading', { name: 'Ball touch map' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('img', { name: /3d ball touch map/i }),
    ).toBeInTheDocument();
  });

  it('keeps the previous view when persistence fails', async () => {
    render(
      <Harness save={() => Promise.reject(new Error('storage unavailable'))} />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Touch map' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save telemetry view: storage unavailable',
    );
    expect(
      screen.getByRole('heading', { name: 'Ball analytics' }),
    ).toBeInTheDocument();
  });
});
