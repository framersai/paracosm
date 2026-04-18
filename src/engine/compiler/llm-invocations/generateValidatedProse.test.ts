import test from 'node:test';
import assert from 'node:assert/strict';
import { generateValidatedProse } from './generateValidatedProse.js';

const validate = (text: string): { ok: true } | { ok: false; reason: string } => {
  if (text.length < 20) return { ok: false, reason: 'too short' };
  if (!text.includes('departments')) return { ok: false, reason: 'missing "departments" keyword' };
  return { ok: true };
};

test('returns validated prose on first try', async () => {
  const mock = async () => 'These are event director instructions mentioning departments clearly.';
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: 'sys',
    prompt: 'write instructions',
    validate,
    fallback: 'fb',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 1);
});

test('retries with prior output on validation failure', async () => {
  let call = 0;
  const seen: string[] = [];
  const mock = async (p: string | { prompt: string }) => {
    call += 1;
    seen.push(typeof p === 'string' ? p : p.prompt);
    return call === 1 ? 'too short' : 'longer text that mentions departments and explains things.';
  };
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: 'sys',
    prompt: 'write instructions',
    validate,
    fallback: 'fb',
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 2);
  assert.ok(seen[1].includes('YOUR PRIOR OUTPUT'));
  assert.ok(seen[1].includes('too short'));
});

test('returns fallback after exhausting retries', async () => {
  const mock = async () => 'short';
  const result = await generateValidatedProse({
    hookName: 'director',
    systemCacheable: 'sys',
    prompt: 'write',
    validate,
    fallback: 'FALLBACK',
    maxRetries: 2,
    generateText: mock as any,
  });
  assert.equal(result.fromFallback, true);
  assert.equal(result.text, 'FALLBACK');
  assert.equal(result.attempts, 2);
});
