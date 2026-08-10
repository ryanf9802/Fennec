import { demoModeEnabled } from '../src/platform/demoMode';

describe('demoModeEnabled', () => {
  it('uses the build default without an explicit query override', () => {
    expect(demoModeEnabled('', false)).toBe(false);
    expect(demoModeEnabled('?other=value', true)).toBe(true);
  });

  it('allows browser tests to explicitly enable or disable demo mode', () => {
    expect(demoModeEnabled('?demo=1', false)).toBe(true);
    expect(demoModeEnabled('?demo=0', true)).toBe(false);
  });
});
