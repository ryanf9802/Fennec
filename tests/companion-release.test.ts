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
const webWorkflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const prePushHook = readFileSync('.husky/pre-push', 'utf8');

const releasePaths = [
  'src-tauri/**',
  'src/companion/**',
  'src/components/CompanionSettings.tsx',
  'src/pages/OnboardingPage.tsx',
  'scripts/companion-release-version.mjs',
  'package.json',
  'pnpm-lock.yaml',
  '.github/workflows/release-companion.yml',
];

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
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY=$keyPath');
    expect(workflow).not.toContain('TAURI_SIGNING_PRIVATE_KEY_PATH');
  });

  it('builds the frontend before compiling Tauri tests', () => {
    expectWebBuildBeforeRustTests(workflow);
    expectWebBuildBeforeRustTests(companionWorkflow);
  });

  it('uses the local validation gate in web CI', () => {
    expect(packageJson.scripts.prepare).toBe('husky');
    expect(packageJson.scripts.check).toBe(
      'prettier --check . --ignore-unknown && eslint . && tsc -b --pretty false && vitest run && vite build',
    );
    expect(prePushHook.trim()).toBe('pnpm check');
    expect(webWorkflow).toContain('name: Web validation');
    expect(webWorkflow).toContain('push:\n    branches:\n      - main');
    expect(webWorkflow).toContain('run: pnpm check');
  });

  it('gates every pull request and validates all release-triggering paths', () => {
    expect(companionWorkflow).toContain('pull_request:\n  workflow_dispatch:');
    expect(companionWorkflow).not.toContain('\n  push:');
    expect(companionWorkflow).toContain('name: Windows companion gate');
    expect(companionWorkflow).toContain(
      "if: needs.detect.outputs.relevant == 'true'",
    );
    expect(companionWorkflow).toContain(
      'Companion changes require successful Windows validation.',
    );
    for (const path of releasePaths) {
      expect(workflow).toContain(`- '${path}'`);
      expect(companionWorkflow).toContain(`'${path.replace(/\*\*$/, '')}',`);
    }
    expect(companionWorkflow).toContain("'.github/workflows/companion.yml',");
  });

  it('derives a monotonic companion patch version without manual tags', () => {
    expect(
      execFileSync('node', ['scripts/companion-release-version.mjs', '42'], {
        encoding: 'utf8',
      }),
    ).toBe('0.2.42');
  });
});
