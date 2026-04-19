import {
  createGrayScottContext,
  destroyGrayScottContext,
  stepRD,
  renderDisplay,
  depositBrush,
  type GrayScottContext,
  type Deposit,
} from './grayScott.js';

export interface GridRendererOptions {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
}

export interface FrameInputs {
  F: number;
  k: number;
  deposits: Deposit[];
  sideTint: [number, number, number];
  /** Steps per frame: 2 under default cadence, 5 during turn fast-forward. */
  stepsPerFrame?: number;
}

/**
 * One instance per leader. Wraps a `GrayScottContext`, drives one
 * rendered frame per rAF callback via `tick()`. Owns the WebGL2 context;
 * caller invokes `destroy()` on unmount.
 */
export class GridRenderer {
  private ctx: GrayScottContext;

  constructor(opts: GridRendererOptions) {
    const gl = opts.canvas.getContext('webgl2', {
      antialias: false,
      premultipliedAlpha: false,
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.ctx = createGrayScottContext(gl, opts.width, opts.height);
  }

  tick(inputs: FrameInputs): void {
    depositBrush(this.ctx, inputs.deposits);
    stepRD(this.ctx, { F: inputs.F, k: inputs.k }, inputs.stepsPerFrame ?? 2);
    renderDisplay(this.ctx, inputs.sideTint);
  }

  destroy(): void {
    destroyGrayScottContext(this.ctx);
  }

  get width(): number {
    return this.ctx.width;
  }
  get height(): number {
    return this.ctx.height;
  }
}
