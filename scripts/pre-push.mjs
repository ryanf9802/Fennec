#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const mainRef = 'refs/heads/main';
const zeroObjectId = /^0+$/;
export const companionSensitivePaths = [
  'src-tauri/',
  'src/companion/',
  'src/components/CompanionSettings.tsx',
  'src/pages/OnboardingPage.tsx',
  'scripts/companion-release-version.mjs',
  'package.json',
  'pnpm-lock.yaml',
  '.github/workflows/companion.yml',
  '.github/workflows/release-companion.yml',
];

export function pushUpdates(input) {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4)
    .map(([localRef, localObjectId, remoteRef, remoteObjectId]) => ({
      localRef,
      localObjectId,
      remoteRef,
      remoteObjectId,
    }));
}

function mainUpdate(input) {
  return pushUpdates(input).find(
    ({ localObjectId, remoteRef }) =>
      remoteRef === mainRef && !zeroObjectId.test(localObjectId),
  );
}

export function isCompanionSensitivePath(file) {
  return companionSensitivePaths.some((candidate) =>
    candidate.endsWith('/') ? file.startsWith(candidate) : file === candidate,
  );
}

/** Selects full web validation when at least one non-deletion ref targets main. */
export function validationScriptForPush(input) {
  return mainUpdate(input) ? 'check:web' : 'check';
}

function runGit(args, runner = spawnSync) {
  const result = runner('git', args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  return { status: result.status ?? 1, stdout: result.stdout ?? '' };
}

/** Rejects direct-main validation that cannot prove the exact clean outgoing commit is safe. */
export function assertSafeMainPush(input, { git = runGit } = {}) {
  const update = mainUpdate(input);
  if (!update) return;
  if (update.localRef !== mainRef)
    throw new Error('Direct main pushes must come from the local main branch.');
  if (zeroObjectId.test(update.remoteObjectId))
    throw new Error(
      'Refusing to create main through the direct-push workflow.',
    );

  const headRef = git(['symbolic-ref', '--quiet', 'HEAD']);
  const head = git(['rev-parse', 'HEAD']);
  if (
    headRef.status !== 0 ||
    headRef.stdout.trim() !== mainRef ||
    head.status !== 0 ||
    head.stdout.trim() !== update.localObjectId
  )
    throw new Error('Check out the exact local main commit before pushing it.');

  const status = git(['status', '--porcelain', '--untracked-files=normal']);
  if (status.status !== 0 || status.stdout.trim())
    throw new Error(
      'Direct main validation requires a completely clean working tree.',
    );

  const ancestry = git([
    'merge-base',
    '--is-ancestor',
    update.remoteObjectId,
    update.localObjectId,
  ]);
  if (ancestry.status !== 0)
    throw new Error(
      'Local main must be a fast-forward of the remote commit reported by Git.',
    );

  const changed = git([
    'diff',
    '--name-only',
    '--diff-filter=ACMRT',
    update.remoteObjectId,
    update.localObjectId,
  ]);
  if (changed.status !== 0)
    throw new Error('Could not inspect the files in the outgoing main update.');
  const companionFiles = changed.stdout
    .split(/\r?\n/)
    .filter((file) => file && isCompanionSensitivePath(file));
  if (companionFiles.length)
    throw new Error(
      `Direct main push refused: Windows companion validation is required for ${companionFiles.join(', ')}. Use a pull request.`,
    );
}

/**
 * Runs the aggregate gate selected by the pushed refs and, for direct main
 * updates, proves the exact outgoing commit is still clean and eligible both
 * before and after validation. Injected process and Git runners keep every
 * platform and rejection path testable without performing a real push.
 */
export function runPrePush(
  input,
  {
    environment = process.env,
    runner = spawnSync,
    platform = process.platform,
    git = runGit,
  } = {},
) {
  const command = platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
  const script = validationScriptForPush(input);
  if (script === 'check:web') assertSafeMainPush(input, { git });
  const options = { env: environment, stdio: 'inherit' };
  const result = runner(command, [script], options);
  if (result.error) throw result.error;
  if (script === 'check:web' && result.status === 0)
    assertSafeMainPush(input, { git });
  return result.status ?? 1;
}

export function main() {
  try {
    return runPrePush(readFileSync(0, 'utf8'));
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 1;
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? ''))
  process.exitCode = main();
