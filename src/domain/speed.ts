import type { SpeedUnit } from './types';

export type SpeedSource = 'meters-per-second' | 'kilometers-per-hour';

const kilometersPerHourPerMeterPerSecond = 3.6;
const milesPerHourPerKilometerPerHour = 0.621371192237334;

/**
 * Converts Stats API speeds while preserving its inconsistent live WebSocket
 * behavior. Although the API documents ball speeds as uu/s, live UpdateState,
 * BallHit, and CrossbarHit values arrive in m/s, while GoalSpeed arrives in the
 * in-game km/h scale. Revisit both source mappings if Psyonix patches the
 * exporter or aligns its payloads with the documentation.
 */
export function convertSpeed(
  value: number,
  unit: SpeedUnit,
  source: SpeedSource = 'meters-per-second',
): number {
  const kilometersPerHour =
    source === 'kilometers-per-hour'
      ? value
      : value * kilometersPerHourPerMeterPerSecond;
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
