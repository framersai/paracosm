import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInit } from '../../src/cli/init.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'paracosm-init-version-test-'));
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

test('runInit defaults paracosmVersion to the actual published version, never 1.0.0', async () => {
  const dir = join(makeTmpDir(), 'app');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], {
    compileFromSeed: async () => FAKE_SCENARIO as never,
    generateQuickstartActors: async (_s: unknown, n: number) => FAKE_ACTORS.slice(0, n) as never,
    readEnv: () => ({ OPENAI_API_KEY: 'sk-test' } as NodeJS.ProcessEnv),
    log: () => {},
    // No paracosmVersion override; the test verifies the default.
  });
  assert.equal(code, 0);

  const generatedPkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  assert.notEqual(generatedPkg.dependencies.paracosm, '^1.0.0', 'must not default to ^1.0.0');
  assert.match(generatedPkg.dependencies.paracosm, /^\^\d+\.\d+\.\d+/, 'must be a valid caret semver');

  // The default must equal the version in paracosm's own package.json.
  const here = dirname(fileURLToPath(import.meta.url));
  const ownPkg = JSON.parse(readFileSync(resolve(here, '../../package.json'), 'utf-8'));
  assert.equal(generatedPkg.dependencies.paracosm, `^${ownPkg.version}`, 'default must equal paracosm own version');
});
