import type { SessionMetrics } from '../domain/types';

export function MetricsGrid({
  metrics,
  compact = false,
  abbreviateGoalsForAgainst = false,
}: {
  metrics: SessionMetrics;
  compact?: boolean;
  abbreviateGoalsForAgainst?: boolean;
}) {
  const values = [
    ['Record', metrics.record],
    ['Win rate', metrics.winRate],
    ['Games', metrics.games],
    ['Streak', metrics.streak],
    [
      'Goal diff',
      metrics.goalDifference > 0
        ? `+${metrics.goalDifference}`
        : metrics.goalDifference,
    ],
    [
      abbreviateGoalsForAgainst ? 'GFA' : 'Goals for / against',
      `${metrics.goalsFor}–${metrics.goalsAgainst}`,
    ],
    ['Goals', metrics.goals],
    ['Assists', metrics.assists],
    ['Saves', metrics.saves],
    ['Shots', metrics.shots],
    [
      'Shooting',
      metrics.shootingPercentage === undefined
        ? '—'
        : `${metrics.shootingPercentage}%`,
    ],
    ['Avg score', metrics.averageScore],
    ['Demos', metrics.demos],
    ['Touches', metrics.touches],
  ];
  const shown = compact ? values.slice(0, 6) : values;
  return (
    <div className="grid grid-cols-2 gap-x-5 gap-y-5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
      {shown.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <div className="eyebrow truncate">{label}</div>
          <div className="metric-value mt-1 truncate">{value}</div>
        </div>
      ))}
    </div>
  );
}
