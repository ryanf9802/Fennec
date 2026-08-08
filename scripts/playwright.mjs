#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const nodeModules = realpathSync(join(repositoryRoot, 'node_modules'));
const browserCache = join(nodeModules, '.cache', 'ms-playwright');
const cli = join(nodeModules, '@playwright', 'test', 'cli.js');

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: repositoryRoot,
  env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: browserCache },
  stdio: 'inherit',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
