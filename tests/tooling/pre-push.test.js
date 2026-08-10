import { describe, expect, it, vi } from 'vitest';
import {
  runPrePush,
  validationScriptForPush,
} from '../../scripts/pre-push.mjs';

const objectId = 'a'.repeat(40);
const remoteObjectId = 'b'.repeat(40);

function update(localRef, remoteRef, localObjectId = objectId) {
  return `${localRef} ${localObjectId} ${remoteRef} ${remoteObjectId}`;
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
      runner,
      platform: 'linux',
    });

    expect(status).toBe(7);
    expect(runner).toHaveBeenCalledWith('pnpm', ['check:web'], {
      stdio: 'inherit',
    });
  });
});
