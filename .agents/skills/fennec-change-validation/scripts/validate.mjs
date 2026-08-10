#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const usage = `Usage:
  validate.mjs focused --test <path> [--test <path> ...] [--infra] [--companion] [--dry-run]
  validate.mjs full [--infra] [--companion] [--dry-run]
`;

/** Parses the deliberately small validation interface and rejects ambiguity. */
export function parseArguments(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  const [mode, ...options] = argv;
  if (mode !== 'focused' && mode !== 'full')
    throw new Error('Choose either focused or full validation.');

  const config = {
    mode,
    tests: [],
    infra: false,
    companion: false,
    dryRun: false,
  };
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (option === '--test') {
      const test = options[index + 1];
      if (!test || test.startsWith('--'))
        throw new Error('--test requires a test file path.');
      config.tests.push(test);
      index += 1;
    } else if (option === '--infra') config.infra = true;
    else if (option === '--companion') config.companion = true;
    else if (option === '--dry-run') config.dryRun = true;
    else throw new Error(`Unknown option: ${option}`);
  }

  if (mode === 'focused' && config.tests.length === 0)
    throw new Error('Focused validation requires at least one --test path.');
  if (mode === 'full' && config.tests.length > 0)
    throw new Error('--test is only valid with focused validation.');
  return config;
}

/** Converts validated options into the exact ordered repository commands. */
export function validationCommands(config) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commands =
    config.mode === 'focused'
      ? [
          {
            command: npm,
            args: ['run', 'test:run', '--', ...config.tests, '--maxWorkers=1'],
          },
        ]
      : [
          { command: 'git', args: ['diff', '--check'] },
          { command: npm, args: ['run', 'check'] },
        ];

  if (config.infra) commands.push({ command: npm, args: ['run', 'cdk:synth'] });
  if (config.companion) {
    commands.push({ command: npm, args: ['run', 'build'] });
    commands.push({
      command: 'cargo',
      args: ['test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'],
    });
  }
  return commands;
}

function displayCommand({ command, args }) {
  return [command, ...args]
    .map((part) =>
      /^[A-Za-z0-9_./:=@-]+$/.test(part) ? part : JSON.stringify(part),
    )
    .join(' ');
}

/** Executes each stage in order and preserves the first failing exit status. */
export function runCommands(
  commands,
  {
    cwd = repositoryRoot,
    runner = spawnSync,
    dryRun = false,
    stdout = process.stdout,
    stderr = process.stderr,
  } = {},
) {
  for (const stage of commands) {
    stdout.write(`> ${displayCommand(stage)}\n`);
    if (dryRun) continue;
    const result = runner(stage.command, stage.args, { cwd, stdio: 'inherit' });
    if (result.error) {
      stderr.write(`${result.error.message}\n`);
      return 1;
    }
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}

export function main(argv = process.argv.slice(2)) {
  try {
    const config = parseArguments(argv);
    if (config.help) {
      process.stdout.write(usage);
      return 0;
    }
    return runCommands(validationCommands(config), { dryRun: config.dryRun });
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.stderr.write(usage);
    return 2;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url))
  process.exitCode = main();
