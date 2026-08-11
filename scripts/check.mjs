#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const executableSuffix = process.platform === 'win32' ? '.cmd' : '';

function binary(name) {
  return path.join(
    repositoryRoot,
    'node_modules',
    '.bin',
    `${name}${executableSuffix}`,
  );
}

export function validationStages({ web = false } = {}) {
  const stages = [
    {
      name: 'format',
      command: binary('prettier'),
      args: ['--check', '.', '--ignore-unknown'],
    },
    { name: 'lint', command: binary('eslint'), args: ['.'] },
    {
      name: 'types',
      command: binary('tsc'),
      args: ['-b', '--pretty', 'false'],
    },
    { name: 'unit', command: binary('vitest'), args: ['run'] },
    { name: 'build', command: binary('vite'), args: ['build'] },
  ];
  if (web) {
    stages.push({
      name: 'infrastructure',
      command: binary('cdk'),
      args: ['synth', '--quiet'],
    });
    stages.push({
      name: 'browser',
      command: process.execPath,
      args: [path.join(repositoryRoot, 'scripts', 'playwright.mjs'), 'test'],
    });
  }
  return stages;
}

function writePrefixed(stream, destination, name) {
  let pending = '';
  const flushLines = (final = false) => {
    const lines = pending.split(/\r?\n/);
    pending = final ? '' : (lines.pop() ?? '');
    for (const line of lines) {
      const prefix = line.startsWith('::') ? '' : `[${name}] `;
      destination.write(`${prefix}${line}\n`);
    }
    if (final && pending) {
      const prefix = pending.startsWith('::') ? '' : `[${name}] `;
      destination.write(`${prefix}${pending}\n`);
      pending = '';
    }
  };
  stream.on('data', (chunk) => {
    pending += chunk.toString();
    flushLines();
  });
  stream.on('end', () => flushLines(true));
}

export function executeStage(
  stage,
  {
    cwd = repositoryRoot,
    environment = process.env,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  return new Promise((resolve) => {
    const child = spawn(stage.command, stage.args, {
      cwd,
      env: environment,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    writePrefixed(child.stdout, stdout, stage.name);
    writePrefixed(child.stderr, stderr, stage.name);
    child.once('error', (error) => {
      stderr.write(`[${stage.name}] ${error.message}\n`);
      resolve({ status: 1 });
    });
    child.once('exit', (status, signal) =>
      resolve({ status: status ?? 1, signal }),
    );
  });
}

export async function runStages(
  stages,
  {
    concurrency = 2,
    execute = executeStage,
    now = () => Date.now(),
    stdout = process.stdout,
  } = {},
) {
  const results = new Array(stages.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < stages.length) {
      const index = nextIndex;
      nextIndex += 1;
      const stage = stages[index];
      const startedAt = now();
      stdout.write(`> [${stage.name}] starting\n`);
      let outcome;
      try {
        outcome = await execute(stage);
      } catch (error) {
        outcome = { status: 1, error };
      }
      results[index] = {
        ...outcome,
        name: stage.name,
        durationMs: Math.max(0, now() - startedAt),
      };
      stdout.write(
        `> [${stage.name}] ${outcome.status === 0 ? 'passed' : 'failed'} in ${(results[index].durationMs / 1000).toFixed(1)}s\n`,
      );
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), stages.length) },
      worker,
    ),
  );

  stdout.write('\nValidation summary\n');
  for (const result of results)
    stdout.write(
      `- ${result.name}: ${result.status === 0 ? 'PASS' : 'FAIL'} (${(result.durationMs / 1000).toFixed(1)}s)\n`,
    );
  return results.every((result) => result.status === 0) ? 0 : 1;
}

export async function main(argv = process.argv.slice(2)) {
  const invalid = argv.filter((argument) => argument !== '--web');
  if (invalid.length) {
    process.stderr.write(`Unknown option: ${invalid[0]}\n`);
    return 2;
  }
  return runStages(validationStages({ web: argv.includes('--web') }));
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  process.exitCode = await main();
