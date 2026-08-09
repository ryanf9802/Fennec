import { convertSpeed, formatSpeed } from '../src/domain/speed';
import { defaultSettings, normalizeSettings } from '../src/domain/types';

describe('speed preferences and formatting', () => {
  it('defaults missing and invalid settings to km/h', () => {
    expect(defaultSettings.speedUnit).toBe('kmh');
    expect(normalizeSettings().speedUnit).toBe('kmh');
    expect(
      normalizeSettings({
        speedUnit: 'knots' as unknown as typeof defaultSettings.speedUnit,
      }).speedUnit,
    ).toBe('kmh');
    expect(normalizeSettings({ speedUnit: 'mph' }).speedUnit).toBe('mph');
  });

  it('converts live meters per second to the selected display unit', () => {
    expect(convertSpeed(10, 'kmh')).toBeCloseTo(36);
    expect(formatSpeed(10, 'kmh')).toBe('36 km/h');
    expect(formatSpeed(10, 'mph')).toBe('22 mph');
    expect(formatSpeed(-1, 'kmh', { signed: true })).toBe('-4 km/h');
    expect(formatSpeed(1, 'kmh', { signed: true })).toBe('+4 km/h');
  });

  it('treats the Stats API GoalSpeed exception as km/h', () => {
    expect(formatSpeed(100, 'kmh', { source: 'kilometers-per-hour' })).toBe(
      '100 km/h',
    );
    expect(formatSpeed(100, 'mph', { source: 'kilometers-per-hour' })).toBe(
      '62 mph',
    );
  });
});
