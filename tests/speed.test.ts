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

  it('converts raw Unreal units to the selected display unit', () => {
    expect(convertSpeed(1000, 'kmh')).toBeCloseTo(36);
    expect(formatSpeed(1000, 'kmh')).toBe('36 km/h');
    expect(formatSpeed(1000, 'mph')).toBe('22 mph');
    expect(formatSpeed(-100, 'kmh', { signed: true })).toBe('-4 km/h');
    expect(formatSpeed(100, 'kmh', { signed: true })).toBe('+4 km/h');
  });

  it('treats the Stats API GoalSpeed exception as km/h', () => {
    expect(formatSpeed(100, 'kmh', { source: 'goal-speed-kmh' })).toBe(
      '100 km/h',
    );
    expect(formatSpeed(100, 'mph', { source: 'goal-speed-kmh' })).toBe(
      '62 mph',
    );
  });
});
