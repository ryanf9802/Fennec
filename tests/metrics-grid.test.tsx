import { render, screen } from '@testing-library/react';
import {
  SessionDetailStats,
  SessionSummaryStats,
} from '../src/components/SessionStats';
import type { SessionMetrics } from '../src/domain/types';

const metrics: SessionMetrics = {
  resultDifference: 1,
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
  fifties: 2,
  saves: 1,
  shots: 2,
  shootingPercentage: 50,
  averageScore: 500,
  demos: 0,
  touches: 20,
  territorialImpact: {
    eligibleMatches: 1,
    teamFieldPressure: 0.6,
    playerPressureContribution: 0.5,
    averageNetTerritoryPercent: 12.34,
  },
};

describe('session stats', () => {
  it('shows only the five prioritized values in the summary', () => {
    render(<SessionSummaryStats metrics={metrics} />);

    expect(screen.getByText('W/L diff').parentElement).toHaveTextContent(
      'W/L diff+1',
    );
    expect(screen.getByText('Record').parentElement).toHaveTextContent(
      'Record1–0',
    );
    expect(screen.getByText('Games').parentElement).toHaveTextContent('Games1');
    expect(screen.getByText('Goal diff').parentElement).toHaveTextContent(
      'Goal diff+1',
    );
    expect(screen.getByText('Avg score').parentElement).toHaveTextContent(
      'Avg score500',
    );
    expect(screen.queryByText('Win rate')).not.toBeInTheDocument();
  });

  it('keeps negative and even differences explicit', () => {
    render(
      <SessionSummaryStats
        metrics={{ ...metrics, resultDifference: -1, goalDifference: 0 }}
      />,
    );

    expect(screen.getByText('W/L diff').parentElement).toHaveTextContent(
      'W/L diff-1',
    );
    expect(screen.getByText('Goal diff').parentElement).toHaveTextContent(
      'Goal diff0',
    );
  });

  it('groups every remaining metric without repeating summary values', () => {
    render(<SessionDetailStats metrics={metrics} />);

    expect(
      screen.getByRole('region', { name: 'Session performance details' }),
    ).toBeInTheDocument();
    for (const heading of ['Outcome', 'Offense', 'Involvement', 'Pressure'])
      expect(
        screen.getByRole('heading', { name: heading }),
      ).toBeInTheDocument();
    for (const label of [
      'Win rate',
      'Streak',
      'Goals for / against',
      'Goals',
      'Assists',
      'Shots',
      'Shooting',
      'Passes',
      'Saves',
      '50s',
      'Touches',
      'Demos',
      'Team field pressure',
      'Your contribution',
      'Avg territory',
      'Eligible games',
    ])
      expect(screen.getByText(label)).toBeInTheDocument();
    for (const summaryLabel of [
      'W/L diff',
      'Record',
      'Games',
      'Goal diff',
      'Avg score',
    ])
      expect(screen.queryByText(summaryLabel)).not.toBeInTheDocument();
  });

  it('omits pressure when a session has no eligible matches', () => {
    render(
      <SessionDetailStats
        metrics={{ ...metrics, territorialImpact: undefined }}
      />,
    );

    expect(
      screen.queryByRole('heading', { name: 'Pressure' }),
    ).not.toBeInTheDocument();
  });
});
