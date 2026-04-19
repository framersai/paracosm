/**
 * Display shader — samples the final RD texture and colorizes U/V
 * into the Paracosm warm-amber palette. V (stress) weights toward
 * deep red; U-depletion weights toward warm amber. Background stays
 * near --bg-deep so subtle patterns read clearly.
 */
export const DISPLAY_FRAG = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
uniform sampler2D u_field;
uniform vec3 u_sideTint;
out vec4 outColor;

void main() {
  vec2 rg = texture(u_field, v_uv).rg;
  float U = rg.r;
  float V = rg.g;

  // Background: deep warm black (matches --bg-deep #0a0806).
  vec3 bg = vec3(0.039, 0.031, 0.024);
  // Vitality color: warm amber.
  vec3 amber = vec3(0.91, 0.71, 0.29);
  // Stress color: rust red.
  vec3 rust = vec3(0.77, 0.40, 0.19);

  float uPattern = clamp(1.0 - U, 0.0, 1.0);
  float vPattern = clamp(V * 3.0, 0.0, 1.0);

  vec3 color = bg
    + amber * uPattern * 0.5
    + rust * vPattern * 0.7
    + u_sideTint * 0.04;

  outColor = vec4(color, 1.0);
}
`;
