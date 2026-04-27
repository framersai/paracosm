import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/cli/init.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'paracosm-init-test-'));
}

const FAKE_SCENARIO = {
  id: 'sub-survival',
  labels: { name: 'Submarine Survival', settlementNoun: 'sub' },
  departments: [{ id: 'engineering', label: 'Engineering' }],
  world: { metrics: {}, capacities: {}, statuses: {}, environment: {} },
};

const FAKE_ACTORS = [
  { name: 'A', archetype: 'cautious', unit: 'Sub', hexaco: { openness: 0.5, conscientiousness: 0.7, extraversion: 0.4, agreeableness: 0.6, emotionality: 0.5, honestyHumility: 0.6 }, instructions: '' },
];

const baseDeps = {
  compileFromSeed: async () => FAKE_SCENARIO as never,
  generateQuickstartActors: async (_s: unknown, n: number) => FAKE_ACTORS.slice(0, n) as never,
  readEnv: () => ({ OPENAI_API_KEY: 'sk-test' } as NodeJS.ProcessEnv),
  paracosmVersion: '1.2.3',
  log: () => {},
};

test('runInit writes the 7 expected files', async () => {
  const dir = join(makeTmpDir(), 'app');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], baseDeps);
  assert.equal(code, 0);
  for (const file of ['package.json', 'scenario.json', 'actors.json', 'run.mjs', 'README.md', '.env.example', '.gitignore']) {
    assert.ok(existsSync(join(dir, file)), `${file} should exist`);
  }
});

test('runInit produces parseable scenario.json + actors.json', async () => {
  const dir = join(makeTmpDir(), 'app');
  await runInit([dir, '--domain', 'a'.repeat(250)], baseDeps);
  const scenario = JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf-8'));
  const actors = JSON.parse(readFileSync(join(dir, 'actors.json'), 'utf-8'));
  assert.equal(scenario.id, 'sub-survival');
  assert.ok(Array.isArray(actors));
  assert.equal(actors.length, 1);
});

test('runInit errors when OPENAI_API_KEY missing', async () => {
  const dir = join(makeTmpDir(), 'app');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], {
    ...baseDeps,
    readEnv: () => ({} as NodeJS.ProcessEnv),
  });
  assert.equal(code, 2);
  assert.ok(!existsSync(join(dir, 'package.json')));
});

test('runInit errors on non-empty dir without --force', async () => {
  const dir = makeTmpDir();
  writeFileSync(join(dir, 'existing.txt'), 'hi');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], baseDeps);
  assert.equal(code, 2);
  assert.ok(!existsSync(join(dir, 'package.json')));
});

test('runInit overwrites non-empty dir with --force', async () => {
  const dir = makeTmpDir();
  writeFileSync(join(dir, 'existing.txt'), 'hi');
  const code = await runInit([dir, '--domain', 'a'.repeat(250), '--force'], baseDeps);
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, 'package.json')));
});

test('runInit fetches URL via dep.fetchSeedFromUrl when --domain is a URL', async () => {
  const dir = join(makeTmpDir(), 'app');
  let fetched: string | null = null;
  const code = await runInit([dir, '--domain', 'https://example.com/page'], {
    ...baseDeps,
    fetchSeedFromUrl: async (url: string) => {
      fetched = url;
      return { text: 'b'.repeat(500), title: 'Example' };
    },
  });
  assert.equal(code, 0);
  assert.equal(fetched, 'https://example.com/page');
  assert.ok(existsSync(join(dir, 'scenario.json')));
});
