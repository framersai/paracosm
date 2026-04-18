/**
 * Reaction cue translation — turns raw HEXACO numbers into 1-3 short
 * behavioral cue strings the reacting agent's LLM prompt can use directly.
 *
 * Thresholds 0.7 / 0.3 match the poles used in commander and dept-head
 * prompts so all trait-driven voice is uniform across the system.
 *
 * Output is capped at 3 cues (selection: first-hit across trait order)
 * to keep per-agent batch blocks small. Reactions batch at 10 agents/call
 * so every 10 extra tokens per agent compounds.
 *
 * @module paracosm/runtime/hexaco-cues/translation
 */
import type { HexacoProfile } from '../../engine/core/state.js';

const MAX_CUES = 3;

/**
 * Turn a HEXACO profile into a concise cue string like
 * "Your inner voice: you feel events in your body before words; you look for
 * what this moment makes possible." Empty string when no trait is
 * polarized past the thresholds.
 */
export function buildReactionCues(h: HexacoProfile): string {
  const cues: string[] = [];

  if (h.emotionality > 0.7) cues.push('you feel events in your body before words');
  if (h.emotionality < 0.3) cues.push('you stay flat when others panic');

  if (h.openness > 0.7) cues.push('you look for what this moment makes possible');
  if (h.openness < 0.3) cues.push('you stick to what has worked');

  if (h.honestyHumility > 0.7) cues.push('you say what you really think');
  if (h.honestyHumility < 0.3) cues.push('you speak strategically, not confessionally');

  if (h.conscientiousness > 0.7) cues.push('you want a plan before you move');
  if (h.conscientiousness < 0.3) cues.push('you move first and adjust mid-stride');

  if (h.extraversion > 0.7) cues.push('you say it out loud rather than sit with it');
  if (h.extraversion < 0.3) cues.push('you process inward and speak only after');

  if (h.agreeableness > 0.7) cues.push('you want to hold the group together through this');
  if (h.agreeableness < 0.3) cues.push("you don't owe anyone smoothness right now");

  if (cues.length === 0) return '';
  return `Your inner voice: ${cues.slice(0, MAX_CUES).join('; ')}.`;
}
