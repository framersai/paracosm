/**
 * Pass-through vertex shader for a full-screen quad. Both the RD
 * update pass and the display pass share this shader; the vertex
 * buffer is two triangles covering clip space.
 */
export const GRAY_SCOTT_VERT = /* glsl */ `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
  v_uv = a_position * 0.5 + 0.5;
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
