/**
 * Gray-Scott reaction-diffusion fragment shader. Samples the previous
 * frame's U/V texture (packed R=U, G=V), computes 5-point Laplacian
 * with mirror boundary, outputs the next frame.
 *
 * Must match `grayScottMath.rdStepCPU` — shader-math tests (future)
 * diff against the CPU implementation.
 *
 * Uniforms:
 *   u_prev  : sampler2D — previous frame RG = (U, V)
 *   u_texel : vec2       — 1/width, 1/height for neighbor sampling
 *   u_F     : float      — feed rate
 *   u_k     : float      — kill rate
 *   u_Du    : float      — diffusion rate for U
 *   u_Dv    : float      — diffusion rate for V
 *   u_dt    : float      — integration step
 */
export const GRAY_SCOTT_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_prev;
uniform vec2 u_texel;
uniform float u_F;
uniform float u_k;
uniform float u_Du;
uniform float u_Dv;
uniform float u_dt;
out vec4 outColor;

void main() {
  vec2 uv = v_uv;
  // Mirror boundary via clamp.
  vec2 uvL = vec2(max(uv.x - u_texel.x, 0.0), uv.y);
  vec2 uvR = vec2(min(uv.x + u_texel.x, 1.0 - u_texel.x), uv.y);
  vec2 uvD = vec2(uv.x, max(uv.y - u_texel.y, 0.0));
  vec2 uvU = vec2(uv.x, min(uv.y + u_texel.y, 1.0 - u_texel.y));

  vec2 c  = texture(u_prev, uv).rg;
  vec2 l  = texture(u_prev, uvL).rg;
  vec2 r  = texture(u_prev, uvR).rg;
  vec2 d  = texture(u_prev, uvD).rg;
  vec2 up = texture(u_prev, uvU).rg;

  vec2 lap = l + r + d + up - 4.0 * c;
  float uVal = c.r;
  float vVal = c.g;
  float reaction = uVal * vVal * vVal;

  float nextU = uVal + u_dt * (u_Du * lap.r - reaction + u_F * (1.0 - uVal));
  float nextV = vVal + u_dt * (u_Dv * lap.g + reaction - (u_F + u_k) * vVal);

  outColor = vec4(nextU, nextV, 0.0, 1.0);
}
`;
