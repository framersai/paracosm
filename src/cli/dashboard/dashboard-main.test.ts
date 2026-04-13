import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mainPath = resolve(here, 'main.js');

test('dashboard main.js parses cleanly', () => {
  execFileSync(process.execPath, ['--check', mainPath], { stdio: 'pipe' });
  assert.ok(true);
});
