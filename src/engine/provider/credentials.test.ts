import test from 'node:test';
import assert from 'node:assert/strict';

import {
  apiKeyForProvider,
  credentialFingerprint,
  hasProviderCredentials,
  inferProviderFromCredentials,
  normalizeCredential,
  resolveProviderFromCredentials,
  searchCredential,
} from './credentials.js';

test('normalizeCredential drops empty and masked placeholders', () => {
  assert.equal(normalizeCredential(''), undefined);
  assert.equal(normalizeCredential('   '), undefined);
  assert.equal(normalizeCredential('sk-...'), undefined);
  assert.equal(normalizeCredential(' sk-real '), 'sk-real');
});

test('provider inference treats a single real key as user intent', () => {
  assert.equal(inferProviderFromCredentials({ apiKey: 'sk-o' }), 'openai');
  assert.equal(inferProviderFromCredentials({ anthropicKey: 'sk-a' }), 'anthropic');
  assert.equal(inferProviderFromCredentials({ apiKey: 'sk-o', anthropicKey: 'sk-a' }), undefined);
  assert.equal(resolveProviderFromCredentials('openai', { anthropicKey: 'sk-a' }), 'anthropic');
});

test('apiKeyForProvider selects the selected provider key only', () => {
  assert.equal(apiKeyForProvider('openai', { apiKey: 'sk-o', anthropicKey: 'sk-a' }), 'sk-o');
  assert.equal(apiKeyForProvider('anthropic', { apiKey: 'sk-o', anthropicKey: 'sk-a' }), 'sk-a');
  assert.equal(apiKeyForProvider('openai', { apiKey: 'sk-...' }), undefined);
});

test('hasProviderCredentials ignores masked placeholders', () => {
  assert.equal(hasProviderCredentials({ apiKey: 'sk-...' }), false);
  assert.equal(hasProviderCredentials({ anthropicKey: 'sk-real' }), true);
});

test('credentialFingerprint never exposes the raw key', () => {
  const fp = credentialFingerprint('sk-secret');
  assert.equal(fp.length, 8);
  assert.notEqual(fp, 'sk-secret');
  assert.equal(credentialFingerprint(undefined), 'env');
});

test('searchCredential prefers explicit key over env and ignores masks', () => {
  const env = { SERPER_API_KEY: 'env-key' } as NodeJS.ProcessEnv;
  assert.equal(searchCredential('request-key', 'SERPER_API_KEY', env), 'request-key');
  assert.equal(searchCredential('sk-...', 'SERPER_API_KEY', env), 'env-key');
  assert.equal(searchCredential(undefined, 'MISSING_KEY', env), undefined);
});
