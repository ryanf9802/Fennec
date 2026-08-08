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
}: {
  save?(next: FennecSettings['matchAnalyticsView']): Promise<void>;
}) {
  const [view, setView] =
    useState<FennecSettings['matchAnalyticsView']>('analytics');
  return (
    <MatchAnalytics
      match={match}
      view={view}
      onViewChange={async (next) => {
        await save(next);
        setView(next);
      }}
    />
  );
}

describe('match analytics view switch', () => {
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
