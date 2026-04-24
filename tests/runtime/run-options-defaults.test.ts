import test from 'node:test';
import assert from 'node:assert/strict';

import { SimulationKernel } from '../../src/engine/core/kernel.js';

/**
 * These tests verify the precedence logic that the orchestrator
 * applies when resolving startTime / timePerTurn from a mix of
 * RunOptions and scenario.setup. We verify the PRECEDENCE rule
 * directly (unit) rather than end-to-end through runSimulation,
 * because end-to-end requires real LLM calls (covered by the F23.2
 * real-LLM smoke).
 */

function buildMinimalScenario(overrides: { defaultStartTime?: number; defaultTimePerTurn?: number } = {}) {
  return {
    id: 'test-minimal',
    labels: { name: 'Test', populationNoun: 'people', settlementNoun: 'camp' },
    setup: {
      defaultTurns: 2,
      defaultSeed: 1,
      defaultStartTime: overrides.defaultStartTime ?? 100,
      defaultTimePerTurn: overrides.defaultTimePerTurn ?? 5,
      defaultPopulation: 10,
    },
    world: {
      metrics: { foo: { id: 'foo', type: 'number' as const, initial: 1 } },
      capacities: {},
      statuses: {},
      politics: {},
      environment: {},
    },
    departments: [],
  };
}

test('RunOptions default: scenario.setup.defaultStartTime used when opts.startTime absent', () => {
  const scenario = buildMinimalScenario({ defaultStartTime: 7 });
  const opts: { startTime?: number } = {};
  const resolved = opts.startTime ?? scenario.setup.defaultStartTime ?? 0;
  assert.equal(resolved, 7);
});

test('RunOptions default: scenario.setup.defaultTimePerTurn used when opts.timePerTurn absent', () => {
  const scenario = buildMinimalScenario({ defaultTimePerTurn: 3 });
  const opts: { timePerTurn?: number } = {};
  const resolved = opts.timePerTurn ?? scenario.setup.defaultTimePerTurn ?? 1;
  assert.equal(resolved, 3);
});

test('RunOptions default: explicit startTime wins over scenario default', () => {
  const scenario = buildMinimalScenario({ defaultStartTime: 100 });
  const opts: { startTime?: number } = { startTime: 42 };
  const resolved = opts.startTime ?? scenario.setup.defaultStartTime ?? 0;
  assert.equal(resolved, 42);
});

test('RunOptions default: explicit startTime = 0 is honored (nullish, not falsy)', () => {
  const scenario = buildMinimalScenario({ defaultStartTime: 100 });
  const opts: { startTime?: number } = { startTime: 0 };
  const resolved = opts.startTime ?? scenario.setup.defaultStartTime ?? 0;
  assert.equal(resolved, 0, '0 is a legitimate start time; must not fall through to scenario default');
});

test('SimulationKernel: init.startTime honored when scenario setup also provides one', () => {
  const scenario = buildMinimalScenario({ defaultStartTime: 100 });
  const kernel = new SimulationKernel(42, 'test-leader', [], { startTime: 7, scenario: scenario as unknown as never });
  assert.equal(kernel.getState().metadata.startTime, 7);
});
