/* global process, URL */
import { readFileSync } from 'node:fs';

const runNumber = Number.parseInt(process.argv[2] ?? '', 10);
if (!Number.isSafeInteger(runNumber) || runNumber < 1 || runNumber > 65_535) {
  throw new Error('GitHub run number must be an integer between 1 and 65535.');
}

const { version: baseVersion } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
const match = /^(\d+)\.(\d+)\.\d+(?:-.+)?$/.exec(baseVersion);
if (!match) throw new Error(`Invalid companion release train: ${baseVersion}`);

process.stdout.write(`${match[1]}.${match[2]}.${runNumber}`);
