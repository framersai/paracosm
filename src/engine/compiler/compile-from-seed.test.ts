import test from 'node:test';
import assert from 'node:assert/strict';

import { DraftScenarioSchema } from './compile-from-seed.js';

test('DraftScenarioSchema: accepts a well-formed draft', () => {
  const result = DraftScenarioSchema.safeParse({
    id: 'submarine-habitat',
    labels: {
      name: 'Deep Ocean Habitat',
      populationNoun: 'crew',
      settlementNoun: 'habitat',
      timeUnitNoun: 'day',
      currency: 'credits',
    },
    setup: { defaultTurns: 6, defaultPopulation: 50, defaultStartTime: 2040 },
    departments: [
      { id: 'life-support', label: 'Life Support', role: 'Chief Life Support Officer', instructions: 'Analyze O2 levels and water recycling.' },
      { id: 'engineering', label: 'Engineering', role: 'Chief Engineer', instructions: 'Analyze hull integrity and pressure.' },
    ],
    metrics: [
      { id: 'population', format: 'number' },
      { id: 'morale', format: 'percent' },
    ],
  });
  assert.equal(result.success, true);
});

test('DraftScenarioSchema: rejects non-kebab-case id', () => {
  const result = DraftScenarioSchema.safeParse({
    id: 'Submarine Habitat',
    labels: { name: 'X', populationNoun: 'crew', settlementNoun: 'habitat', timeUnitNoun: 'day' },
    setup: { defaultTurns: 6, defaultPopulation: 50, defaultStartTime: 2040 },
    departments: [
      { id: 'a', label: 'A', role: 'R', instructions: 'x'.repeat(10) },
      { id: 'b', label: 'B', role: 'R', instructions: 'x'.repeat(10) },
    ],
    metrics: [{ id: 'm', format: 'number' }, { id: 'n', format: 'number' }],
  });
  assert.equal(result.success, false);
});

test('DraftScenarioSchema: rejects < 2 departments', () => {
  const result = DraftScenarioSchema.safeParse({
    id: 'x-scenario',
    labels: { name: 'X', populationNoun: 'crew', settlementNoun: 'habitat', timeUnitNoun: 'day' },
    setup: { defaultTurns: 6, defaultPopulation: 50, defaultStartTime: 2040 },
    departments: [{ id: 'a', label: 'A', role: 'R', instructions: 'x'.repeat(10) }],
    metrics: [{ id: 'm', format: 'number' }, { id: 'n', format: 'number' }],
  });
  assert.equal(result.success, false);
});

test('DraftScenarioSchema: rejects defaultTurns out of bounds', () => {
  const result = DraftScenarioSchema.safeParse({
    id: 'x-scenario',
    labels: { name: 'X', populationNoun: 'crew', settlementNoun: 'habitat', timeUnitNoun: 'day' },
    setup: { defaultTurns: 24, defaultPopulation: 50, defaultStartTime: 2040 },
    departments: [
      { id: 'a', label: 'A', role: 'R', instructions: 'x'.repeat(10) },
      { id: 'b', label: 'B', role: 'R', instructions: 'x'.repeat(10) },
    ],
    metrics: [{ id: 'm', format: 'number' }, { id: 'n', format: 'number' }],
  });
  assert.equal(result.success, false);
});

test('DraftScenarioSchema: rejects defaultPopulation above 1000', () => {
  const result = DraftScenarioSchema.safeParse({
    id: 'x-scenario',
    labels: { name: 'X', populationNoun: 'crew', settlementNoun: 'habitat', timeUnitNoun: 'day' },
    setup: { defaultTurns: 6, defaultPopulation: 10000, defaultStartTime: 2040 },
    departments: [
      { id: 'a', label: 'A', role: 'R', instructions: 'x'.repeat(10) },
      { id: 'b', label: 'B', role: 'R', instructions: 'x'.repeat(10) },
    ],
    metrics: [{ id: 'm', format: 'number' }, { id: 'n', format: 'number' }],
  });
  assert.equal(result.success, false, 'defaultPopulation > 1000 should reject');
});
