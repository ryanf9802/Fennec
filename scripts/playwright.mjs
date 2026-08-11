#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const nodeModules = realpathSync(join(repositoryRoot, 'node_modules'));
const browserCache = join(nodeModules, '.cache', 'ms-playwright');
const cli = join(nodeModules, '@playwright', 'test', 'cli.js');

/** Asks the OS for a currently unused loopback port, then releases it for Vite. */
export function availableE2ePort() {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate a Playwright server port.'));
        return;
      }
      server.close((error) =>
        error ? reject(error) : resolvePort(address.port),
      );
    });
  });
}

/** Runs the shared Playwright CLI without allowing tests to reuse an unrelated Vite server. */
export async function runPlaywright(
  args,
  {
    environment = process.env,
    portAllocator = availableE2ePort,
    runner = spawnSync,
  } = {},
) {
  const env = { ...environment, PLAYWRIGHT_BROWSERS_PATH: browserCache };
  if (args[0] === 'test' && !env.FENNEC_E2E_PORT)
    env.FENNEC_E2E_PORT = String(await portAllocator());

  const result = runner(process.execPath, [cli, ...args], {
    cwd: repositoryRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? ''))
  process.exitCode = await runPlaywright(process.argv.slice(2));
