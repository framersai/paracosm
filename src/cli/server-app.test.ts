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
    assert.equal(response.headers.get('location'), '/sim?tab=settings');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('GET /scenario returns valid scenario client payload', async () => {
  const server = createMarsServer({
    runPairSimulations: async () => {},
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/scenario`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.id, 'mars-genesis');
    assert.ok(data.labels);
    assert.equal(data.labels.name, 'Mars Genesis');
    assert.ok(data.departments);
    assert.ok(data.departments.length >= 5);
    assert.ok(data.presets);
    assert.ok(data.ui);
    assert.ok(data.theme);
    assert.ok(data.policies);
    assert.equal(data.policies.toolForging, true);
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

    assert.deepEqual(json, { redirect: '/sim' });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(captured);
    const cfg = captured as NormalizedSimulationConfig;
    assert.equal(cfg.provider, 'anthropic');
    assert.equal(cfg.startYear, 2042);
    assert.equal(cfg.initialPopulation, 110);
    assert.deepEqual(cfg.activeDepartments, ['medical', 'engineering', 'governance']);
    assert.equal(cfg.startingResources.pressurizedVolumeM3, 4100);
    assert.equal(cfg.startingPolitics.earthDependencyPct, 68);
    assert.equal(cfg.execution.commanderMaxSteps, 7);
    assert.equal(cfg.models.commander, 'claude-sonnet-4-6');
    assert.equal(cfg.customEvents[0].title, 'Blackout');
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('POST /chat replies using simulation colonist data after a completed run', async () => {
  const server = createMarsServer({
    runPairSimulations: async (_config, broadcast) => {
      broadcast('sim', {
        type: 'agent_reactions',
        leader: leaderA.name,
        data: {
          turn: 1,
          reactions: [
            {
              agentId: 'agent-1',
              name: 'Maya Ortiz',
              role: 'Life Support Engineer',
              department: 'engineering',
              mood: 'hopeful',
              age: 34,
              marsborn: false,
              specialization: 'habitat systems',
              hexaco: { O: 0.7, C: 0.8, E: 0.4, A: 0.6, Em: 0.3, HH: 0.7 },
              psychScore: 0.91,
              boneDensity: 97,
              radiation: 12,
              quote: 'We kept the scrubbers online.',
            },
          ],
        },
      });
      broadcast('sim', {
        type: 'result',
        leader: leaderA.name,
        data: { finalState: { ok: true } },
      });
    },
    generateText: async ({ prompt }: { prompt: string }) => ({
      text: prompt.includes('Maya Ortiz') && prompt.includes('Life Support Engineer')
        ? 'Still here. We kept the habitat alive.'
        : 'Prompt missing colonist context.',
    }),
  } as any);

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const setup = await fetch(`http://127.0.0.1:${port}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leaders: [leaderA, leaderB],
        turns: 1,
      }),
    });
    assert.equal(setup.status, 200);
    await new Promise(resolve => setTimeout(resolve, 10));

    const response = await fetch(`http://127.0.0.1:${port}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-1',
        message: 'How are you holding up?',
        history: [],
      }),
    });
    const json = await response.json();

    assert.equal(response.status, 200);
    assert.equal(json.reply, 'Still here. We kept the habitat alive.');
    assert.equal(json.colonist, 'Maya Ortiz');
  } finally {
    server.close();
    await once(server, 'close');
  }
});
