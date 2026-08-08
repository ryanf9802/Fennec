import { render, screen } from '@testing-library/react';
import { MetricsGrid } from '../src/components/MetricsGrid';
import type { SessionMetrics } from '../src/domain/types';

const metrics: SessionMetrics = {
  record: '1–0',
  winRate: '100%',
  games: 1,
  streak: 'W1',
  goalDifference: 1,
  goalsFor: 3,
  goalsAgainst: 2,
  goals: 1,
  assists: 1,
  passes: 3,
  saves: 1,
  shots: 2,
  shootingPercentage: 50,
  averageScore: 500,
  demos: 0,
  touches: 20,
};

describe('MetricsGrid goal comparison label', () => {
  it('shows the full label by default for session detail', () => {
    render(<MetricsGrid metrics={metrics} />);

    expect(screen.getByText('Goals for / against')).toBeInTheDocument();
    expect(screen.getByText('Passes').parentElement).toHaveTextContent(
      'Passes3',
    );
    expect(screen.queryByText('GFA')).not.toBeInTheDocument();
  });

  it('shows the abbreviated label when requested by the dashboard', () => {
    render(<MetricsGrid metrics={metrics} abbreviateGoalsForAgainst />);

    expect(screen.getByText('GFA')).toBeInTheDocument();
    expect(screen.queryByText('Goals for / against')).not.toBeInTheDocument();
  });
});
