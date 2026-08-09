import { readFileSync } from 'node:fs';

const viteConfig = readFileSync('vite.config.ts', 'utf8');

describe('PWA identity', () => {
  it('uses only Fennec for both manifest names', () => {
    expect(viteConfig).toMatch(/^\s+name: 'Fennec',$/m);
    expect(viteConfig).toMatch(/^\s+short_name: 'Fennec',$/m);
    expect(viteConfig).not.toMatch(/name: 'Fennec[^']/);
  });
});
