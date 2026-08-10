import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');

describe('deployment cache policy', () => {
  it('keeps hashed assets immutable and SPA entry points non-cacheable', () => {
    expect(workflow).toContain(
      "--cache-control 'public,max-age=31536000,immutable'",
    );
    expect(workflow).toContain(
      "--cache-control 'no-cache,no-store,must-revalidate'",
    );
    expect(workflow).toContain("--cache-control 'no-cache,must-revalidate'");
  });

  it('waits for invalidation and verifies the deployed SPA shell', () => {
    expect(workflow).toMatch(
      /INVALIDATION_ID=\$\(aws cloudfront create-invalidation[^\n]+--query 'Invalidation.Id' --output text\)/,
    );
    expect(workflow).toContain(
      'aws cloudfront wait invalidation-completed --distribution-id "$DISTRIBUTION" --id "$INVALIDATION_ID"',
    );
    expect(workflow).toContain(
      'cmp --silent dist/index.html "$DEPLOYED_INDEX"',
    );
    expect(workflow).toContain(
      "'^cache-control: no-cache,no-store,must-revalidate$'",
    );
  });
});
