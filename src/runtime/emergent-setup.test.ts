import test from 'node:test';
import assert from 'node:assert/strict';
import { validateForgeShape } from './emergent-setup.js';

/**
 * Targeted tests for the pre-judge forge shape validator. The
 * validator is the gate that catches mini/nano-tier forges that
 * emit additionalProperties:true schemas with no declared fields
 * and test cases with empty input objects, so saving the judge
 * LLM call depends on these rules being tight.
 */

test('validateForgeShape accepts a well-formed forge', () => {
  const errors = validateForgeShape({
    inputSchema: {
      type: 'object',
      properties: { dose: { type: 'number' }, age: { type: 'number' } },
      required: ['dose'],
      additionalProperties: false,
    },
    outputSchema: {
      type: 'object',
      properties: { risk_score: { type: 'number' } },
      additionalProperties: false,
    },
    testCases: [
      { input: { dose: 10, age: 30 }, expectedOutput: { risk_score: 1 } },
      { input: { dose: 0, age: 25 }, expectedOutput: { risk_score: 0 } },
      { input: { dose: 1000, age: 80 }, expectedOutput: { risk_score: 99 } },
    ],
  });
  assert.deepEqual(errors, []);
});

test('validateForgeShape rejects empty inputSchema properties', () => {
  const errors = validateForgeShape({
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    testCases: [
      { input: { a: 1 }, expectedOutput: {} },
      { input: { a: 2 }, expectedOutput: {} },
    ],
  });
  assert.ok(errors.some(e => e.includes('inputSchema has no declared properties')));
});

test('validateForgeShape rejects missing outputSchema properties', () => {
  const errors = validateForgeShape({
    inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    outputSchema: { type: 'object' },
    testCases: [
      { input: { a: 1 }, expectedOutput: {} },
      { input: { a: 2 }, expectedOutput: {} },
    ],
  });
  assert.ok(errors.some(e => e.includes('outputSchema has no declared properties')));
});

test('validateForgeShape rejects fewer than two testCases', () => {
  const errors = validateForgeShape({
    inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    outputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    testCases: [{ input: { a: 1 }, expectedOutput: {} }],
  });
  assert.ok(errors.some(e => e.includes('need at least 2 testCases')));
});

test('validateForgeShape rejects empty-input testCases', () => {
  const errors = validateForgeShape({
    inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    outputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    testCases: [
      { input: {}, expectedOutput: {} },
      { input: {}, expectedOutput: {} },
    ],
  });
  assert.ok(errors.some(e => e.includes('testCases use empty input') || e.includes('testCase use empty input')));
});

test('validateForgeShape reports every violation at once (no short-circuit)', () => {
  const errors = validateForgeShape({
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object' },
    testCases: [{ input: {}, expectedOutput: {} }],
  });
  // Should flag: empty inputSchema, empty outputSchema, too few testCases,
  // and empty-input testCase.
  assert.ok(errors.length >= 3, `expected >=3 errors, got ${errors.length}: ${JSON.stringify(errors)}`);
});

test('validateForgeShape tolerates non-object testCases gracefully', () => {
  const errors = validateForgeShape({
    inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    outputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    testCases: 'not an array' as unknown as unknown[],
  });
  assert.ok(errors.some(e => e.includes('need at least 2 testCases, got 0')));
});

test('validateForgeShape grammar: singular vs plural on empty-input count', () => {
  const one = validateForgeShape({
    inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    outputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    testCases: [
      { input: {}, expectedOutput: {} },
      { input: { a: 1 }, expectedOutput: {} },
    ],
  });
  assert.ok(one.some(e => /^1 testCase use empty input/.test(e)), `singular: ${JSON.stringify(one)}`);

  const many = validateForgeShape({
    inputSchema: { type: 'object', properties: { a: { type: 'number' } } },
    outputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    testCases: [
      { input: {}, expectedOutput: {} },
      { input: {}, expectedOutput: {} },
      { input: { a: 1 }, expectedOutput: {} },
    ],
  });
  assert.ok(many.some(e => /^2 testCases use empty input/.test(e)), `plural: ${JSON.stringify(many)}`);
});
