/** Resolves an explicit demo query override before the build-time default. */
export function demoModeEnabled(
  search: string,
  defaultEnabled: boolean,
): boolean {
  const override = new URLSearchParams(search).get('demo');
  if (override === '1') return true;
  if (override === '0') return false;
  return defaultEnabled;
}
