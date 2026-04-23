import test from 'node:test';
import assert from 'node:assert/strict';

import { InterventionConfigSchema } from '../../../src/engine/schema/index.js';

test('InterventionConfigSchema accepts minimal (id + name + description)', () => {
  const intv = { id: 'intv-001', name: 'Creatine Protocol', description: '5g creatine daily.' };
  assert.equal(InterventionConfigSchema.safeParse(intv).success, true);
});

test('InterventionConfigSchema accepts full shape', () => {
  const intv = {
    id: 'intv-sleep-creatine',
    name: 'Creatine + Sleep Hygiene',
    description: '5g creatine daily; sleep schedule 11pm-7am; no screens past 10pm.',
    category: 'supplementation',
    mechanism: 'Creatine phosphate replenishment; circadian entrainment.',
    targetBehaviors: ['Take 5g creatine with breakfast', 'Lights out by 11pm', 'No screens past 10pm'],
    duration: { value: 12, unit: 'weeks' },
    adherenceProfile: {
      expected: 0.7,
      risks: ['Travel disrupts sleep schedule', 'Forgetting supplement'],
    },
  };
  const r = InterventionConfigSchema.safeParse(intv);
  assert.equal(r.success, true, r.success ? '' : JSON.stringify(r.error.issues));
});

test('InterventionConfigSchema rejects missing description', () => {
  const bad = { id: 'x', name: 'y' };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema rejects adherence expected > 1', () => {
  const bad = {
    id: 'x',
    name: 'y',
    description: 'z',
    adherenceProfile: { expected: 1.5 },
  };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema rejects adherence expected < 0', () => {
  const bad = {
    id: 'x',
    name: 'y',
    description: 'z',
    adherenceProfile: { expected: -0.1 },
  };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema accepts negative duration.value (retroactive windows)', () => {
  const intv = {
    id: 'x',
    name: 'y',
    description: 'z',
    duration: { value: -30, unit: 'days' },
  };
  assert.equal(InterventionConfigSchema.safeParse(intv).success, true);
});

test('InterventionConfigSchema rejects empty duration.unit', () => {
  const bad = {
    id: 'x',
    name: 'y',
    description: 'z',
    duration: { value: 12, unit: '' },
  };
  assert.equal(InterventionConfigSchema.safeParse(bad).success, false);
});

test('InterventionConfigSchema scenarioExtensions passthrough', () => {
  const intv = {
    id: 'x',
    name: 'y',
    description: 'z',
    scenarioExtensions: { externalSeverity: 3, legacyProtocolId: 'abc123' },
  };
  const r = InterventionConfigSchema.safeParse(intv);
  assert.equal(r.success, true);
});
