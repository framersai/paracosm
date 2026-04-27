/**
 * Sample a small number array from a RunArtifact's trajectory so the
 * SmallMultiplesGrid cell can render a sparkline without fetching the
 * full artifact. Persisted to the runs table at insert time.
 *
 * @module paracosm/cli/server/run-summary-trajectory
 */
import type { RunArtifact } from '../../engine/schema/index.js';

export function extractSummaryTrajectory(artifact: Partial<RunArtifact>, n = 8): number[] {
  const points = artifact?.trajectory?.points;
  if (!Array.isArray(points) || points.length === 0) return [];
  if (points.length <= n) {
    return points.map(p => coerce(p?.value));
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor((i / (n - 1)) * (points.length - 1));
    out.push(coerce(points[idx]?.value));
  }
  return out;
}

function coerce(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return 0;
}
