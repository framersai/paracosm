import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInitArgs } from '../../src/cli/init.js';

test('parseInitArgs returns defaults with only --domain', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250)]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.options.mode, 'turn-loop');
    assert.equal(result.options.actors, 3);
    assert.equal(result.options.force, false);
    assert.ok(result.options.outputDir.endsWith('paracosm-app'));
  }
});

test('parseInitArgs accepts a positional dir before --domain', () => {
  const result = parseInitArgs(['my-app', '--domain', 'a'.repeat(250)]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.options.outputDir.endsWith('my-app'));
    assert.equal(result.options.name, 'my-app');
  }
});

test('parseInitArgs rejects missing --domain', () => {
  const result = parseInitArgs([]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('--domain is required'));
  }
});

test('parseInitArgs rejects out-of-range --actors', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250), '--actors', '10']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('[2, 6]'));
  }
});

test('parseInitArgs rejects invalid --mode', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250), '--mode', 'lol']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('Invalid --mode'));
  }
});

test('parseInitArgs rejects unknown flag', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250), '--bogus']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('Unknown flag'));
  }
});
