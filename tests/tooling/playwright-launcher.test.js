import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { runPlaywright } from '../../scripts/playwright.mjs';

const playwrightConfig = readFileSync('playwright.config.ts', 'utf8');

describe('Playwright launcher', () => {
  it('does not reuse a server already listening on the selected port', () => {
    expect(playwrightConfig).toContain('reuseExistingServer: false');
    expect(playwrightConfig).toContain('--strictPort');
  });

  it('bounds full-suite concurrency and fails blocked actions quickly', () => {
    expect(playwrightConfig).toContain('fullyParallel: true');
    expect(playwrightConfig).toContain('workers: 2');
    expect(playwrightConfig).toContain('actionTimeout: 5_000');
    expect(playwrightConfig).toContain('retries: process.env.CI ? 1 : 0');
  });

  it('allocates a fresh port for test runs', async () => {
    const runner = vi.fn(() => ({ status: 7 }));
    const portAllocator = vi.fn(async () => 43_217);

    await expect(
      runPlaywright(['test', 'tests/e2e/responsive.spec.ts'], {
        environment: { PATH: '/test/bin' },
        portAllocator,
        runner,
      }),
    ).resolves.toBe(7);

    expect(portAllocator).toHaveBeenCalledOnce();
    expect(runner).toHaveBeenCalledOnce();
    const [, , options] = runner.mock.calls[0];
    expect(options.env).toMatchObject({
      PATH: '/test/bin',
      FENNEC_E2E_PORT: '43217',
    });
  });

  it('preserves an explicit test port', async () => {
    const runner = vi.fn(() => ({ status: 0 }));
    const portAllocator = vi.fn();

    await expect(
      runPlaywright(['test'], {
        environment: { FENNEC_E2E_PORT: '51999' },
        portAllocator,
        runner,
      }),
    ).resolves.toBe(0);

    expect(portAllocator).not.toHaveBeenCalled();
    const [, , options] = runner.mock.calls[0];
    expect(options.env.FENNEC_E2E_PORT).toBe('51999');
  });

  it('does not allocate a port for non-test commands', async () => {
    const runner = vi.fn(() => ({ status: 0 }));
    const portAllocator = vi.fn();

    await runPlaywright(['install', 'chromium'], {
      environment: {},
      portAllocator,
      runner,
    });

    expect(portAllocator).not.toHaveBeenCalled();
  });
});
