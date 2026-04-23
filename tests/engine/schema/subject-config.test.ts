import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SubjectConfigSchema,
  SubjectMarkerSchema,
  SubjectSignalSchema,
} from '../../../src/engine/schema/index.js';

test('SubjectConfigSchema accepts minimal (id + name only)', () => {
  const subject = { id: 'subj-001', name: 'Alice' };
  const r = SubjectConfigSchema.safeParse(subject);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('SubjectConfigSchema accepts full digital-twin shape', () => {
  const subject = {
    id: 'user-abc',
    name: 'Alice Johnson',
    profile: { age: 34, gender: 'female', diet: 'mediterranean' },
    signals: [
      { label: 'HRV', value: 48.2, unit: 'ms', recordedAt: '2026-04-21T08:00:00.000Z' },
      { label: 'Sleep', value: '7.2 hrs', unit: 'hours' },
    ],
    markers: [
      { id: 'rs4680', category: 'genome', value: 'AA', interpretation: 'Slow catecholamine clearance.' },
    ],
    personality: { openness: 0.7, conscientiousness: 0.6 },
    conditions: ['mild-hypertension'],
  };
  const r = SubjectConfigSchema.safeParse(subject);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('SubjectConfigSchema rejects missing id', () => {
  const bad = { name: 'Alice' };
  assert.equal(SubjectConfigSchema.safeParse(bad).success, false);
});

test('SubjectConfigSchema rejects empty id / name strings', () => {
  assert.equal(SubjectConfigSchema.safeParse({ id: '', name: 'x' }).success, false);
  assert.equal(SubjectConfigSchema.safeParse({ id: 'x', name: '' }).success, false);
});

test('SubjectSignalSchema accepts numeric and string values', () => {
  assert.equal(SubjectSignalSchema.safeParse({ label: 'x', value: 42 }).success, true);
  assert.equal(SubjectSignalSchema.safeParse({ label: 'x', value: '48 ms' }).success, true);
});

test('SubjectSignalSchema rejects malformed recordedAt', () => {
  const bad = { label: 'x', value: 1, recordedAt: 'yesterday' };
  assert.equal(SubjectSignalSchema.safeParse(bad).success, false);
});

test('SubjectMarkerSchema accepts id-only marker', () => {
  assert.equal(SubjectMarkerSchema.safeParse({ id: 'rs1234' }).success, true);
});

test('SubjectMarkerSchema rejects empty id', () => {
  assert.equal(SubjectMarkerSchema.safeParse({ id: '' }).success, false);
});

test('SubjectConfigSchema preserves scenarioExtensions bag opaquely', () => {
  const subject = {
    id: 'x',
    name: 'y',
    scenarioExtensions: { custom: { nested: [1, 2, 3] }, tags: ['a', 'b'] },
  };
  const r = SubjectConfigSchema.safeParse(subject);
  assert.equal(r.success, true);
  if (r.success) {
    assert.deepEqual(r.data.scenarioExtensions, { custom: { nested: [1, 2, 3] }, tags: ['a', 'b'] });
  }
});
