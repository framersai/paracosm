import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

const customScenario = {
  id: 'deep-ocean-station',
  version: '1.0.0',
  engineArchetype: 'closed_turn_based_settlement',
  labels: {
    name: 'Deep Ocean Station',
    shortName: 'ocean',
    populationNoun: 'crew members',
    settlementNoun: 'station',
    currency: 'credits',
  },
  theme: { primaryColor: '#2563eb', accentColor: '#38bdf8', cssVariables: {} },
  setup: {
    defaultTurns: 6,
    defaultSeed: 321,
    defaultStartYear: 2048,
    defaultPopulation: 40,
    configurableSections: ['leaders', 'departments', 'models'],
  },
  world: {
    metrics: {
      pressure: {
        id: 'pressure',
        label: 'Hull Pressure',
        unit: 'bar',
        type: 'number',
        initial: 1,
        min: 0,
        max: 5,
        category: 'metric',
      },
    },
    capacities: {},
    statuses: {},
    politics: {},
    environment: {},
  },
  departments: [
    { id: 'operations', label: 'Operations', role: 'Operations Lead', icon: 'O', defaultModel: 'gpt-5.4-mini', instructions: 'Coordinate station operations.' },
    { id: 'research', label: 'Research', role: 'Research Lead', icon: 'R', defaultModel: 'gpt-5.4-mini', instructions: 'Run scientific analysis.' },
  ],
  metrics: [{ id: 'pressure', label: 'Hull Pressure', source: 'metrics.pressure', format: 'number' }],
  events: [{ id: 'breach', label: 'Hull Breach', icon: '!' , color: '#2563eb' }],
  effects: [{ id: 'ocean-category-effects', type: 'category_outcome', label: 'Ocean Category Effects', categoryDefaults: {} }],
  presets: [],
  ui: {
    headerMetrics: [{ id: 'population', format: 'number' }],
    tooltipFields: [],
    reportSections: ['crisis', 'departments', 'decision'],
    departmentIcons: {},
    eventRenderers: {},
    setupSections: ['leaders'],
  },
  knowledge: { topics: {}, categoryMapping: {} },
  policies: {
    toolForging: { enabled: true },
    liveSearch: { enabled: false, mode: 'off' },
    bulletin: { enabled: true },
    characterChat: { enabled: true },
    sandbox: { timeoutMs: 10000, memoryMB: 128 },
  },
  hooks: {},
};

