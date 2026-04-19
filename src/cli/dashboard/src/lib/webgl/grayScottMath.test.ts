import test from 'node:test';
import assert from 'node:assert/strict';
import { createRDBuffers, rdStepCPU, seedBrush } from './grayScottMath.js';

test('createRDBuffers: allocates U=1.0 and V=0.0 everywhere (initial equilibrium)', () => {
  const w = 8,
    h = 8;
  const { U, V } = createRDBuffers(w, h);
  assert.equal(U.length, w * h);
  assert.equal(V.length, w * h);
  assert.ok(
    U.every(v => v === 1.0),
    'U=1 everywhere',
  );
  assert.ok(
    V.every(v => v === 0.0),
    'V=0 everywhere',
  );
});

test('seedBrush: deposits V at (cx, cy) with 3x3 Gaussian', () => {
  const w = 8,
    h = 8;
  const buf = createRDBuffers(w, h);
  seedBrush(buf.V, w, h, 4, 4, 1.0);
  assert.ok(buf.V[4 * w + 4] >= 0.9, `center strong: ${buf.V[4 * w + 4]}`);
  assert.ok(
    buf.V[3 * w + 4] > 0 && buf.V[3 * w + 4] < buf.V[4 * w + 4],
    `neighbor weaker: ${buf.V[3 * w + 4]} < ${buf.V[4 * w + 4]}`,
  );
});

/** Standard stable Gray-Scott diffusion rates. `Du*dt < 0.5` required for
 *  forward Euler stability. */
const Du = 0.16;
const Dv = 0.08;
const dt = 1.0;

test('rdStepCPU: seeded V at equilibrium evolves toward pattern (non-trivial)', () => {
  const w = 16,
    h = 16;
  const buf = createRDBuffers(w, h);
  seedBrush(buf.V, w, h, 8, 8, 0.5);
  const F = 0.055,
    k = 0.062;
  for (let i = 0; i < 40; i++) rdStepCPU(buf, w, h, { F, k, Du, Dv, dt });
  const centerV = buf.V[8 * w + 8];
  assert.ok(Number.isFinite(centerV), `centerV finite: ${centerV}`);
  assert.ok(centerV > 0.05, `pattern persists: centerV=${centerV}`);
  const centerU = buf.U[8 * w + 8];
  assert.ok(centerU < 1.0, `U depleted at reaction center: ${centerU}`);
});

test('rdStepCPU: kill regime (high k) drives V toward 0', () => {
  const w = 16,
    h = 16;
  const buf = createRDBuffers(w, h);
  seedBrush(buf.V, w, h, 8, 8, 0.3);
  const initialV = buf.V[8 * w + 8];
  const F = 0.02,
    k = 0.07;
  for (let i = 0; i < 100; i++) rdStepCPU(buf, w, h, { F, k, Du, Dv, dt });
  assert.ok(Number.isFinite(buf.V[8 * w + 8]), `finite: ${buf.V[8 * w + 8]}`);
  assert.ok(
    buf.V[8 * w + 8] < initialV,
    `V decaying under kill regime: now=${buf.V[8 * w + 8]}, initial=${initialV}`,
  );
});
