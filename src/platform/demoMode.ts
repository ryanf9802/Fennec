/** Disables demos in production, otherwise resolving query and build defaults. */
export function demoModeEnabled(
  search: string,
  defaultEnabled: boolean,
  production: boolean,
): boolean {
  if (production) return false;
  const override = new URLSearchParams(search).get('demo');
  if (override === '1') return true;
  if (override === '0') return false;
  return defaultEnabled;
}
