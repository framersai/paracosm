/**
 * CPU reference implementation of one Gray-Scott reaction-diffusion
 * update step. Matches the shader fragment in
 * `shaders/grayScott.frag.glsl.ts` within epsilon — shader tests diff
 * their output against this module.
 *
 * Also serves as the Canvas2D fallback path wired in Phase 3 when
 * WebGL2 is unavailable.
 */

export interface RDBuffers {
  /** Vitality concentration. Row-major, width x height Float32Array. */
  U: Float32Array;
  /** Stress concentration. Same shape as U. */
  V: Float32Array;
}

export function createRDBuffers(width: number, height: number): RDBuffers {
  const n = width * height;
  const U = new Float32Array(n);
  const V = new Float32Array(n);
  U.fill(1.0);
  V.fill(0.0);
  return { U, V };
}

/**
 * Deposit a 3x3 Gaussian brush centered at (cx, cy) into `buf`, with
 * peak magnitude approximately equal to strength. Clamps at grid edges.
 */
export function seedBrush(
  buf: Float32Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  strength: number,
): void {
  const gx = Math.round(cx);
  const gy = Math.round(cy);
  const K: number[] = [
    0.0625, 0.125, 0.0625,
    0.125, 0.25, 0.125,
    0.0625, 0.125, 0.0625,
  ];
  for (let dy = -1; dy <= 1; dy++) {
    const y = gy + dy;
    if (y < 0 || y >= height) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx;
      if (x < 0 || x >= width) continue;
      const w = K[(dy + 1) * 3 + (dx + 1)];
      buf[y * width + x] += strength * w * 4;
    }
  }
}

export interface RDStepParams {
  F: number;
  k: number;
  Du: number;
  Dv: number;
  dt: number;
}

/**
 * Compute one RD step in place. Uses a 5-point (von Neumann) Laplacian
 * with mirror boundary. Allocates two temp buffers per call.
 */
export function rdStepCPU(
  buf: RDBuffers,
  width: number,
  height: number,
  p: RDStepParams,
): void {
  const { U, V } = buf;
  const nextU = new Float32Array(U.length);
  const nextV = new Float32Array(V.length);
  const { F, k, Du, Dv, dt } = p;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const u = U[i];
      const v = V[i];
      const xm = x > 0 ? x - 1 : 0;
      const xp = x < width - 1 ? x + 1 : width - 1;
      const ym = y > 0 ? y - 1 : 0;
      const yp = y < height - 1 ? y + 1 : height - 1;
      const lapU =
        U[y * width + xm] + U[y * width + xp] + U[ym * width + x] + U[yp * width + x] - 4 * u;
      const lapV =
        V[y * width + xm] + V[y * width + xp] + V[ym * width + x] + V[yp * width + x] - 4 * v;
      const reaction = u * v * v;
      nextU[i] = u + dt * (Du * lapU - reaction + F * (1 - u));
      nextV[i] = v + dt * (Dv * lapV + reaction - (F + k) * v);
    }
  }
  buf.U.set(nextU);
  buf.V.set(nextV);
}
