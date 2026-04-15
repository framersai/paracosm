import type { ForceNode } from './viz-types';
import { DEPARTMENT_COLORS, DEFAULT_DEPT_COLOR, RANK_SIZES } from './viz-types';

const VERT_SRC = `#version 300 es
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_center;
layout(location=2) in float a_radius;
layout(location=3) in vec4 a_color;
out vec2 v_uv;
out vec4 v_color;
uniform vec2 u_resolution;
void main() {
  v_uv = a_position;
  v_color = a_color;
  vec2 pos = a_center + a_position * a_radius;
  vec2 clip = (pos / u_resolution) * 2.0 - 1.0;
  clip.y = -clip.y;
  gl_Position = vec4(clip, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 v_uv;
in vec4 v_color;
out vec4 fragColor;
void main() {
  float dist = length(v_uv);
  float alpha = smoothstep(1.0, 0.2, dist) * v_color.a;
  fragColor = vec4(v_color.rgb, alpha);
}`;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
}

export class GlowRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private instanceBuffer: WebGLBuffer | null = null;
  private resolutionLoc: WebGLUniformLocation | null = null;
  private particles: Particle[] = [];
  private fallbackMode = false;

  init(canvas: HTMLCanvasElement): boolean {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
    if (!gl) {
      this.fallbackMode = true;
      return false;
    }

    this.gl = gl;
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    const vs = this.compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vs || !fs) { this.fallbackMode = true; return false; }

    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      this.fallbackMode = true;
      return false;
    }
    this.program = program;
    this.resolutionLoc = gl.getUniformLocation(program, 'u_resolution');

    const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    const quadBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);

    this.instanceBuffer = gl.createBuffer()!;

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Instance attributes: center(2) + radius(1) + color(4) = 7 floats = 28 bytes
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 28, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 28, 8);
    gl.vertexAttribDivisor(2, 1);

    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 28, 12);
    gl.vertexAttribDivisor(3, 1);

    gl.bindVertexArray(null);
    return true;
  }

  render(nodes: ForceNode[], width: number, height: number): void {
    if (this.fallbackMode || !this.gl) return;

    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const alive = nodes.filter(n => n.alive && n.psychScore > 0.3);
    if (alive.length === 0) return;

    const data = new Float32Array(alive.length * 7);
    for (let i = 0; i < alive.length; i++) {
      const n = alive[i];
      const size = RANK_SIZES[n.rank] || 8;
      const radius = size * 2.5;
      const hex = DEPARTMENT_COLORS[n.department] || DEFAULT_DEPT_COLOR;
      const r = parseInt(hex.slice(1, 3), 16) / 255;
      const g = parseInt(hex.slice(3, 5), 16) / 255;
      const b = parseInt(hex.slice(5, 7), 16) / 255;
      const a = n.psychScore * 0.4;

      const off = i * 7;
      data[off] = n.x;
      data[off + 1] = n.y;
      data[off + 2] = radius;
      data[off + 3] = r;
      data[off + 4] = g;
      data[off + 5] = b;
      data[off + 6] = a;
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.resolutionLoc, width, height);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, alive.length);
    gl.bindVertexArray(null);
  }

  spawnDeathParticles(x: number, y: number, department: string): void {
    const color = DEPARTMENT_COLORS[department] || DEFAULT_DEPT_COLOR;
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.random() * 0.3;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * (1 + Math.random() * 2),
        vy: Math.sin(angle) * (1 + Math.random() * 2),
        life: 0,
        maxLife: 30,
        color,
      });
    }
  }

  renderParticles(ctx: CanvasRenderingContext2D): void {
    this.particles = this.particles.filter(p => p.life < p.maxLife);
    for (const p of this.particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.life++;
      const alpha = 1 - p.life / p.maxLife;
      const size = 2 * (1 - p.life / p.maxLife);
      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  dispose(): void {
    if (this.gl && this.program) {
      this.gl.deleteProgram(this.program);
    }
    this.gl = null;
    this.program = null;
  }

  get isFallback(): boolean {
    return this.fallbackMode;
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('[GlowRenderer] Shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }
}
