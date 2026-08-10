import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const textFile = /\.(?:css|html|js|json|jsx|md|mjs|svg|ts|tsx|yaml|yml)$/;

describe('content style', () => {
  it('uses em dashes only as unavailable-value placeholders', () => {
    const emDash = String.fromCodePoint(0x2014);
    const placeholders = [`'${emDash}'`, `"${emDash}"`];
    const files = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { encoding: 'utf8' },
    )
      .split('\0')
      .filter((file) => textFile.test(file) && existsSync(file));

    for (const file of files) {
      const source = placeholders.reduce(
        (content, placeholder) => content.replaceAll(placeholder, ''),
        readFileSync(file, 'utf8'),
      );
      expect(
        source,
        `${file} contains an em dash in written content`,
      ).not.toContain(emDash);
    }
  });
});
