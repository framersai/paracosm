import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalJson } from './canonical-json.js';

test('canonicalJson produces identical output for objects with different key orders', () => {
  assert.equal(
    canonicalJson({ b: 1, a: 2 }),
    canonicalJson({ a: 2, b: 1 }),
  );
});

test('canonicalJson sorts nested object keys', () => {
  const out = canonicalJson({ outer: { z: 1, a: 2 }, top: true });
  assert.equal(out, '{"outer":{"a":2,"z":1},"top":true}');
});

test('canonicalJson preserves array order', () => {
  assert.equal(canonicalJson([3, 1, 2]), '[3,1,2]');
});

test('canonicalJson stringifies primitives correctly', () => {
  assert.equal(canonicalJson(42), '42');
  assert.equal(canonicalJson('hello'), '"hello"');
  assert.equal(canonicalJson(true), 'true');
  assert.equal(canonicalJson(null), 'null');
});

test('canonicalJson throws on circular references', () => {
  const obj: { self?: unknown } = {};
  obj.self = obj;
  assert.throws(() => canonicalJson(obj), /circular|cyclic/i);
});

test('canonicalJson handles arrays of objects', () => {
  const out = canonicalJson([{ b: 1, a: 2 }, { d: 4, c: 3 }]);
  assert.equal(out, '[{"a":2,"b":1},{"c":3,"d":4}]');
});

test('canonicalJson treats undefined inside object as omitted (matches JSON.stringify)', () => {
  assert.equal(canonicalJson({ a: 1, b: undefined }), '{"a":1}');
});
