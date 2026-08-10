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
    expect(convertSpeed(10, 'kmh', 'meters-per-second')).toBeCloseTo(36);
    expect(formatSpeed(10, 'kmh', { source: 'meters-per-second' })).toBe(
      '36 km/h',
    );
    expect(formatSpeed(10, 'mph', { source: 'meters-per-second' })).toBe(
      '22 mph',
    );
    expect(
      formatSpeed(-1, 'kmh', {
        source: 'meters-per-second',
        signed: true,
      }),
    ).toBe('-4 km/h');
    expect(
      formatSpeed(1, 'kmh', {
        source: 'meters-per-second',
        signed: true,
      }),
    ).toBe('+4 km/h');
  });

  it('treats Stats API event speeds as km/h', () => {
    expect(formatSpeed(100, 'kmh', { source: 'kilometers-per-hour' })).toBe(
      '100 km/h',
    );
    expect(formatSpeed(100, 'mph', { source: 'kilometers-per-hour' })).toBe(
      '62 mph',
    );
  });
});
