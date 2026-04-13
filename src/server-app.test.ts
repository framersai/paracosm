import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMarsServer } from './server-app.js';
import type { NormalizedSimulationConfig } from './sim-config.js';

const leaderA = {
  name: 'Aria Chen',
  archetype: 'The Visionary',
  colony: 'Ares Horizon',
  hexaco: {
    openness: 0.95,
    conscientiousness: 0.35,
    extraversion: 0.85,
    agreeableness: 0.55,
    emotionality: 0.3,
    honestyHumility: 0.65,
  },
  instructions: 'Leader A',
};

const leaderB = {
  name: 'Dietrich Voss',
  archetype: 'The Engineer',
  colony: 'Meridian Base',
  hexaco: {
    openness: 0.25,
    conscientiousness: 0.97,
    extraversion: 0.3,
    agreeableness: 0.45,
    emotionality: 0.7,
    honestyHumility: 0.9,
  },
  instructions: 'Leader B',
};

test('GET /setup redirects to the live dashboard settings surface', async () => {
  const server = createMarsServer({
    runPairSimulations: async () => {},
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/setup`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/#settings');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('POST /setup normalizes config and hands it to the simulation runner', async () => {
  let captured: NormalizedSimulationConfig | null = null;

  const server = createMarsServer({
    runPairSimulations: async config => {
      captured = config;
    },
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaders: [leaderA, leaderB],
        provider: 'anthropic',
        turns: 1,
        startYear: 2042,
        population: 110,
        activeDepartments: ['medical', 'engineering', 'governance'],
        startingResources: {
          food: 20,
          water: 900,
          power: 500,
          morale: 80,
          pressurizedVolumeM3: 4100,
          lifeSupportCapacity: 175,
          infrastructureModules: 5,
        },
        startingPolitics: { earthDependencyPct: 68 },
        execution: { commanderMaxSteps: 7, departmentMaxSteps: 11, sandboxTimeoutMs: 15000, sandboxMemoryMB: 256 },
        customEvents: [{ turn: 1, title: 'Blackout', description: 'Solar flare.' }],
        models: { commander: 'gpt-5.4', departments: 'gpt-5.4-mini', judge: 'gpt-5.4' },
      }),
    });
    const json = await response.json();

    assert.deepEqual(json, { redirect: '/' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(captured);
    assert.equal(captured?.provider, 'anthropic');
    assert.equal(captured?.startYear, 2042);
    assert.equal(captured?.initialPopulation, 110);
    assert.deepEqual(captured?.activeDepartments, ['medical', 'engineering', 'governance']);
    assert.equal(captured?.startingResources.pressurizedVolumeM3, 4100);
    assert.equal(captured?.startingPolitics.earthDependencyPct, 68);
    assert.equal(captured?.execution.commanderMaxSteps, 7);
    assert.equal(captured?.models.commander, 'claude-sonnet-4-6');
    assert.equal(captured?.customEvents[0].title, 'Blackout');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
