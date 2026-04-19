import { GRAY_SCOTT_VERT } from './shaders/grayScott.vert.glsl.js';
import { GRAY_SCOTT_FRAG } from './shaders/grayScott.frag.glsl.js';
import { DISPLAY_FRAG } from './shaders/display.frag.glsl.js';

interface RDProgram {
  program: WebGLProgram;
  uPrev: WebGLUniformLocation | null;
  uTexel: WebGLUniformLocation | null;
  uF: WebGLUniformLocation | null;
  uK: WebGLUniformLocation | null;
  uDu: WebGLUniformLocation | null;
  uDv: WebGLUniformLocation | null;
  uDt: WebGLUniformLocation | null;
}

interface DisplayProgram {
  program: WebGLProgram;
  uField: WebGLUniformLocation | null;
  uSideTint: WebGLUniformLocation | null;
}

export interface GrayScottContext {
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  fbos: [WebGLFramebuffer, WebGLFramebuffer];
  textures: [WebGLTexture, WebGLTexture];
  /** Index of the texture/FBO holding the current frame. Read from this,
   *  write to the other. Flipped after each RD step. */
  current: 0 | 1;
  rdProgram: RDProgram;
  displayProgram: DisplayProgram;
  quadVAO: WebGLVertexArrayObject;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const s = gl.createShader(type);
  if (!s) throw new Error('failed to create shader');
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`shader compile error: ${info}`);
  }
  return s;
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  const p = gl.createProgram();
  if (!p) throw new Error('failed to create program');
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(p);
    gl.deleteProgram(p);
    throw new Error(`program link error: ${info}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return p;
}

function createFloatTexture(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('failed to create texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, width, height, 0, gl.RG, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function createFBO(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error('failed to create FBO');
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error('FBO incomplete');
  }
  return fbo;
}

/**
 * Initialize a WebGL2 Gray-Scott context: compile shaders, create
 * ping-pong float-texture FBOs, seed U=1.0, V=0.0 everywhere.
 */
export function createGrayScottContext(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): GrayScottContext {
  if (!gl.getExtension('EXT_color_buffer_float')) {
    throw new Error('EXT_color_buffer_float unsupported');
  }

  const tex0 = createFloatTexture(gl, width, height);
  const tex1 = createFloatTexture(gl, width, height);
  const fbo0 = createFBO(gl, tex0);
  const fbo1 = createFBO(gl, tex1);

  // Seed tex0 with U=1.0, V=0.0.
  const seed = new Float32Array(width * height * 2);
  for (let i = 0; i < width * height; i++) {
    seed[i * 2] = 1.0;
    seed[i * 2 + 1] = 0.0;
  }
  gl.bindTexture(gl.TEXTURE_2D, tex0);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RG, gl.FLOAT, seed);

  const rdProg = linkProgram(gl, GRAY_SCOTT_VERT, GRAY_SCOTT_FRAG);
  const displayProg = linkProgram(gl, GRAY_SCOTT_VERT, DISPLAY_FRAG);

  const quadVerts = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const vao = gl.createVertexArray();
  if (!vao) throw new Error('failed to create VAO');
  gl.bindVertexArray(vao);
  const vbo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
  // a_position is at layout 0 in both programs; use the RD program's
  // attrib location (implicit 0) — must match on both programs since
  // both vertex shaders declare `in vec2 a_position` at the same slot.
  const aPos = gl.getAttribLocation(rdProg, 'a_position');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  return {
    gl,
    width,
    height,
    fbos: [fbo0, fbo1],
    textures: [tex0, tex1],
    current: 0,
    rdProgram: {
      program: rdProg,
      uPrev: gl.getUniformLocation(rdProg, 'u_prev'),
      uTexel: gl.getUniformLocation(rdProg, 'u_texel'),
      uF: gl.getUniformLocation(rdProg, 'u_F'),
      uK: gl.getUniformLocation(rdProg, 'u_k'),
      uDu: gl.getUniformLocation(rdProg, 'u_Du'),
      uDv: gl.getUniformLocation(rdProg, 'u_Dv'),
      uDt: gl.getUniformLocation(rdProg, 'u_dt'),
    },
    displayProgram: {
      program: displayProg,
      uField: gl.getUniformLocation(displayProg, 'u_field'),
      uSideTint: gl.getUniformLocation(displayProg, 'u_sideTint'),
    },
    quadVAO: vao,
  };
}

export interface RDStepUniforms {
  F: number;
  k: number;
  /** Defaults: stable Gray-Scott parameters (Du*dt < 0.5). */
  Du?: number;
  Dv?: number;
  dt?: number;
}

/**
 * Run N RD ping-pong update steps. After this returns, the current
 * texture holds the latest field state.
 */
export function stepRD(
  ctx: GrayScottContext,
  uniforms: RDStepUniforms,
  iterations = 2,
): void {
  const { gl, rdProgram, width, height, fbos, textures } = ctx;
  const Du = uniforms.Du ?? 0.16;
  const Dv = uniforms.Dv ?? 0.08;
  const dt = uniforms.dt ?? 1.0;

  gl.useProgram(rdProgram.program);
  gl.viewport(0, 0, width, height);
  gl.bindVertexArray(ctx.quadVAO);

  for (let i = 0; i < iterations; i++) {
    const readIdx = ctx.current;
    const writeIdx = (1 - ctx.current) as 0 | 1;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[writeIdx]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textures[readIdx]);
    gl.uniform1i(rdProgram.uPrev, 0);
    gl.uniform2f(rdProgram.uTexel, 1 / width, 1 / height);
    gl.uniform1f(rdProgram.uF, uniforms.F);
    gl.uniform1f(rdProgram.uK, uniforms.k);
    gl.uniform1f(rdProgram.uDu, Du);
    gl.uniform1f(rdProgram.uDv, Dv);
    gl.uniform1f(rdProgram.uDt, dt);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    ctx.current = writeIdx;
  }
}

/**
 * Render the current field texture to the canvas (default framebuffer),
 * applying the amber/rust colorization + side-color tint.
 */
export function renderDisplay(
  ctx: GrayScottContext,
  sideTint: [number, number, number] = [0, 0, 0],
): void {
  const { gl, displayProgram, textures } = ctx;
  gl.useProgram(displayProgram.program);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, textures[ctx.current]);
  gl.uniform1i(displayProgram.uField, 0);
  gl.uniform3f(displayProgram.uSideTint, sideTint[0], sideTint[1], sideTint[2]);
  gl.bindVertexArray(ctx.quadVAO);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

export interface Deposit {
  x: number;
  y: number;
  /** 0 = U channel, 1 = V channel. */
  channel: 0 | 1;
  strength: number;
  /** Brush radius in cells (1 = 3x3, 2 = 5x5, etc). */
  radius?: number;
}

/**
 * Additively paint chemistry into the current frame's texture. Reads
 * the current FBO into a CPU Float32Array, stamps Gaussian halos,
 * uploads back. Fast enough at 384x240 (~0.15ms/call).
 */
export function depositBrush(ctx: GrayScottContext, deposits: Deposit[]): void {
  if (deposits.length === 0) return;
  const { gl, width, height, textures, current, fbos } = ctx;
  const px = new Float32Array(width * height * 2);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbos[current]);
  gl.readPixels(0, 0, width, height, gl.RG, gl.FLOAT, px);
  for (const d of deposits) {
    const r = d.radius ?? 1;
    const gx = Math.round(d.x);
    const gy = Math.round(d.y);
    for (let dy = -r; dy <= r; dy++) {
      const y = gy + dy;
      if (y < 0 || y >= height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const x = gx + dx;
        if (x < 0 || x >= width) continue;
        const dist2 = dx * dx + dy * dy;
        if (dist2 > r * r) continue;
        const falloff = Math.exp(-dist2 / (2 * r * r));
        px[(y * width + x) * 2 + d.channel] += d.strength * falloff;
      }
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, textures[current]);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RG, gl.FLOAT, px);
}

export function destroyGrayScottContext(ctx: GrayScottContext): void {
  const { gl } = ctx;
  gl.deleteFramebuffer(ctx.fbos[0]);
  gl.deleteFramebuffer(ctx.fbos[1]);
  gl.deleteTexture(ctx.textures[0]);
  gl.deleteTexture(ctx.textures[1]);
  gl.deleteProgram(ctx.rdProgram.program);
  gl.deleteProgram(ctx.displayProgram.program);
  gl.deleteVertexArray(ctx.quadVAO);
}
