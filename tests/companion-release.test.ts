/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  '.github/workflows/release-companion.yml',
  'utf8',
);
const companionWorkflow = readFileSync(
  '.github/workflows/companion.yml',
  'utf8',
);

function expectWebBuildBeforeRustTests(contents: string) {
  const webBuild = contents.indexOf('run: pnpm build');
  const rustTests = contents.indexOf('run: cargo test --locked');

  expect(webBuild).toBeGreaterThan(-1);
  expect(rustTests).toBeGreaterThan(webBuild);
}

describe('companion release workflow', () => {
  it('publishes signed updates automatically from main', () => {
    expect(workflow).toContain('workflow_dispatch:');
    expect(workflow).toContain('branches:\n      - main');
    expect(workflow).toContain('group: companion-release');
    expect(workflow).toContain('cargo test --locked');
    expect(workflow).toContain('tauri-apps/tauri-action@v1');
    expect(workflow).toContain(
      'releaseAssetNamePattern: Fennec-Companion-Windows-x64[setup][ext]',
    );
    expect(workflow).toContain('updaterJsonPreferNsis: true');
    expect(workflow).toContain('/fennec/companion/updater-signing');
  });

  it('builds the frontend before compiling Tauri tests', () => {
    expectWebBuildBeforeRustTests(workflow);
    expectWebBuildBeforeRustTests(companionWorkflow);
  });

  it('derives a monotonic companion patch version without manual tags', () => {
    expect(
      execFileSync('node', ['scripts/companion-release-version.mjs', '42'], {
        encoding: 'utf8',
      }),
    ).toBe('0.2.42');
  });
});
