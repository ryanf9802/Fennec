/// <reference types="node" />

import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  '.github/workflows/release-companion.yml',
  'utf8',
);

describe('companion release workflow', () => {
  it('publishes the stable installer name used by the browser', () => {
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain('cargo test --locked');
    expect(workflow).toContain(
      'release/Fennec-Companion-Windows-x64-setup.exe',
    );
    expect(workflow).toContain('gh release create');
  });
});
