/**
 * @fileoverview Tests for normalizeSimulationConfig's provider inference,
 * pinning that user-supplied keys override stale model-tier defaults so
 * a session with only an Anthropic key routes to Anthropic even when the
 * client sent the default `gpt-5.4*` model dropdowns.
 *
 * Regression test for a production bug where a user set ANTHROPIC_API_KEY
 * only, left the model tier dropdowns at their OpenAI defaults, and saw
 * the sim silently run against the server's env OPENAI_API_KEY instead
 * of their provided Anthropic key.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSimulationConfig } from './sim-config.js';

const hexacoDefault = {
  openness: 0.5,
  conscientiousness: 0.5,
  extraversion: 0.5,
  agreeableness: 0.5,
  emotionality: 0.5,
  honestyHumility: 0.5,
};

const twoLeaders = [
  { name: 'Leader A', archetype: 'cautious', colony: 'alpha', hexaco: hexacoDefault, instructions: '' },
  { name: 'Leader B', archetype: 'aggressive', colony: 'beta', hexaco: hexacoDefault, instructions: '' },
];

test('inference: user supplies only Anthropic key → provider is anthropic', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    anthropicKey: 'sk-ant-fake-test-key',
    // Models stay at OpenAI defaults (what the UI dropdowns send).
    models: {
      commander: 'gpt-5.4-mini',
      departments: 'gpt-5.4',
      judge: 'gpt-5.4-mini',
    },
  });
  assert.equal(cfg.provider, 'anthropic');
  // Model defaults should swap to the Anthropic set since the requested
  // gpt-5.4 names don't match the inferred Anthropic provider.
  assert.match(cfg.models.commander, /^claude-/);
  assert.match(cfg.models.departments, /^claude-/);
  assert.match(cfg.models.judge, /^claude-/);
});

test('inference: user supplies only OpenAI key → provider is openai', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    apiKey: 'sk-fake-test-key',
    models: {
      commander: 'claude-haiku-4-5-20251001',
      departments: 'claude-sonnet-4-6',
      judge: 'claude-haiku-4-5-20251001',
    },
  });
  assert.equal(cfg.provider, 'openai');
  assert.match(cfg.models.commander, /^gpt-/);
});

test('inference: both keys supplied → model hints win (keys tie, defer to next signal)', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    apiKey: 'sk-openai',
    anthropicKey: 'sk-ant',
    models: { commander: 'claude-haiku-4-5-20251001' },
  });
  assert.equal(cfg.provider, 'anthropic');
});

test('inference: both keys supplied + explicit provider → explicit provider wins over model hints', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    provider: 'openai',
    apiKey: 'sk-openai',
    anthropicKey: 'sk-ant',
    models: { commander: 'claude-haiku-4-5-20251001' },
  });
  assert.equal(cfg.provider, 'openai');
});

test('inference: neither key + OpenAI model defaults → provider is openai (env fallback path)', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    models: { commander: 'gpt-5.4-mini' },
  });
  assert.equal(cfg.provider, 'openai');
});

test('inference: single Anthropic key beats even an explicit provider: openai (keys reflect user intent)', () => {
  // Regression: UI sends the Provider dropdown state by default (useState('openai'))
  // even when the user only edited the key fields. The key they provided
  // should win over the stale dropdown value — otherwise their
  // Anthropic key is silently ignored and the run bills against the
  // server's env OPENAI_API_KEY.
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    provider: 'openai',
    anthropicKey: 'sk-ant-user-key',
    models: { commander: 'gpt-5.4-mini' },
  });
  assert.equal(cfg.provider, 'anthropic');
});

test('inference: masked key ("...") is treated as "no change" not as a real key', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    apiKey: 'sk-openai-real',
    anthropicKey: '...masked...',
    models: { commander: 'gpt-5.4-mini' },
  });
  assert.equal(cfg.provider, 'openai');
});

test('inference: whitespace-only key is not counted as a real key', () => {
  const cfg = normalizeSimulationConfig({
    leaders: twoLeaders,
    apiKey: '   ',
    anthropicKey: 'sk-ant-real',
    models: { commander: 'gpt-5.4-mini' },
  });
  assert.equal(cfg.provider, 'anthropic');
});
