import type { SpeedUnit } from './types';

export type SpeedSource = 'unreal-units-per-second' | 'goal-speed-kmh';

const kilometersPerHourPerUnrealUnitPerSecond = 0.036;
const milesPerHourPerKilometerPerHour = 0.621371192237334;

/**
 * Converts Stats API speeds while preserving the API's inconsistent GoalSpeed
 * behavior. The API currently documents GoalSpeed as uu/s, but its emitted and
 * documented example values use the in-game km/h scale (for example, 87.3),
 * unlike BallHit values around 1450 uu/s. Treat GoalSpeed as km/h until that
 * upstream bug is fixed; this branch must be revisited if Psyonix patches it.
 */
export function convertSpeed(
  value: number,
  unit: SpeedUnit,
  source: SpeedSource = 'unreal-units-per-second',
): number {
  const kilometersPerHour =
    source === 'goal-speed-kmh'
      ? value
      : value * kilometersPerHourPerUnrealUnitPerSecond;
  return unit === 'mph'
    ? kilometersPerHour * milesPerHourPerKilometerPerHour
    : kilometersPerHour;
}

export function formatSpeed(
  value: number | undefined,
  unit: SpeedUnit,
  options: { source?: SpeedSource; signed?: boolean } = {},
): string {
  if (value === undefined) return '—';
  const converted = convertSpeed(value, unit, options.source);
  const prefix = options.signed && converted >= 0 ? '+' : '';
  return `${prefix}${Math.round(converted)} ${unit === 'kmh' ? 'km/h' : 'mph'}`;
}
