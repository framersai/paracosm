import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { serializeShape, describeShapeDiff } from './shape-utils.js';

test('serializeShape produces stable output across two runs with identical input', () => {
  const schema = z.object({ a: z.string(), b: z.number().optional(), c: z.array(z.boolean()) });
  const a = serializeShape(schema as never, 1);
  const b = serializeShape(schema as never, 1);
  assert.deepEqual(a, b);
});

test('serializeShape captures top-level keys and Zod kinds', () => {
  const schema = z.object({
    name: z.string(),
    age: z.number(),
    tags: z.array(z.string()),
    sub: z.object({ inner: z.boolean() }),
  });
  const out = serializeShape(schema as never, 7);
  assert.equal(out.schemaVersion, 7);
  assert.match(out.shape.name, /string/);
  assert.match(out.shape.age, /number/);
  assert.match(out.shape.tags, /array/);
  assert.match(out.shape.sub, /object/);
});

test('describeShapeDiff returns empty when shapes match', () => {
  assert.equal(describeShapeDiff({ a: 'string' }, { a: 'string' }), '');
});

test('describeShapeDiff names added keys with + prefix', () => {
  const diff = describeShapeDiff({ a: 'string' }, { a: 'string', b: 'number' });
  assert.match(diff, /\+\s+b:/);
});

test('describeShapeDiff names removed keys with - prefix', () => {
  const diff = describeShapeDiff({ a: 'string', b: 'number' }, { a: 'string' });
  assert.match(diff, /-\s+b:/);
});

test('describeShapeDiff names changed keys with ~ prefix and shows old/new', () => {
  const diff = describeShapeDiff({ a: 'string' }, { a: 'number' });
  assert.match(diff, /~\s+a:/);
  assert.match(diff, /string/);
  assert.match(diff, /number/);
});
