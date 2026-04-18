/**
 * Shared utilities across automaton modes. Kept small and pure so
 * MOOD, FORGE, and ECOLOGY can import from one place without pulling
 * React or the canvas component.
 */

/** 7 mood strings the backend emits via CellSnapshot.mood + r.mood. */
export type MoodKey =
  | 'positive'
  | 'hopeful'
  | 'neutral'
  | 'anxious'
  | 'negative'
  | 'defiant'
  | 'resigned';

export type AutomatonMode = 'mood' | 'forge' | 'ecology';

export const MOOD_HEX: Record<MoodKey, string> = {
  positive: '#6aad48',
  hopeful: '#9acd60',
  neutral: '#6b5f50',
  anxious: '#e8b44a',
  negative: '#e06530',
  defiant: '#c44a1e',
  resigned: '#a89878',
};

/** Map a mood string to its [R,G,B] in 0-255. Tolerates unknown values. */
export function moodRgb(mood: string | undefined): [number, number, number] {
  const hex = MOOD_HEX[(mood ?? 'neutral') as MoodKey] ?? MOOD_HEX.neutral;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Linear blend two RGB triples. t in [0,1]. */
export function blendRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const u = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] * (1 - u) + b[0] * u),
    Math.round(a[1] * (1 - u) + b[1] * u),
    Math.round(a[2] * (1 - u) + b[2] * u),
  ];
}

export function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

/** Cubic ease-out. Used for mood interpolation + band height transitions. */
export function easeOutCubic(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - u, 3);
}

/**
 * Scale a canvas to the device pixel ratio so strokes/dots stay crisp
 * on hi-dpi screens without growing the logical coordinate system the
 * drawing code uses.
 */
export function scaleCanvasForDpr(
  canvas: HTMLCanvasElement,
  logicalWidth: number,
  logicalHeight: number,
): CanvasRenderingContext2D | null {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  canvas.width = Math.round(logicalWidth * dpr);
  canvas.height = Math.round(logicalHeight * dpr);
  canvas.style.width = `${logicalWidth}px`;
  canvas.style.height = `${logicalHeight}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

/**
 * Small seeded PRNG (mulberry32). Keeps automaton layout deterministic
 * across mounts so the same sim produces the same cell arrangement.
 */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string for seeding the PRNG per-side. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export const DEFAULT_BAND_HEIGHT = 360;
export const ECOLOGY_BAND_HEIGHT = 440;
export const COLLAPSED_BAND_HEIGHT = 16;
export const MOBILE_BAND_HEIGHT = 180;
/** Maximize mode: automaton fills the panel, tile sections hidden. */
export const MAX_BAND_HEIGHT_VH = 70;
