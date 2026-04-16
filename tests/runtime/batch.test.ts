import test from 'node:test';
import assert from 'node:assert/strict';
import type { BatchConfig, BatchManifest } from '../../src/runtime/batch.js';
import { marsScenario } from '../../src/engine/mars/index.js';
import { lunarScenario } from '../../src/engine/lunar/index.js';

test('BatchConfig accepts both mars and lunar scenarios', () => {
  const config: BatchConfig = {
    scenarios: [marsScenario, lunarScenario],
    leaders: [
      { name: 'Test Leader', archetype: 'Test', colony: 'Test', hexaco: { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, emotionality: 0.5, honestyHumility: 0.5 }, instructions: 'Test' },
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
    config: { scenarioIds: ['mars-genesis', 'lunar-outpost'], leaders: ['A', 'B'], turns: 3, seed: 100 },
    results: [],
    totalDuration: 0,
  };

  assert.equal(manifest.config.scenarioIds.length, 2);
  assert.equal(manifest.results.length, 0);
});
