import test from 'node:test';
import assert from 'node:assert/strict';
import { createCompilerTelemetry } from './telemetry.js';

test('recordAttempt increments calls + attempts', () => {
  const t = createCompilerTelemetry();
  t.recordAttempt('progression', 1, false);
  t.recordAttempt('progression', 2, false);
  const snap = t.snapshot();
  assert.equal(snap.schemaRetries['compile:progression'].calls, 2);
  assert.equal(snap.schemaRetries['compile:progression'].attempts, 3);
  assert.equal(snap.schemaRetries['compile:progression'].fallbacks, 0);
});

test('recordFallback increments fallbacks + appends to fallbacks array', () => {
  const t = createCompilerTelemetry();
  t.recordFallback('fingerprint', { rawText: 'bad output', reason: 'parse fail', attempts: 3 });
  const snap = t.snapshot();
  assert.equal(snap.schemaRetries['compile:fingerprint'].calls, 1);
  assert.equal(snap.schemaRetries['compile:fingerprint'].attempts, 3);
  assert.equal(snap.schemaRetries['compile:fingerprint'].fallbacks, 1);
  assert.equal(snap.fallbacks.length, 1);
  assert.equal(snap.fallbacks[0].hookName, 'fingerprint');
  assert.equal(snap.fallbacks[0].rawText, 'bad output');
  assert.equal(snap.fallbacks[0].attempts, 3);
});

test('multiple hook types aggregate independently', () => {
  const t = createCompilerTelemetry();
  t.recordAttempt('progression', 1, false);
  t.recordAttempt('fingerprint', 2, false);
  t.recordFallback('politics', { rawText: 'x', reason: 'y', attempts: 3 });
  const snap = t.snapshot();
  assert.equal(Object.keys(snap.schemaRetries).length, 3);
  assert.equal(snap.schemaRetries['compile:progression'].attempts, 1);
  assert.equal(snap.schemaRetries['compile:fingerprint'].attempts, 2);
  assert.equal(snap.schemaRetries['compile:politics'].fallbacks, 1);
});
