import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MatchAnalytics } from '../src/components/MatchAnalytics';
import type { FennecSettings, MatchState } from '../src/domain/types';

const touchMap = vi.hoisted(() => ({
  onReady: undefined as (() => void) | undefined,
}));

vi.mock('../src/components/BallTouchMap', () => ({
  default: ({ onReady }: { onReady?(): void }) => {
    touchMap.onReady = onReady;
    return <div role="img" aria-label="Mock 3D ball touch map" />;
  },
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
  initialView = 'analytics',
}: {
  save?(next: FennecSettings['matchAnalyticsView']): Promise<void>;
  speedUnit?: FennecSettings['speedUnit'];
  value?: MatchState;
  initialView?: FennecSettings['matchAnalyticsView'];
}) {
  const [view, setView] =
    useState<FennecSettings['matchAnalyticsView']>(initialView);
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
    ['kmh', '109 km/h', '+36 km/h', '36 km/h'],
    ['mph', '68 mph', '+22 mph', '22 mph'],
  ] as const)(
    'formats event and snapshot telemetry in %s',
    (speedUnit, maximum, gain, observed) => {
      render(
        <Harness
          speedUnit={speedUnit}
          value={{
            ...match,
            capture: {
              version: 1,
              updateStatePackets: 1,
              activePlayPackets: 1,
              ballSpeed: { samples: 1, sum: 10, max: 10 },
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
                  Players: [
                    { Name: 'You', PrimaryId: 'Steam|1|0', TeamNum: 0 },
                  ],
                  Ball: {
                    PreHitSpeed: 72.8,
                    PostHitSpeed: 108.9,
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
      expect(
        screen.getByText('Observed ball speed').nextElementSibling,
      ).toHaveTextContent(observed);
    },
  );

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

  it('covers the touch map until its first scene is ready', async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole('tab', { name: 'Touch map' }));
    await screen.findByRole('img', { name: /3d ball touch map/i });

    const content = screen.getByTestId('ball-touch-map-content');
    const overlay = screen.getByTestId('ball-touch-map-loading-overlay');
    expect(content).toHaveAttribute('inert');
    expect(overlay).toHaveAccessibleName('Loading 3D touch map');

    act(() => touchMap.onReady?.());
    expect(overlay).toHaveAccessibleName('Opening 3D touch map');
    expect(overlay).toHaveClass('fennec-loading-overlay--cinematic');

    fireEvent.animationEnd(overlay);
    expect(
      screen.queryByTestId('ball-touch-map-loading-overlay'),
    ).not.toBeInTheDocument();
    expect(content).not.toHaveAttribute('inert');
  });

  it('offers pressure as a separate view when spatial telemetry is eligible', async () => {
    render(
      <Harness
        value={{
          ...match,
          teams: [
            { teamNumber: 0, name: 'Blue', score: 0, colorPrimary: '' },
            { teamNumber: 1, name: 'Orange', score: 0, colorPrimary: '' },
          ],
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
              id: 'analytics:pressure',
              matchId: 'analytics',
              sequence: 1,
              eventName: 'BallHit',
              receivedAt: '2026-08-08T00:01:00Z',
              payload: {
                Players: [{ Name: 'You', TeamNum: 0 }],
                Ball: { Location: { X: 0, Y: 4000, Z: 100 } },
              },
            },
          ],
        }}
      />,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Pressure' }));
    expect(
      await screen.findByRole('heading', { name: 'Pressure' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Blue' }).parentElement,
    ).toHaveTextContent('Pressure touches1');
    expect(
      screen.getByRole('table', {
        name: 'Pressure and territory contribution by player',
      }),
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

  it('silently falls back without exposing pressure for ineligible matches', () => {
    render(<Harness initialView="pressure" />);

    expect(
      screen.getByRole('heading', { name: 'Ball analytics' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: 'Pressure' }),
    ).not.toBeInTheDocument();
  });
});
