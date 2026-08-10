import { describe, expect, it, vi } from 'vitest';
import process from 'node:process';
import {
  parseArguments,
  runCommands,
  validationCommands,
} from '../../.agents/skills/fennec-change-validation/scripts/validate.mjs';

describe('Fennec change validation harness', () => {
  it('recognizes help without requiring a validation mode', () => {
    expect(parseArguments(['--help'])).toEqual({ help: true });
  });

  it('plans deterministic focused test execution', () => {
    const config = parseArguments([
      'focused',
      '--test',
      'tests/one.test.ts',
      '--test',
      'tests/two.test.tsx',
      '--dry-run',
    ]);

    expect(validationCommands(config)).toEqual([
      {
        command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
        args: [
          'run',
          'test:run',
          '--',
          'tests/one.test.ts',
          'tests/two.test.tsx',
          '--maxWorkers=1',
        ],
      },
    ]);
  });

  it('plans the full gate before optional surface checks', () => {
    const commands = validationCommands(
      parseArguments(['full', '--infra', '--companion']),
    );

    expect(commands.map(({ command, args }) => [command, ...args])).toEqual([
      ['git', 'diff', '--check'],
      [process.platform === 'win32' ? 'npm.cmd' : 'npm', 'run', 'check'],
      [process.platform === 'win32' ? 'npm.cmd' : 'npm', 'run', 'cdk:synth'],
      [process.platform === 'win32' ? 'npm.cmd' : 'npm', 'run', 'build'],
      ['cargo', 'test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml'],
    ]);
  });

  it.each([
    [[], 'Choose either focused or full validation.'],
    [['focused'], 'Focused validation requires at least one --test path.'],
    [['full', '--test', 'tests/example.test.ts'], '--test is only valid'],
    [['full', '--unknown'], 'Unknown option: --unknown'],
  ])('rejects invalid arguments %#', (arguments_, message) => {
    expect(() => parseArguments(arguments_)).toThrow(message);
  });

  it('stops at the first failed stage and preserves its status', () => {
    const runner = vi
      .fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 7 });
    const stdout = { write: vi.fn() };

    expect(
      runCommands(
        [
          { command: 'first', args: [] },
          { command: 'second', args: [] },
          { command: 'third', args: [] },
        ],
        { runner, stdout },
      ),
    ).toBe(7);
    expect(runner).toHaveBeenCalledTimes(2);
  });

  it('prints but does not execute a dry-run plan', () => {
    const runner = vi.fn();
    const stdout = { write: vi.fn() };

    expect(
      runCommands([{ command: 'npm', args: ['run', 'check'] }], {
        dryRun: true,
        runner,
        stdout,
      }),
    ).toBe(0);
    expect(runner).not.toHaveBeenCalled();
    expect(stdout.write).toHaveBeenCalledWith('> npm run check\n');
  });
});
