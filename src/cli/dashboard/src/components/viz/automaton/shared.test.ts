import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blendRgb,
  easeOutCubic,
  hashString,
  MOOD_HEX,
  moodRgb,
  mulberry32,
  rgba,
} from './shared.js';

test('moodRgb maps every declared mood key to its token color', () => {
  for (const [key, hex] of Object.entries(MOOD_HEX)) {
    const rgb = moodRgb(key);
    const n = parseInt(hex.slice(1), 16);
    assert.equal(rgb[0], (n >> 16) & 0xff);
    assert.equal(rgb[1], (n >> 8) & 0xff);
    assert.equal(rgb[2], n & 0xff);
  }
});

test('moodRgb falls back to neutral on unknown moods', () => {
  const unknown = moodRgb('something_weird');
  assert.deepEqual(unknown, moodRgb('neutral'));
});

test('moodRgb tolerates undefined without throwing', () => {
  assert.deepEqual(moodRgb(undefined), moodRgb('neutral'));
});

test('blendRgb at t=0 returns a, at t=1 returns b, midpoint averages', () => {
  const a: [number, number, number] = [0, 0, 0];
  const b: [number, number, number] = [200, 100, 50];
  assert.deepEqual(blendRgb(a, b, 0), [0, 0, 0]);
  assert.deepEqual(blendRgb(a, b, 1), [200, 100, 50]);
  assert.deepEqual(blendRgb(a, b, 0.5), [100, 50, 25]);
});

test('blendRgb clamps t outside [0,1] rather than extrapolating', () => {
  const a: [number, number, number] = [10, 20, 30];
  const b: [number, number, number] = [100, 100, 100];
  assert.deepEqual(blendRgb(a, b, -1), [10, 20, 30]);
  assert.deepEqual(blendRgb(a, b, 5), [100, 100, 100]);
});

test('rgba formats as CSS rgba()', () => {
  assert.equal(rgba([255, 128, 64], 0.5), 'rgba(255,128,64,0.5)');
});

test('easeOutCubic monotonic, clamped, 0→0 1→1', () => {
  assert.equal(easeOutCubic(0), 0);
  assert.equal(easeOutCubic(1), 1);
  assert.ok(easeOutCubic(0.25) < easeOutCubic(0.5));
  assert.ok(easeOutCubic(0.5) < easeOutCubic(0.75));
  // Clamps negatives and >1.
  assert.equal(easeOutCubic(-2), 0);
  assert.equal(easeOutCubic(2), 1);
});

test('mulberry32 is deterministic for a fixed seed', () => {
  const r1 = mulberry32(42);
  const r2 = mulberry32(42);
  const seq1 = [r1(), r1(), r1(), r1()];
  const seq2 = [r2(), r2(), r2(), r2()];
  assert.deepEqual(seq1, seq2);
});

test('mulberry32 values land in [0,1)', () => {
  const r = mulberry32(1337);
  for (let i = 0; i < 500; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('hashString is deterministic and distinguishes distinct inputs', () => {
  assert.equal(hashString('abc'), hashString('abc'));
  assert.notEqual(hashString('abc'), hashString('abd'));
  assert.notEqual(hashString(''), hashString('a'));
});
