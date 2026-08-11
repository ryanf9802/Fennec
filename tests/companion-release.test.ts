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
const prebuiltTauriConfig = JSON.parse(
  readFileSync('src-tauri/tauri.prebuilt.conf.json', 'utf8'),
) as { build: { beforeBuildCommand: string } };
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

  it('reuses the prepared frontend when packaging installers', () => {
    expect(prebuiltTauriConfig.build.beforeBuildCommand).toBe('');
    expect(companionWorkflow).toContain(
      'pnpm exec tauri build --no-sign --config src-tauri/tauri.prebuilt.conf.json',
    );
    expect(workflow).toContain('build = @{ beforeBuildCommand = "" }');
    expect(workflow).toContain(
      'args: --config src-tauri/tauri.release.conf.json',
    );
  });

  it('caches Windows Rust dependencies across eligible runs', () => {
    for (const contents of [workflow, companionWorkflow]) {
      expect(contents).toContain('uses: Swatinem/rust-cache@v2');
      expect(contents).toContain('shared-key: windows-companion');
      expect(contents).toContain('workspaces: src-tauri -> target');
    }
  });

  it('builds unsigned local and pull request installers', () => {
    expect(packageJson.scripts['companion:build']).toBe(
      'tauri build --no-sign',
    );
    expect(companionWorkflow).toContain('run: pnpm exec tauri build --no-sign');
    expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY=$keyPath');
    expect(workflow).toContain('tauri-apps/tauri-action@v1');
  });

  it('shares the full web gate between main pushes and web CI', () => {
    expect(packageJson.scripts.prepare).toBe('husky');
    expect(packageJson.scripts.check).toBe('node scripts/check.mjs');
    expect(packageJson.scripts['check:web']).toBe(
      'node scripts/check.mjs --web',
    );
    expect(prePushHook.trim()).toBe('node scripts/pre-push.mjs');
    expect(webWorkflow).toContain('name: Web validation');
    expect(webWorkflow).toContain('push:\n    branches:\n      - main');
    expect(webWorkflow).toContain('run: pnpm check:web');
    expect(webWorkflow).toContain(
      "if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')",
    );
    expect(webWorkflow.indexOf('Install Chromium')).toBeLessThan(
      webWorkflow.indexOf('run: pnpm check:web'),
    );
  });

  it('gates every pull request and validates all release-triggering paths', () => {
    expect(companionWorkflow).toContain('pull_request:\n  workflow_dispatch:');
    expect(companionWorkflow).not.toContain('\n  push:');
    expect(companionWorkflow).toContain('name: Windows companion gate');
    expect(companionWorkflow).toContain(
      'group: fennec-${{ github.workflow }}-${{ github.ref }}',
    );
    expect(companionWorkflow).toContain('cancel-in-progress: true');
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
