#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mainRef = 'refs/heads/main';
const zeroObjectId = /^0+$/;

/** Selects full web validation when at least one non-deletion ref targets main. */
export function validationScriptForPush(input) {
  for (const line of input.split(/\r?\n/)) {
    const [, localObjectId, remoteRef] = line.trim().split(/\s+/);
    if (
      remoteRef === mainRef &&
      localObjectId &&
      !zeroObjectId.test(localObjectId)
    )
      return 'check:web';
  }
  return 'check';
}

export function runPrePush(
  input,
  { runner = spawnSync, platform = process.platform } = {},
) {
  const command = platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const result = runner(command, [validationScriptForPush(input)], {
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

export function main() {
  return runPrePush(readFileSync(0, 'utf8'));
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? ''))
  process.exitCode = main();
