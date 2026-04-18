/**
 * HEXACO trajectory cue — converts a `hexacoHistory` array + current
 * profile into a concise prose line the LLM can read as "how I've
 * evolved since I took command."
 *
 * Thresholds match the kernel's drift rate cap from progression.ts
 * (±0.05/turn): 0.05 is the minimum meaningful drift, 0.15 is three
 * full-cap turns' worth and qualifies as "substantially."
 *
 * @module paracosm/runtime/hexaco-cues/trajectory
 */
import { HEXACO_TRAITS, type HexacoProfile, type HexacoSnapshot } from '../../engine/core/state.js';

const MIN_DRIFT = 0.05;         // floor: one full-cap turn of pull
const SUBSTANTIAL_DRIFT = 0.15; // three turns' worth

/**
 * Build a prose cue describing personality drift since the first
 * snapshot in `history`. Returns an empty string when drift is too
 * small to be meaningful, or when history has no baseline.
 */
export function buildTrajectoryCue(
  history: HexacoSnapshot[],
  current: HexacoProfile,
): string {
  if (history.length < 1) return '';
  const baseline = history[0].hexaco;

  const lines: string[] = [];
  for (const trait of HEXACO_TRAITS) {
    const delta = current[trait] - baseline[trait];
    if (Math.abs(delta) < MIN_DRIFT) continue;
    const direction = delta > 0 ? 'toward' : 'away from';
    const displayTrait = trait === 'honestyHumility' ? 'honesty-humility' : trait;
    const magnitude = Math.abs(delta) >= SUBSTANTIAL_DRIFT ? 'substantially' : 'measurably';
    lines.push(`${magnitude} ${direction} higher ${displayTrait}`);
  }

  if (!lines.length) return '';
  return `Since you took command, your personality has drifted ${lines.join(' and ')}. Notice how recent decisions have shaped your judgment.`;
}
