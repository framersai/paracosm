import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_MODELS } from '../../src/cli/sim-config.js';
import {
  buildEconomicsEnvelope,
  resolveEconomicsProfile,
} from '../../src/runtime/economics-profile.js';

test('balanced profile preserves the default model mix', () => {
  const profile = resolveEconomicsProfile({
    profileId: 'balanced',
    provider: 'openai',
    baseModels: DEFAULT_MODELS.openai,
  });

  assert.equal(profile.id, 'balanced');
  assert.equal(profile.models.departments, 'gpt-5.4');
  assert.equal(profile.models.commander, 'gpt-4o');
  assert.equal(profile.models.judge, 'gpt-5.4-mini');
  assert.equal(profile.verdict.mode, 'balanced');
  assert.equal(profile.search.mode, 'adaptive');
  assert.equal(profile.batch.maxConcurrency, 1);
});

test('economy profile lowers expensive paths and exposes an envelope preview', () => {
  const profile = resolveEconomicsProfile({
    profileId: 'economy',
    provider: 'openai',
    baseModels: DEFAULT_MODELS.openai,
  });

  assert.equal(profile.models.departments, 'gpt-5.4-mini');
  assert.equal(profile.models.commander, 'gpt-5.4-nano');
  assert.equal(profile.verdict.mode, 'cheap');
  assert.equal(profile.search.mode, 'gated');
  assert.equal(profile.batch.maxConcurrency, 2);

  const envelope = buildEconomicsEnvelope(profile, { turns: 6, population: 30, departments: 3 });
  assert.equal(envelope.profileId, 'economy');
  assert.match(envelope.summary, /cheap verdict/i);
  assert.equal(envelope.estimatedPeakConcurrency, 2);
});
