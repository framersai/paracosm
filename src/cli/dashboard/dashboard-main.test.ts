import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const legacyPath = resolve(here, 'main.legacy.js');
const distPath = resolve(here, 'dist', 'index.html');

test('legacy dashboard main.js parses cleanly', () => {
  execFileSync(process.execPath, ['--check', legacyPath], { stdio: 'pipe' });
  assert.ok(true);
});

test('vite dashboard dist exists after build', async () => {
  const { existsSync } = await import('node:fs');
  assert.ok(existsSync(distPath), 'dist/index.html should exist after npm run dashboard:build');
});
