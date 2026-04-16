import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCliRunOptions } from '../../src/cli/cli-run-options.js';

test('parseCliRunOptions preserves backward-compatible positional turns and new flags', () => {
  const options = parseCliRunOptions([
    '5',
    '--live',
    '--seed', '123',
    '--start-year', '2044',
    '--provider', 'anthropic',
    '--commander-model', 'claude-sonnet-4-6',
    '--department-model', 'claude-haiku-4-5-20251001',
    '--judge-model', 'claude-sonnet-4-6',
  ]);

  assert.equal(options.maxTurns, 5);
  assert.equal(options.liveSearch, true);
  assert.equal(options.seed, 123);
  assert.equal(options.startYear, 2044);
  assert.equal(options.provider, 'anthropic');
  assert.equal(options.models?.commander, 'claude-sonnet-4-6');
  assert.equal(options.models?.departments, 'claude-haiku-4-5-20251001');
  assert.equal(options.models?.judge, 'claude-sonnet-4-6');
});

test('parseCliRunOptions defaults cleanly when optional flags are omitted', () => {
  const options = parseCliRunOptions([]);

  assert.equal(options.maxTurns, undefined);
  assert.equal(options.liveSearch, false);
  assert.equal(options.provider, undefined);
});
