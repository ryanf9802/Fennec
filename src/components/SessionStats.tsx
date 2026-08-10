import type { ReactNode } from 'react';
import type { SessionMetrics } from '../domain/types';

interface StatItem {
  label: string;
  value: ReactNode;
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
    columnsClass: string;
    items: StatItem[];
  }> = [
    {
      title: 'Outcome',
      columnsClass: 'sm:grid-cols-3',
      items: [
        { label: 'Win rate', value: metrics.winRate },
        { label: 'Streak', value: metrics.streak },
        {
          label: 'Goals for / against',
          value: `${metrics.goalsFor}–${metrics.goalsAgainst}`,
        },
      ],
    },
    {
      title: 'Offense',
      columnsClass: 'sm:grid-cols-4',
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
      columnsClass: 'sm:grid-cols-5',
      items: [
        { label: 'Passes', value: metrics.passes },
        { label: 'Saves', value: metrics.saves },
        { label: '50s', value: metrics.fifties },
        { label: 'Touches', value: metrics.touches },
        { label: 'Demos', value: metrics.demos },
      ],
    },
  ];

  return (
    <section aria-label="Session performance details" className="space-y-3">
      {groups.map((group) => (
        <article
          key={group.title}
          className="surface-flat rounded-2xl p-5 lg:grid lg:grid-cols-[9rem_minmax(0,1fr)] lg:items-center lg:gap-6"
        >
          <h2 className="text-lg font-extrabold">{group.title}</h2>
          <div
            className={`mt-5 grid grid-cols-2 gap-x-5 gap-y-5 lg:mt-0 ${group.columnsClass}`}
          >
            {group.items.map((item) => (
              <StatValue key={item.label} item={item} />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
