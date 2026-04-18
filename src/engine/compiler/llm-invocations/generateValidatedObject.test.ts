import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ObjectGenerationError } from '@framers/agentos';
import { generateValidatedObject } from './generateValidatedObject.js';

const S = z.object({ name: z.string(), count: z.number() });

test('returns validated object on success', async () => {
  const mock = async () => ({ object: { name: 'ok', count: 3 }, text: '{"name":"ok","count":3}' });
  const result = await generateValidatedObject({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    schema: S,
    schemaName: 'test',
    prompt: 'generate',
    _generateObjectImpl: mock as any,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.object.count, 3);
  assert.equal(result.attempts, 1);
});

test('returns fallback when ObjectGenerationError thrown and fallback provided', async () => {
  let onFallbackCalled = false;
  const mock = async () => { throw new ObjectGenerationError('bad', 'raw text here', undefined as any); };
  const result = await generateValidatedObject({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    schema: S,
    schemaName: 'test',
    prompt: 'generate',
    fallback: { name: 'fallback', count: 0 },
    onValidationFallback: () => { onFallbackCalled = true; },
    _generateObjectImpl: mock as any,
  });
  assert.equal(result.fromFallback, true);
  assert.equal(result.object.name, 'fallback');
  assert.equal(onFallbackCalled, true);
});

test('rethrows ObjectGenerationError when no fallback provided', async () => {
  const mock = async () => { throw new ObjectGenerationError('bad', 'raw text', undefined as any); };
  await assert.rejects(
    () => generateValidatedObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      schema: S,
      prompt: 'generate',
      _generateObjectImpl: mock as any,
    }),
    /bad/,
  );
});

test('passes systemCacheable with cacheBreakpoint:true into generateObject', async () => {
  let capturedSystem: unknown;
  const mock = async (args: any) => { capturedSystem = args.system; return { object: { name: 'ok', count: 1 }, text: '{}' }; };
  await generateValidatedObject({
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    schema: S,
    systemCacheable: 'stable prefix',
    prompt: 'generate',
    _generateObjectImpl: mock as any,
  });
  assert.deepEqual(capturedSystem, [{ text: 'stable prefix', cacheBreakpoint: true }]);
});
