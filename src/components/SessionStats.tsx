import type { ReactNode } from 'react';
import type { SessionMetrics } from '../domain/types';

interface StatItem {
  label: string;
  value: ReactNode;
  className?: string;
}

function signedValue(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function differenceTone(value: number): string {
  if (value > 0) return 'text-fennec-cyan';
  if (value < 0) return 'text-fennec-orange';
  return 'text-main';
}

function StatValue({ item }: { item: StatItem }) {
  return (
    <div className="min-w-0">
      <div className="eyebrow leading-tight">{item.label}</div>
      <div className="metric-value mt-1">{item.value}</div>
    </div>
  );
}

/** Shows the five session outcomes that matter most at a glance. */
export function SessionSummaryStats({ metrics }: { metrics: SessionMetrics }) {
  const items: StatItem[] = [
    {
      label: 'W/L diff',
      value: (
        <span className={differenceTone(metrics.resultDifference)}>
          {signedValue(metrics.resultDifference)}
        </span>
      ),
    },
    { label: 'Record', value: metrics.record },
    { label: 'Games', value: metrics.games },
    {
      label: 'Goal diff',
      value: (
        <span className={differenceTone(metrics.goalDifference)}>
          {signedValue(metrics.goalDifference)}
        </span>
      ),
    },
    { label: 'Avg score', value: metrics.averageScore },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((item) => (
        <div
          key={item.label}
          className="surface-strong rounded-xl p-3 last:col-span-2 sm:last:col-span-1"
        >
          <StatValue item={item} />
        </div>
      ))}
    </div>
  );
}

/** Groups the secondary session metrics so the detail page stays scannable. */
export function SessionDetailStats({ metrics }: { metrics: SessionMetrics }) {
  const groups: Array<{
    title: string;
    gridClass: string;
    items: StatItem[];
  }> = [
    {
      title: 'Outcome',
      gridClass: 'grid-cols-2',
      items: [
        { label: 'Win rate', value: metrics.winRate },
        { label: 'Streak', value: metrics.streak },
        {
          label: 'Goals for / against',
          value: `${metrics.goalsFor}–${metrics.goalsAgainst}`,
          className: 'col-span-2',
        },
      ],
    },
    {
      title: 'Offense',
      gridClass: 'grid-cols-2',
      items: [
        { label: 'Goals', value: metrics.goals },
        { label: 'Assists', value: metrics.assists },
        { label: 'Shots', value: metrics.shots },
        {
          label: 'Shooting',
          value:
            metrics.shootingPercentage === undefined
              ? '—'
              : `${metrics.shootingPercentage}%`,
        },
      ],
    },
    {
      title: 'Involvement',
      gridClass: 'grid-cols-6',
      items: [
        { label: 'Passes', value: metrics.passes, className: 'col-span-2' },
        { label: 'Saves', value: metrics.saves, className: 'col-span-2' },
        { label: '50s', value: metrics.fifties, className: 'col-span-2' },
        { label: 'Touches', value: metrics.touches, className: 'col-span-3' },
        { label: 'Demos', value: metrics.demos, className: 'col-span-3' },
      ],
    },
  ];

  return (
    <section
      aria-label="Session performance details"
      className="grid gap-4 lg:grid-cols-3"
    >
      {groups.map((group) => (
        <article key={group.title} className="surface-flat rounded-2xl p-5">
          <h2 className="text-lg font-extrabold">{group.title}</h2>
          <div className={`mt-4 grid gap-3 ${group.gridClass}`}>
            {group.items.map((item) => (
              <div
                key={item.label}
                className={`surface-strong rounded-xl p-3 ${item.className ?? ''}`}
              >
                <StatValue item={item} />
              </div>
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
