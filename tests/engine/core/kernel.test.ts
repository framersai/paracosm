import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationKernel } from '../../../src/engine/core/kernel.js';
import type { KeyPersonnel } from '../../../src/engine/core/agent-generator.js';

const keyPersonnel: KeyPersonnel[] = [
  {
    name: 'Dr. Yuki Tanaka',
    department: 'medical',
    role: 'Chief Medical Officer',
    specialization: 'Radiation Medicine',
    age: 38,
    featured: true,
  },
];

test('SimulationKernel respects initial population and starting resources', () => {
  const kernel = new SimulationKernel(950, 'Commander', keyPersonnel, {
    startTime: 2042,
    initialPopulation: 120,
    startingResources: {
      foodMonthsReserve: 24,
      waterLitersPerDay: 950,
      powerKw: 600,
      morale: 0.72,
      pressurizedVolumeM3: 4200,
      lifeSupportCapacity: 180,
      infrastructureModules: 6,
      scienceOutput: 10,
    },
    startingPolitics: {
      earthDependencyPct: 70,
    },
  });

  const state = kernel.getState();
  assert.equal(state.metadata.startTime, 2042);
  assert.equal(state.metadata.currentTime, 2042);
  assert.equal(state.systems.population, 120);
  assert.equal(state.agents.length, 120);
  assert.equal(state.systems.foodMonthsReserve, 24);
  assert.equal(state.systems.waterLitersPerDay, 950);
  assert.equal(state.systems.powerKw, 600);
  assert.equal(state.systems.morale, 0.72);
  assert.equal(state.systems.pressurizedVolumeM3, 4200);
  assert.equal(state.systems.lifeSupportCapacity, 180);
  assert.equal(state.systems.infrastructureModules, 6);
  assert.equal(state.systems.scienceOutput, 10);
  assert.equal(state.politics.earthDependencyPct, 70);
});

test('SimulationKernel: initial state always has statuses and environment as empty objects when no scenario provided', () => {
  const kernel = new SimulationKernel(42, 'test-leader', []);
  const state = kernel.getState();
  assert.deepEqual(state.statuses, {});
  assert.deepEqual(state.environment, {});
});
