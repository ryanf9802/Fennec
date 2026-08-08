import { useMemo, useState } from 'react';
import { arenaProfile } from '../domain/arenaProfiles';
import { formatClock } from '../domain/timeline';
import {
  spatialEventPoints,
  type SpatialEventPoint,
} from '../domain/analytics';
import type { MatchState } from '../domain/types';

type Filter = 'all' | 'self' | 'team' | 'opponents' | `player:${string}`;

function formatSpeed(value?: number): string {
  return value === undefined ? '—' : `${Math.round(value)} uu/s`;
}

function FieldLines({
  kind,
}: {
  kind: ReturnType<typeof arenaProfile>['kind'];
}) {
  if (kind === 'dropshot')
    return (
      <>
        <polygon
          points="60,8 540,8 592,150 540,292 60,292 8,150"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <line
          x1="300"
          y1="8"
          x2="300"
          y2="292"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx="300"
          cy="150"
          r="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
      </>
    );
  if (kind === 'hoops')
    return (
      <>
        <rect
          x="8"
          y="8"
          width="584"
          height="284"
          rx="65"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <line
          x1="300"
          y1="8"
          x2="300"
          y2="292"
          stroke="currentColor"
          strokeWidth="2"
        />
        <circle
          cx="300"
          cy="150"
          r="34"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        />
        <ellipse
          cx="32"
          cy="150"
          rx="12"
          ry="38"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
        <ellipse
          cx="568"
          cy="150"
          rx="12"
          ry="38"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
        />
      </>
    );
  return (
    <>
      <rect
        x="8"
        y="8"
        width="584"
        height="284"
        rx={kind === 'generic' ? 4 : 42}
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
      />
      <line
        x1="300"
        y1="8"
        x2="300"
        y2="292"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle
        cx="300"
        cy="150"
        r="34"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      {kind === 'soccar' && (
        <>
          <rect
            x="8"
            y="95"
            width="28"
            height="110"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
          <rect
            x="564"
            y="95"
            width="28"
            height="110"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
    </>
  );
}

function pointLabel(point: SpatialEventPoint): string {
  const actors =
    point.actors.map((actor) => actor.name).join(', ') || 'Unknown player';
  if (point.kind === 'touch')
    return `${actors}, touch at ${formatClock(point.matchClockSeconds)}, ${formatSpeed(point.postHitSpeed)}`;
  return `${actors}, ${point.kind} at ${formatClock(point.matchClockSeconds)}, ${formatSpeed(point.speed)}`;
}

export function BallTouchMap({
  match,
  profileId,
}: {
  match: MatchState;
  profileId?: string;
}) {
  const points = useMemo(() => spatialEventPoints(match), [match]);
  const touchPoints = points.filter((point) => point.kind === 'touch');
  const profilePlayer = match.participants.find(
    (player) => player.primaryId === profileId,
  );
  const hasProfileTouches =
    !!profileId &&
    touchPoints.some((point) =>
      point.actors.some((actor) => actor.primaryId === profileId),
    );
  const [filter, setFilter] = useState<Filter>(
    hasProfileTouches ? 'self' : 'all',
  );
  const [active, setActive] = useState<string>();
  const arena = arenaProfile(match, points);
  const rotate = profilePlayer?.teamNumber === 1;
  const players = match.participants.filter(
    (player) =>
      player.primaryId &&
      player.primaryId !== profileId &&
      touchPoints.some((point) =>
        point.actors.some((actor) => actor.primaryId === player.primaryId),
      ),
  );
  const visible = points.filter((point) => {
    if (filter === 'all') return true;
    if (filter === 'self')
      return point.actors.some((actor) => actor.primaryId === profileId);
    if (filter === 'team')
      return point.actors.some(
        (actor) => actor.teamNumber === profilePlayer?.teamNumber,
      );
    if (filter === 'opponents')
      return point.actors.some(
        (actor) =>
          profilePlayer && actor.teamNumber !== profilePlayer.teamNumber,
      );
    const id = filter.slice('player:'.length);
    return point.actors.some((actor) => actor.primaryId === id);
  });
  const position = (point: SpatialEventPoint) => {
    let x = (point.y - arena.yMin) / (arena.yMax - arena.yMin);
    let y = (arena.xMax - point.x) / (arena.xMax - arena.xMin);
    if (rotate) {
      x = 1 - x;
      y = 1 - y;
    }
    return { x: 8 + x * 584, y: 8 + y * 284 };
  };

  if (!points.length)
    return (
      <div className="surface-flat text-muted rounded-2xl px-5 py-10 text-center text-sm">
        No spatial ball events were captured for this match.
      </div>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" aria-label="Touch map filters">
        {(
          [
            ['all', 'All'],
            ...(hasProfileTouches ? [['self', 'You']] : []),
            ...(profilePlayer
              ? [
                  ['team', 'Your team'],
                  ['opponents', 'Opponents'],
                ]
              : []),
            ...players.map((player) => [
              `player:${player.primaryId}`,
              player.name,
            ]),
          ] as Array<[Filter, string]>
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setFilter(value);
              setActive(undefined);
            }}
            className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${filter === value ? 'bg-cyan-400/20 text-fennec-cyan' : 'surface-flat text-muted hover:text-fennec-cyan'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="surface-flat relative overflow-hidden rounded-2xl p-2">
        <svg
          viewBox="0 0 600 300"
          className="aspect-[2/1] w-full text-slate-500/55"
          role="img"
          aria-label={`${arena.label} ball touch map`}
        >
          <rect
            x="8"
            y="8"
            width="292"
            height="284"
            fill={
              rotate ? 'rgb(251 146 60 / 0.035)' : 'rgb(34 211 238 / 0.035)'
            }
          />
          <rect
            x="300"
            y="8"
            width="292"
            height="284"
            fill={
              rotate ? 'rgb(34 211 238 / 0.035)' : 'rgb(251 146 60 / 0.035)'
            }
          />
          <FieldLines kind={arena.kind} />
          {visible.map((point) => {
            const plotted = position(point);
            const height = Math.min(1, Math.max(0, point.z / arena.zMax));
            const radius = point.kind === 'touch' ? 4.5 + height * 5 : 8;
            const team = point.actors[0]?.teamNumber;
            const color =
              point.kind === 'goal'
                ? '#facc15'
                : point.kind === 'crossbar'
                  ? '#f8fafc'
                  : team === 1
                    ? '#fb923c'
                    : '#22d3ee';
            const toggle = () =>
              setActive((value) => (value === point.id ? undefined : point.id));
            return (
              <g
                key={point.id}
                role="button"
                tabIndex={0}
                aria-label={pointLabel(point)}
                onFocus={() => setActive(point.id)}
                onBlur={() => setActive(undefined)}
                onMouseEnter={() => setActive(point.id)}
                onMouseLeave={() => setActive(undefined)}
                onClick={toggle}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    toggle();
                  }
                }}
                className="cursor-pointer outline-none"
              >
                {point.kind === 'crossbar' ? (
                  <path
                    d={`M ${plotted.x - radius} ${plotted.y - radius} L ${plotted.x + radius} ${plotted.y + radius} M ${plotted.x + radius} ${plotted.y - radius} L ${plotted.x - radius} ${plotted.y + radius}`}
                    stroke={color}
                    strokeWidth="4"
                  />
                ) : (
                  <circle
                    cx={plotted.x}
                    cy={plotted.y}
                    r={radius}
                    fill={color}
                    fillOpacity={active === point.id ? 1 : 0.72}
                    stroke={active === point.id ? '#fff' : color}
                    strokeWidth={active === point.id ? 3 : 1}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {active &&
          (() => {
            const point = points.find((value) => value.id === active);
            if (!point) return null;
            return (
              <div className="surface-strong pointer-events-none absolute bottom-4 left-4 right-4 rounded-xl px-3 py-2 text-xs shadow-xl sm:left-auto sm:max-w-sm">
                <div className="font-bold">
                  {point.actors.map((actor) => actor.name).join(', ') ||
                    'Unknown player'}{' '}
                  · {point.kind}
                </div>
                <div className="text-muted mt-1">
                  {formatClock(point.matchClockSeconds)} · XYZ{' '}
                  {Math.round(point.x)}, {Math.round(point.y)},{' '}
                  {Math.round(point.z)}
                  {point.kind === 'touch'
                    ? ` · ${formatSpeed(point.preHitSpeed)} → ${formatSpeed(point.postHitSpeed)}`
                    : ` · ${formatSpeed(point.speed)}`}
                </div>
              </div>
            );
          })()}
      </div>
      <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span>● Blue</span>
        <span className="text-fennec-orange">● Orange</span>
        <span className="text-amber-400">● Goal</span>
        <span>× Crossbar</span>
        <span className="ml-auto">Marker size indicates height</span>
      </div>
    </div>
  );
}
