import test from 'node:test';
import assert from 'node:assert/strict';
import { validateForgeShape, inferSchemaFromTestCases } from './emergent-setup.js';

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

// ---------------------------------------------------------------------------
// inferSchemaFromTestCases
// ---------------------------------------------------------------------------

test('inferSchemaFromTestCases synthesizes inputSchema properties from first case', () => {
  const req: any = {
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', properties: { score: { type: 'number' } } },
    testCases: [
      { input: { dose: 1200, age: 42 }, expectedOutput: { score: 80 } },
      { input: { dose: 0, age: 25 }, expectedOutput: { score: 0 } },
    ],
  };
  inferSchemaFromTestCases(req);
  assert.ok(req.inputSchema.properties.dose);
  assert.equal(req.inputSchema.properties.dose.type, 'number');
  assert.equal(req.inputSchema.properties.age.type, 'number');
  assert.deepEqual(req.inputSchema.required.sort(), ['age', 'dose']);
});

test('inferSchemaFromTestCases synthesizes outputSchema properties from expectedOutput', () => {
  const req: any = {
    inputSchema: { type: 'object', properties: { x: { type: 'number' } } },
    outputSchema: { type: 'object', additionalProperties: true },
    testCases: [
      { input: { x: 1 }, expectedOutput: { score: 80, tier: 'high' } },
      { input: { x: 2 }, expectedOutput: { score: 0, tier: 'low' } },
    ],
  };
  inferSchemaFromTestCases(req);
  assert.equal(req.outputSchema.properties.score.type, 'number');
  assert.equal(req.outputSchema.properties.tier.type, 'string');
});

test('inferSchemaFromTestCases does NOT overwrite existing properties', () => {
  const req: any = {
    inputSchema: {
      type: 'object',
      properties: { custom_field: { type: 'string', description: 'preset' } },
    },
    outputSchema: { type: 'object', properties: { score: { type: 'number' } } },
    testCases: [
      { input: { custom_field: 'a', extra: 1 }, expectedOutput: { score: 1 } },
      { input: { custom_field: 'b', extra: 2 }, expectedOutput: { score: 2 } },
    ],
  };
  inferSchemaFromTestCases(req);
  // Existing inputSchema preserved verbatim
  assert.equal(
    (req.inputSchema.properties.custom_field as any).description,
    'preset',
    'should not overwrite existing properties',
  );
  // Did NOT add `extra` because inputSchema already had properties
  assert.equal(req.inputSchema.properties.extra, undefined);
});

test('inferSchemaFromTestCases handles missing testCases gracefully', () => {
  const req: any = {
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
  };
  inferSchemaFromTestCases(req);
  // No crash; schemas untouched (no testCases to infer from)
  assert.deepEqual(req.inputSchema, { type: 'object' });
});

test('inferSchemaFromTestCases infers union across multiple test cases', () => {
  const req: any = {
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object', properties: { score: { type: 'number' } } },
    testCases: [
      { input: { a: 1 }, expectedOutput: { score: 1 } },
      { input: { b: 'hello' }, expectedOutput: { score: 2 } },
      { input: { c: true }, expectedOutput: { score: 3 } },
    ],
  };
  inferSchemaFromTestCases(req);
  assert.equal(req.inputSchema.properties.a.type, 'number');
  assert.equal(req.inputSchema.properties.b.type, 'string');
  assert.equal(req.inputSchema.properties.c.type, 'boolean');
});

test('inferSchemaFromTestCases + validateForgeShape: LLM provides testCases without schemas should now PASS', () => {
  const req: any = {
    inputSchema: { type: 'object', additionalProperties: true },
    outputSchema: { type: 'object', additionalProperties: true },
    testCases: [
      { input: { terrain: 'flat', ice: 0.8 }, expectedOutput: { score: 85 } },
      { input: { terrain: 'rocky', ice: 0.2 }, expectedOutput: { score: 30 } },
    ],
  };
  // Before inference: would fail shape check
  const beforeErrors = validateForgeShape(req);
  assert.ok(beforeErrors.length > 0, 'should fail shape check before inference');

  // After inference
  inferSchemaFromTestCases(req);
  const afterErrors = validateForgeShape(req);
  assert.deepEqual(
    afterErrors,
    [],
    `should pass shape check after inference, got: ${afterErrors.join('; ')}`,
  );
});
