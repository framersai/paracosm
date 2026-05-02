/**
 * `paracosm/swarm` — focused API surface for the agent-swarm view of a
 * paracosm run. Pairs with `paracosm/schema` (types) and
 * `paracosm/world-model` (run façade); use this module when you only
 * need swarm inspection without pulling the full WorldModel surface.
 *
 * @example
 * ```ts
 * import { getSwarm, swarmByDepartment, moodHistogram } from 'paracosm/swarm';
 *
 * const swarm = getSwarm(runArtifact);
 * if (swarm) {
 *   console.log(`${swarm.population} agents`);
 *   console.log(swarmByDepartment(runArtifact));
 *   console.log(moodHistogram(swarm));
 * }
 * ```
 *
 * Every function is a pure projection over the public `RunArtifact`
 * shape. No I/O, no side effects, no live LLM calls.
 *
 * @module paracosm/swarm
 */
import type { RunArtifact, SwarmAgent, SwarmSnapshot } from '../../engine/schema/index.js';

export type { SwarmAgent, SwarmSnapshot };

/**
 * Final swarm snapshot from a run, or `undefined` when the run did not
 * produce one (e.g., `batch-point` mode that skipped the turn loop).
 */
export function getSwarm(artifact: RunArtifact): SwarmSnapshot | undefined {
  return artifact.finalSwarm;
}

/**
 * Group the swarm by department. Keys are department labels; values are
 * the agents in insertion order from the snapshot. Returns `{}` when
 * the artifact has no swarm.
 */
export function swarmByDepartment(artifact: RunArtifact): Record<string, SwarmAgent[]> {
  const swarm = artifact.finalSwarm;
  if (!swarm) return {};
  const out: Record<string, SwarmAgent[]> = {};
  for (const agent of swarm.agents) {
    const dept = agent.department || 'unassigned';
    if (!out[dept]) out[dept] = [];
    out[dept].push(agent);
  }
  return out;
}

/**
 * Parent agentId → direct child agentIds. Walk recursively to render
 * multi-generation family trees. Founders (no parent in the swarm) are
 * the roots. Returns `{}` when the artifact has no swarm or the
 * scenario does not track family edges.
 */
export function swarmFamilyTree(artifact: RunArtifact): Record<string, string[]> {
  const swarm = artifact.finalSwarm;
  if (!swarm) return {};
  const out: Record<string, string[]> = {};
  for (const agent of swarm.agents) {
    if (agent.childrenIds && agent.childrenIds.length > 0) {
      out[agent.agentId] = [...agent.childrenIds];
    }
  }
  return out;
}

/**
 * Number of alive agents at snapshot time.
 */
export function aliveCount(swarm: SwarmSnapshot): number {
  return swarm.agents.filter(a => a.alive).length;
}

/**
 * Number of dead agents at snapshot time. Counts every agent ever
 * present in the run, not just deaths-this-turn (use `swarm.deaths`
 * for the per-turn delta).
 */
export function deathCount(swarm: SwarmSnapshot): number {
  return swarm.agents.filter(a => !a.alive).length;
}

/**
 * Histogram of mood labels across alive agents — `{ focused: 12,
 * anxious: 5, ... }`. Excludes dead agents (they don't have a current
 * mood). Returns `{}` when no agents have a `mood` field set.
 */
export function moodHistogram(swarm: SwarmSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const agent of swarm.agents) {
    if (!agent.alive) continue;
    const mood = agent.mood;
    if (!mood) continue;
    out[mood] = (out[mood] ?? 0) + 1;
  }
  return out;
}

/**
 * Histogram of agents per department for the alive population. Useful
 * for org-chart staffing snapshots and capacity planning.
 */
export function departmentHeadcount(swarm: SwarmSnapshot): Record<string, number> {
  const out: Record<string, number> = {};
  for (const agent of swarm.agents) {
    if (!agent.alive) continue;
    const dept = agent.department || 'unassigned';
    out[dept] = (out[dept] ?? 0) + 1;
  }
  return out;
}
