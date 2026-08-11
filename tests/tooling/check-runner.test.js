import { describe, expect, it, vi } from 'vitest';
import { runStages, validationStages } from '../../scripts/check.mjs';

describe('aggregate validation runner', () => {
  it('adds infrastructure and browser stages only to the web gate', () => {
    expect(validationStages().map(({ name }) => name)).toEqual([
      'format',
      'lint',
      'types',
      'unit',
      'build',
    ]);
    expect(validationStages({ web: true }).map(({ name }) => name)).toEqual([
      'format',
      'lint',
      'types',
      'unit',
      'build',
      'infrastructure',
      'browser',
    ]);
  });

  it('runs at most two stages together and reports every failure', async () => {
    const releases = [];
    let active = 0;
    let maximumActive = 0;
    const execute = vi.fn(async (stage) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => releases.push(resolve));
      active -= 1;
      return { status: stage.name === 'second' ? 7 : 0 };
    });
    const stdout = { write: vi.fn() };
    const running = runStages(
      ['first', 'second', 'third'].map((name) => ({ name })),
      { execute, stdout, now: () => 0 },
    );

    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.shift()();
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    releases.splice(0).forEach((release) => release());

    await expect(running).resolves.toBe(1);
    expect(maximumActive).toBe(2);
    expect(execute).toHaveBeenCalledTimes(3);
    expect(stdout.write).toHaveBeenCalledWith('- second: FAIL (0.0s)\n');
    expect(stdout.write).toHaveBeenCalledWith('- third: PASS (0.0s)\n');
  });

  it('converts a rejected stage into a failure and continues', async () => {
    const execute = vi
      .fn()
      .mockRejectedValueOnce(new Error('could not spawn'))
      .mockResolvedValueOnce({ status: 0 });

    await expect(
      runStages([{ name: 'broken' }, { name: 'later' }], {
        execute,
        stdout: { write: vi.fn() },
      }),
    ).resolves.toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
