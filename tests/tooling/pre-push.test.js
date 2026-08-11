import { describe, expect, it, vi } from 'vitest';
import {
  assertSafeMainPush,
  isCompanionSensitivePath,
  runPrePush,
  validationScriptForPush,
} from '../../scripts/pre-push.mjs';

const objectId = 'a'.repeat(40);
const remoteObjectId = 'b'.repeat(40);

function update(localRef, remoteRef, localObjectId = objectId) {
  return `${localRef} ${localObjectId} ${remoteRef} ${remoteObjectId}`;
}

function safeGit(changedFiles = 'src/pages/GamesPage.tsx\n') {
  return vi.fn((args) => {
    const command = args.join(' ');
    if (command === 'symbolic-ref --quiet HEAD')
      return { status: 0, stdout: 'refs/heads/main\n' };
    if (command === 'rev-parse HEAD')
      return { status: 0, stdout: `${objectId}\n` };
    if (command.startsWith('status ')) return { status: 0, stdout: '' };
    if (command.startsWith('merge-base ')) return { status: 0, stdout: '' };
    if (command.startsWith('diff ')) return { status: 0, stdout: changedFiles };
    throw new Error(`Unexpected git command: ${command}`);
  });
}

describe('pre-push validation selection', () => {
  it('keeps ordinary branch and tag pushes on the fast gate', () => {
    const input = [
      update('refs/heads/feature', 'refs/heads/feature'),
      update('refs/tags/v1', 'refs/tags/v1'),
    ].join('\n');

    expect(validationScriptForPush(input)).toBe('check');
  });

  it('runs full web validation for any update targeting main', () => {
    const input = [
      update('refs/heads/feature', 'refs/heads/feature'),
      update('refs/heads/release', 'refs/heads/main'),
    ].join('\n');

    expect(validationScriptForPush(input)).toBe('check:web');
  });

  it('does not build the deleted main branch', () => {
    expect(
      validationScriptForPush(
        update('(delete)', 'refs/heads/main', '0'.repeat(40)),
      ),
    ).toBe('check');
  });

  it('runs the selected pnpm script and preserves its status', () => {
    const runner = vi.fn(() => ({ status: 7 }));
    const status = runPrePush(update('refs/heads/main', 'refs/heads/main'), {
      environment: { CI: 'false', PATH: '/test/bin' },
      git: safeGit(),
      runner,
      platform: 'linux',
    });

    expect(status).toBe(7);
    expect(runner).toHaveBeenCalledWith('pnpm', ['check:web'], {
      env: { CI: 'false', PATH: '/test/bin' },
      stdio: 'inherit',
    });
  });

  it('does not force the CI environment for an ordinary branch push', () => {
    const runner = vi.fn(() => ({ status: 0 }));

    runPrePush(update('refs/heads/feature', 'refs/heads/feature'), {
      environment: { CI: 'false', PATH: '/test/bin' },
      runner,
      platform: 'linux',
    });

    expect(runner).toHaveBeenCalledWith('pnpm', ['check'], {
      env: { CI: 'false', PATH: '/test/bin' },
      stdio: 'inherit',
    });
  });

  it('requires the checked-out main commit and a clean fast-forward', () => {
    const git = safeGit();

    expect(() =>
      assertSafeMainPush(update('refs/heads/main', 'refs/heads/main'), { git }),
    ).not.toThrow();
    expect(git).toHaveBeenCalledWith([
      'merge-base',
      '--is-ancestor',
      remoteObjectId,
      objectId,
    ]);
  });

  it('rejects dirty direct-main validation', () => {
    const git = safeGit();
    git.mockImplementation((args) =>
      args[0] === 'status'
        ? { status: 0, stdout: ' M src/app/App.tsx\n' }
        : safeGit()(args),
    );

    expect(() =>
      assertSafeMainPush(update('refs/heads/main', 'refs/heads/main'), { git }),
    ).toThrow('completely clean working tree');
  });

  it('rejects companion-sensitive direct pushes before validation', () => {
    const runner = vi.fn();

    expect(() =>
      runPrePush(update('refs/heads/main', 'refs/heads/main'), {
        git: safeGit('src-tauri/src/lib.rs\npackage.json\n'),
        runner,
      }),
    ).toThrow('Windows companion validation is required');
    expect(runner).not.toHaveBeenCalled();
  });

  it('recognizes the same companion surfaces as the Windows workflow', () => {
    expect(isCompanionSensitivePath('src-tauri/src/server.rs')).toBe(true);
    expect(isCompanionSensitivePath('.github/workflows/companion.yml')).toBe(
      true,
    );
    expect(isCompanionSensitivePath('src/pages/GamesPage.tsx')).toBe(false);
  });
});