const draftScenario = {
  id: 'draft-ocean-station',
  labels: {
    name: 'Draft Ocean Station',
  },
  departments: [
    { id: 'operations', label: 'Operations' },
  ],
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

test('POST /scenario/store makes a custom scenario switchable through the live catalog', async () => {
  const server = createMarsServer({
    runPairSimulations: async () => {},
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const stored = await fetch(`http://127.0.0.1:${port}/scenario/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: customScenario, saveToDisk: false }),
    });
    assert.equal(stored.status, 200);
    assert.deepEqual(await stored.json(), {
      stored: true,
      id: customScenario.id,
      savedToDisk: false,
      adminWrite: false,
      switchable: true,
    });

    const catalog = await fetch(`http://127.0.0.1:${port}/scenarios`);
    const catalogJson = await catalog.json();
    assert.ok(catalogJson.scenarios.some((scenario: any) => scenario.id === customScenario.id));

    const switched = await fetch(`http://127.0.0.1:${port}/scenario/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: customScenario.id }),
    });
    assert.equal(switched.status, 200);
    assert.deepEqual(await switched.json(), {
      active: customScenario.id,
      name: customScenario.labels.name,
    });

    const active = await fetch(`http://127.0.0.1:${port}/scenario`);
    const activeJson = await active.json();
    assert.equal(activeJson.id, customScenario.id);
    assert.equal(activeJson.labels.name, customScenario.labels.name);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('POST /scenario/store keeps non-runnable draft JSON out of the switchable catalog', async () => {
  const server = createMarsServer({
    runPairSimulations: async () => {},
  });

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const stored = await fetch(`http://127.0.0.1:${port}/scenario/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: draftScenario, saveToDisk: false }),
    });
    assert.equal(stored.status, 200);
    assert.deepEqual(await stored.json(), {
      stored: true,
      id: draftScenario.id,
      savedToDisk: false,
      adminWrite: false,
      switchable: false,
    });

    const catalog = await fetch(`http://127.0.0.1:${port}/scenarios`);
    const catalogJson = await catalog.json();
    assert.equal(catalogJson.scenarios.some((scenario: any) => scenario.id === draftScenario.id), false);

    const switched = await fetch(`http://127.0.0.1:${port}/scenario/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: draftScenario.id }),
    });
    assert.equal(switched.status, 400);
    assert.match((await switched.json()).error, /Unknown scenario/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('disk-saved runnable scenarios are reloaded into the live catalog on restart', async () => {
  const scenarioDir = mkdtempSync(join(tmpdir(), 'paracosm-scenarios-'));
  const firstServer = createMarsServer({
    env: { ...process.env, ADMIN_WRITE: 'true' },
    runPairSimulations: async () => {},
    scenarioDir,
  } as any);

  firstServer.listen(0);
  await once(firstServer, 'listening');
  const firstAddress = firstServer.address();
  const firstPort = typeof firstAddress === 'object' && firstAddress ? firstAddress.port : 0;

  try {
    const stored = await fetch(`http://127.0.0.1:${firstPort}/scenario/store`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario: customScenario, saveToDisk: true }),
    });
    assert.equal(stored.status, 200);
    assert.deepEqual(await stored.json(), {
      stored: true,
      id: customScenario.id,
      savedToDisk: true,
      adminWrite: true,
      switchable: true,
    });
  } finally {
    firstServer.close();
    await once(firstServer, 'close');
  }

  const restartedServer = createMarsServer({
    env: { ...process.env, ADMIN_WRITE: 'true' },
    runPairSimulations: async () => {},
    scenarioDir,
  } as any);

  restartedServer.listen(0);
  await once(restartedServer, 'listening');
  const restartedAddress = restartedServer.address();
  const restartedPort = typeof restartedAddress === 'object' && restartedAddress ? restartedAddress.port : 0;

  try {
    const catalog = await fetch(`http://127.0.0.1:${restartedPort}/scenarios`);
    const catalogJson = await catalog.json();
    assert.ok(catalogJson.scenarios.some((scenario: any) => scenario.id === customScenario.id));

    const switched = await fetch(`http://127.0.0.1:${restartedPort}/scenario/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: customScenario.id }),
    });
    assert.equal(switched.status, 200);
    assert.deepEqual(await switched.json(), {
      active: customScenario.id,
      name: customScenario.labels.name,
    });
  } finally {
    restartedServer.close();
    await once(restartedServer, 'close');
    rmSync(scenarioDir, { recursive: true, force: true });
  }
});

test('POST /compile persists the compiled scenario for later switching and forwards seed options', async () => {
  let captured: { scenarioJson: Record<string, unknown>; options: Record<string, unknown> } | null = null;
  const compiledScenario = {
    ...customScenario,
    id: 'compiled-ocean-station',
    labels: {
      ...customScenario.labels,
      name: 'Compiled Ocean Station',
      shortName: 'compiled-ocean',
    },
    hooks: {
      progressionHook: () => {},
      directorInstructions: () => 'Director instructions for compiled ocean station.',
      departmentPromptHook: () => [],
      getMilestoneEvent: () => null,
      fingerprintHook: () => ({ summary: 'compiled' }),
      politicsHook: () => null,
      reactionContextHook: () => '',
    },
  };

  const server = createMarsServer({
    runPairSimulations: async () => {},
    compileScenario: async (scenarioJson: Record<string, unknown>, options: Record<string, unknown>) => {
      captured = { scenarioJson, options };
      return compiledScenario as any;
    },
  } as any);

  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  try {
    const response = await fetch(`http://127.0.0.1:${port}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario: { id: compiledScenario.id, departments: [] },
        provider: 'anthropic',
        model: 'claude-sonnet-4-6',
        seedUrl: 'https://example.com/ocean-station',
        webSearch: false,
        maxSearches: 7,
      }),
    });
    const text = await response.text();

    assert.equal(response.status, 200);
    assert.match(text, /event: complete/);
    assert.ok(captured, 'compileScenario callback should have been invoked');
    const cap = captured as { scenarioJson: Record<string, unknown>; options: Record<string, unknown> };
    assert.equal(cap.scenarioJson.id, compiledScenario.id);
    assert.equal(cap.options.provider, 'anthropic');
    assert.equal(cap.options.model, 'claude-sonnet-4-6');
    assert.equal(cap.options.seedUrl, 'https://example.com/ocean-station');
    assert.equal(cap.options.webSearch, false);
    assert.equal(cap.options.maxSearches, 7);

    const active = await fetch(`http://127.0.0.1:${port}/scenario`);
    const activeJson = await active.json();
    assert.equal(activeJson.id, compiledScenario.id);

    const backToMars = await fetch(`http://127.0.0.1:${port}/scenario/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'mars-genesis' }),
    });
    assert.equal(backToMars.status, 200);

    const backToCompiled = await fetch(`http://127.0.0.1:${port}/scenario/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: compiledScenario.id }),
    });
    assert.equal(backToCompiled.status, 200);
    assert.deepEqual(await backToCompiled.json(), {
      active: compiledScenario.id,
      name: compiledScenario.labels.name,
    });
  } finally {
    server.close();
    await once(server, 'close');
  }
});

// /chat now creates a real AgentOS `agent()` instance per colonist and
// calls `session.send()`, which hits the live LLM API. The earlier mock
// path via `generateText` no longer applies. This test would need to mock
// the AgentOS agent factory itself, or run against a real provider.
// Skipping in offline test runs to keep the suite green.
test('POST /chat replies using simulation colonist data after a completed run', { skip: !process.env.RUN_LIVE_CHAT_TEST }, async () => {
  const server = createMarsServer({
    runPairSimulations: async (_config: unknown, broadcast: (event: string, data: unknown) => void) => {
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
