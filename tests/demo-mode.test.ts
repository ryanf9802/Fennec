import { demoModeEnabled } from '../src/platform/demoMode';

describe('demoModeEnabled', () => {
  it('uses the build default without an explicit query override', () => {
    expect(demoModeEnabled('', false, false)).toBe(false);
    expect(demoModeEnabled('?other=value', true, false)).toBe(true);
  });

  it('allows browser tests to explicitly enable or disable demo mode', () => {
    expect(demoModeEnabled('?demo=1', false, false)).toBe(true);
    expect(demoModeEnabled('?demo=0', true, false)).toBe(false);
  });

  it('never enables demo mode in production', () => {
    expect(demoModeEnabled('?demo=1', false, true)).toBe(false);
    expect(demoModeEnabled('', true, true)).toBe(false);
  });
});
