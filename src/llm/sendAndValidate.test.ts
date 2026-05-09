import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { sendAndValidate } from './sendAndValidate.js';

const TestSchema = z.object({ value: z.string() });

function makeMockSession(responses: string[]) {
  const history: string[] = [];
  let idx = 0;
  return {
    history,
    send: async (prompt: string) => {
      history.push(prompt);
      const text = responses[idx] ?? responses[responses.length - 1];
      idx++;
      return { text, usage: { totalTokens: 10 } };
    },
  };
}

test('sendAndValidate returns validated object on first try', async () => {
  const session = makeMockSession(['{"value":"ok"}']);
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
  });
  assert.equal(result.object.value, 'ok');
  assert.equal(result.fromFallback, false);
  assert.equal(session.history.length, 1);
});

test('sendAndValidate retries on parse failure', async () => {
  const session = makeMockSession([
    'not json at all',
    '{"value":"fixed"}',
  ]);
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
  });
  assert.equal(result.object.value, 'fixed');
  assert.equal(result.fromFallback, false);
  assert.equal(session.history.length, 2);
  assert.match(session.history[1], /not valid JSON|JSON/i);
});

test('sendAndValidate retries on schema validation failure', async () => {
  const session = makeMockSession([
    '{"wrong":"shape"}',
    '{"value":"right"}',
  ]);
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
  });
  assert.equal(result.object.value, 'right');
  assert.equal(session.history.length, 2);
  assert.match(session.history[1], /Validation errors/);
});

test('sendAndValidate preserves session history across retries', async () => {
  const session = makeMockSession([
    'garbage',
    '{"value":"ok"}',
  ]);
  await sendAndValidate({
    session,
    prompt: 'original prompt',
    schema: TestSchema,
  });
  assert.equal(session.history[0], 'original prompt');
  assert.match(session.history[1], /previous|validation|json/i);
});

test('sendAndValidate returns fallback after exhausted retries', async () => {
  const session = makeMockSession(['garbage', 'garbage', 'garbage']);
  let errorSeen = false;
  const result = await sendAndValidate({
    session,
    prompt: 'please return JSON',
    schema: TestSchema,
    maxRetries: 2,
    fallback: { value: 'default' },
    onProviderError: () => { errorSeen = true; },
  });
  assert.equal(result.object.value, 'default');
  assert.equal(result.fromFallback, true);
  assert.equal(errorSeen, true);
  assert.equal(session.history.length, 3);
});

test('sendAndValidate throws after exhausted retries when no fallback', async () => {
  const session = makeMockSession(['garbage', 'garbage', 'garbage']);
  await assert.rejects(
    () => sendAndValidate({
      session,
      prompt: 'please return JSON',
      schema: TestSchema,
      maxRetries: 2,
    }),
    /Validation failed/,
  );
});

test('sendAndValidate fires onUsage for every attempt', async () => {
  const session = makeMockSession(['garbage', '{"value":"ok"}']);
  const usages: any[] = [];
  await sendAndValidate({
    session,
    prompt: 'test',
    schema: TestSchema,
    onUsage: (r) => usages.push(r.usage),
  });
  assert.equal(usages.length, 2);
});

test('sendAndValidate returns attempts=1 on first-try success', async () => {
  const session = makeMockSession(['{"value":"ok"}']);
  const result = await sendAndValidate({
    session, prompt: 'test', schema: TestSchema,
  });
  assert.equal(result.attempts, 1);
});

test('sendAndValidate returns attempts=2 after one retry', async () => {
  const session = makeMockSession(['garbage', '{"value":"fixed"}']);
  const result = await sendAndValidate({
    session, prompt: 'test', schema: TestSchema,
  });
  assert.equal(result.attempts, 2);
});

test('sendAndValidate returns attempts=3 on fallback after exhausted retries', async () => {
  const session = makeMockSession(['garbage', 'garbage', 'garbage']);
  const result = await sendAndValidate({
    session, prompt: 'test', schema: TestSchema,
    maxRetries: 2,
    fallback: { value: 'default' },
  });
  assert.equal(result.attempts, 3);
});
