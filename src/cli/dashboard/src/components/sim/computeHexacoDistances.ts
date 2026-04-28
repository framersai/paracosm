/**
 * Pure helper: pairwise HEXACO Euclidean distance, normalized against
 * the observed max so the brightest edges always reflect the closest
 * pair in the visible set (regardless of how clustered or spread the
 * actors happen to be). Missing per-axis values default to 0.5 to
 * keep early-stream actors that haven't broadcast HEXACO yet from
 * tanking the layout.
 *
 * @module paracosm/dashboard/sim/computeHexacoDistances
 */

const HEXACO_AXES = [
  'openness', 'conscientiousness', 'extraversion',
  'agreeableness', 'emotionality', 'honestyHumility',
] as const;

export interface ActorTraitProfile {
  name: string;
  hexaco: Record<string, number>;
}

export interface DistancePair {
  a: string;
  b: string;
  distance: number;
  normalized: number;
}

export interface DistanceResult {
  pairs: DistancePair[];
}

export function computeHexacoDistances(actors: ActorTraitProfile[]): DistanceResult {
  if (actors.length < 2) return { pairs: [] };

  const raw: DistancePair[] = [];
  for (let i = 0; i < actors.length; i += 1) {
    for (let j = i + 1; j < actors.length; j += 1) {
      const a = actors[i];
      const b = actors[j];
      let sumSq = 0;
      for (const axis of HEXACO_AXES) {
        const av = typeof a.hexaco[axis] === 'number' ? a.hexaco[axis] : 0.5;
        const bv = typeof b.hexaco[axis] === 'number' ? b.hexaco[axis] : 0.5;
        const d = av - bv;
        sumSq += d * d;
      }
      raw.push({ a: a.name, b: b.name, distance: Math.sqrt(sumSq), normalized: 0 });
    }
  }

  // Normalize against the observed max so contrast stays visible even
  // when actors cluster tightly. When max is 0 (all identical), every
  // normalized value is 0.
  const max = raw.reduce((m, p) => Math.max(m, p.distance), 0);
  for (const p of raw) {
    p.normalized = max > 0 ? p.distance / max : 0;
  }

  return { pairs: raw };
}
