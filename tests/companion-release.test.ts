/// <reference types="node" />

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
  it('publishes the stable installer name used by the browser', () => {
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain('cargo test --locked');
    expect(workflow).toContain(
      'release/Fennec-Companion-Windows-x64-setup.exe',
    );
    expect(workflow).toContain('gh release create');
  });

  it('builds the frontend before compiling Tauri tests', () => {
    expectWebBuildBeforeRustTests(workflow);
    expectWebBuildBeforeRustTests(companionWorkflow);
  });
});
