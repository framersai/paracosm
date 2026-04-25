import test from 'node:test';
import assert from 'node:assert/strict';

import { generateValidatedCode } from '../../../src/engine/compiler/llm-invocations/generateValidatedCode.js';
import type { GenerateTextFn } from '../../../src/engine/compiler/types.js';

type ProbeFn = () => string;

function parseProbe(text: string): ProbeFn | null {
  try {
    const fn = new Function('return ' + text)();
    return typeof fn === 'function' ? (fn as ProbeFn) : null;
  } catch {
    return null;
  }
}

test('retry prompt includes previous smokeTest error as negative feedback', async () => {
  const promptsReceived: string[] = [];
  let callCount = 0;
  const generateText = async (args: { system: unknown; prompt: string; maxTokens?: number }): Promise<string> => {
    promptsReceived.push(args.prompt);
    callCount++;
    // First call: a hook whose smokeTest throws with a distinctive marker.
    // Second call: a valid hook.
    if (callCount === 1) return '() => { throw new Error("HULL_INTEGRITY_UNDEFINED"); }';
    return '() => "ok"';
  };

  const result = await generateValidatedCode<ProbeFn>({
    hookName: 'retry-probe',
    systemCacheable: 'system',
    prompt: 'initial user prompt',
    parse: parseProbe,
    smokeTest: (fn) => { fn(); },
    fallback: () => 'fallback',
    fallbackSource: '() => "fallback"',
    maxRetries: 3,
    generateText: generateText as unknown as GenerateTextFn,
  });

  assert.equal(result.fromFallback, false);
  assert.equal(result.hook(), 'ok');
  assert.equal(promptsReceived.length, 2, 'expected exactly 2 LLM calls (1 failure + 1 success)');
  assert.equal(promptsReceived[0], 'initial user prompt', 'first call uses raw user prompt');
  assert.ok(
    promptsReceived[1].includes('Previous attempt failed'),
    `retry prompt missing failure-feedback preamble: ${promptsReceived[1].slice(0, 200)}`,
  );
  assert.ok(
    promptsReceived[1].includes('HULL_INTEGRITY_UNDEFINED'),
    'retry prompt must echo the smokeTest error message',
  );
  assert.ok(
    promptsReceived[1].includes('YOUR PRIOR OUTPUT'),
    'retry prompt must quote the prior (failing) LLM output for correction context',
  );
});

test('retry prompt prior-output excerpt truncates long output from the end', async () => {
  const longOutput = '/*' + 'x'.repeat(3000) + '*/\n() => { throw new Error("STILL_BAD"); }';
  const promptsReceived: string[] = [];
  let call = 0;
  const generateText = async (args: { prompt: string }): Promise<string> => {
    promptsReceived.push(args.prompt);
    call++;
    return call === 1 ? longOutput : '() => "ok"';
  };

  await generateValidatedCode<ProbeFn>({
    hookName: 'retry-truncation-probe',
    systemCacheable: 'sys',
    prompt: 'user',
    parse: parseProbe,
    smokeTest: (fn) => { fn(); },
    fallback: () => 'fb',
    fallbackSource: '',
    maxRetries: 3,
    generateText: generateText as unknown as GenerateTextFn,
  });

  // Retry prompt includes the tail 2000 chars of the prior output,
  // which contains both the closing */ comment and the throwing fn.
  assert.ok(promptsReceived[1].includes('STILL_BAD'), 'retry prompt should include tail of prior output');
  // Retry prompt should NOT balloon past ~3kB (2000 prior-output + ~1kB scaffold).
  assert.ok(promptsReceived[1].length < 4000, `retry prompt too long: ${promptsReceived[1].length} chars`);
});

test('no retry prompt modification when attempt 1 succeeds', async () => {
  const promptsReceived: string[] = [];
  const generateText = async (args: { prompt: string }): Promise<string> => {
    promptsReceived.push(args.prompt);
    return '() => "ok"';
  };
  const result = await generateValidatedCode<ProbeFn>({
    hookName: 'first-try-probe',
    systemCacheable: 'sys',
    prompt: 'raw user prompt',
    parse: parseProbe,
    smokeTest: () => {},
    fallback: () => 'fb',
    fallbackSource: '',
    maxRetries: 3,
    generateText: generateText as unknown as GenerateTextFn,
  });
  assert.equal(result.fromFallback, false);
  assert.equal(result.attempts, 1);
  assert.equal(promptsReceived.length, 1);
  assert.equal(promptsReceived[0], 'raw user prompt');
});

test('after maxRetries all failures, fallback is returned with failedReason surfaced', async () => {
  let call = 0;
  const generateText = async (): Promise<string> => {
    call++;
    return `() => { throw new Error("ATTEMPT_${call}_FAILED"); }`;
  };

  const result = await generateValidatedCode<ProbeFn>({
    hookName: 'exhaustion-probe',
    systemCacheable: 'sys',
    prompt: 'user',
    parse: parseProbe,
    smokeTest: (fn) => { fn(); },
    fallback: () => 'fallback-value',
    fallbackSource: '() => "fallback-value"',
    maxRetries: 3,
    generateText: generateText as unknown as GenerateTextFn,
  });

  assert.equal(result.fromFallback, true);
  assert.equal(result.attempts, 3);
  assert.equal(result.hook(), 'fallback-value');
  assert.ok(result.failedReason);
  // Should surface the LAST attempt's reason, not the first.
  assert.ok(result.failedReason!.includes('ATTEMPT_3_FAILED'),
    `expected last-attempt reason, got: ${result.failedReason}`);
});
