import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mapConcurrentInOrder,
  type BatchConfig,
  type BatchManifest,
} from '../../src/runtime/batch.js';
import { marsScenario } from '../../src/engine/mars/index.js';
import { lunarScenario } from '../../src/engine/lunar/index.js';

test('BatchConfig accepts both mars and lunar scenarios', () => {
  const config: BatchConfig = {
    scenarios: [marsScenario, lunarScenario],
    actors: [
      { name: 'Test Leader', archetype: 'Test', unit: 'Test', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 }, instructions: 'Test' },
    ],
    turns: 3,
    seed: 100,
  };

  assert.equal(config.scenarios.length, 2);
  assert.equal(config.scenarios[0].id, 'mars-genesis');
  assert.equal(config.scenarios[1].id, 'lunar-outpost');
});

test('BatchManifest type has correct shape', () => {
  const manifest: BatchManifest = {
    timestamp: new Date().toISOString(),
    config: { scenarioIds: ['mars-genesis', 'lunar-outpost'], actors: ['A', 'B'], turns: 3, seed: 100, maxConcurrency: 1 },
    results: [],
    totalDuration: 0,
  };

  assert.equal(manifest.config.scenarioIds.length, 2);
  assert.equal(manifest.results.length, 0);
});

test('mapConcurrentInOrder preserves input order while honoring concurrency limits', async () => {
  const delays = [25, 5, 15, 1];
  let active = 0;
  let maxActive = 0;

  const results = await mapConcurrentInOrder(delays, 2, async (delay, index) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, delay));
    active -= 1;
    return `job-${index}`;
  });

  assert.deepEqual(results, ['job-0', 'job-1', 'job-2', 'job-3']);
  assert.equal(maxActive, 2);
});
