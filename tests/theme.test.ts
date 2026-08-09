import { readFileSync } from 'node:fs';
import { defaultSettings, normalizeSettings } from '../src/domain/types';

describe('theme defaults', () => {
  it('starts the document in dark mode before persisted settings load', () => {
    expect(readFileSync('index.html', 'utf8')).toContain(
      '<html lang="en" data-theme="dark">',
    );
  });

  it('defaults missing or invalid preferences to dark', () => {
    expect(defaultSettings.theme).toBe('dark');
    expect(normalizeSettings().theme).toBe('dark');
    expect(
      normalizeSettings({
        theme: 'unsupported' as unknown as typeof defaultSettings.theme,
      }).theme,
    ).toBe('dark');
  });

  it.each(['system', 'light'] as const)(
    'preserves an explicit %s preference',
    (theme) => {
      expect(normalizeSettings({ theme }).theme).toBe(theme);
    },
  );
});
