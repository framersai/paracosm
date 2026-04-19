import type { ActiveFlare } from './flareQueue.js';

const FLARE_COLORS: Record<string, string> = {
  birth: 'rgba(154, 205, 96, 0.8)',
  death: 'rgba(168, 152, 120, 0.7)',
  forge_approved: 'rgba(232, 180, 74, 0.8)',
  forge_rejected: 'rgba(224, 101, 48, 0.7)',
  reuse: 'rgba(232, 180, 74, 0.6)',
  crisis: 'rgba(196, 74, 30, 0.8)',
};

/** Draw visible flare symbols + rings on top of the RD field. */
export function drawFlares(ctx: CanvasRenderingContext2D, flares: ActiveFlare[]): void {
  ctx.save();
  for (const f of flares) {
    const color = FLARE_COLORS[f.kind] ?? 'rgba(255,255,255,0.6)';
    const t = f.progress;
    const fade = 1 - t;
    ctx.globalAlpha = fade;
    if (f.kind === 'birth' || f.kind === 'death' || f.kind === 'crisis') {
      const r = 4 + t * 14;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (f.kind === 'reuse' && typeof f.endX === 'number' && typeof f.endY === 'number') {
      const cx = f.x + (f.endX - f.x) * t;
      const cy = f.y + (f.endY - f.y) * t;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(f.x, f.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
