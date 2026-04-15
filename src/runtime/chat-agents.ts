/**
 * @fileoverview Colonist Chat Agents — post-simulation character chat powered by AgentOS.
 *
 * Each colonist gets a real AgentOS `agent()` instance with:
 * - HEXACO personality profile from the simulation
 * - Episodic memory seeded with their simulation experiences
 * - Full conversation history managed automatically
 * - RAG retrieval over simulation events before each reply
 *
 * Agents are created lazily on first chat message (~2-3s init).
 * A pool of max 10 agents is maintained with LRU eviction.
 *
 * @module paracosm/runtime/chat-agents
 */

import { agent as createAgent, AgentMemory } from '@framers/agentos';
import type { LlmProvider } from '../engine/types.js';

// ============================================================================
// Types
// ============================================================================

/** Colonist data extracted from simulation events. */
export interface ColonistProfile {
  agentId: string;
  name: string;
  age?: number;
  marsborn?: boolean;
  role?: string;
  department?: string;
  specialization?: string;
  hexaco?: { O?: number; C?: number; E?: number; A?: number; Em?: number; HH?: number };
  psychScore?: number;
  boneDensity?: number;
  radiation?: number;
}

/** A simulation event relevant to a colonist. */
export interface ColonistMemoryEntry {
  type: 'reaction' | 'crisis' | 'department' | 'decision' | 'outcome';
  turn: number;
  year: number;
  text: string;
  tags: string[];
}

/** Pool entry for a live chat agent. */
interface PoolEntry {
  agent: ReturnType<typeof createAgent>;
  session: ReturnType<ReturnType<typeof createAgent>['session']>;
  lastUsed: number;
  colonistName: string;
}

// ============================================================================
// Agent Pool
// ============================================================================

const MAX_POOL_SIZE = 10;
const pool = new Map<string, PoolEntry>();

/**
 * Get or create a chat agent for a colonist.
 *
 * On first call for a given colonist: creates an `agent()` instance,
 * initializes in-memory SQLite memory, seeds it with simulation data,
 * and opens a session. Takes ~2-3 seconds.
 *
 * On subsequent calls: returns the existing agent session instantly.
 *
 * @param colonist - The colonist's profile from simulation data.
 * @param memories - Simulation events to seed into the colonist's memory.
 * @param opts - Provider and scenario configuration.
 * @returns The agent session's `send()` method result.
 */
export async function getOrCreateChatAgent(
  colonist: ColonistProfile,
  memories: ColonistMemoryEntry[],
  opts: { provider?: LlmProvider; settlementNoun?: string; populationNoun?: string },
): Promise<{ session: PoolEntry['session']; isNew: boolean }> {
  const key = colonist.agentId;

  // Return existing agent if available
  const existing = pool.get(key);
  if (existing) {
    existing.lastUsed = Date.now();
    return { session: existing.session, isNew: false };
  }

  // Evict LRU if pool is full
  if (pool.size >= MAX_POOL_SIZE) {
    let oldestKey = '';
    let oldestTime = Infinity;
    for (const [k, v] of pool) {
      if (v.lastUsed < oldestTime) { oldestKey = k; oldestTime = v.lastUsed; }
    }
    if (oldestKey) {
      const evicted = pool.get(oldestKey);
      if (evicted) {
        try { evicted.agent.close(); } catch { /* ignore */ }
      }
      pool.delete(oldestKey);
      console.log(`  [chat] Evicted agent: ${evicted?.colonistName || oldestKey}`);
    }
  }

  // Create new agent with memory
  console.log(`  [chat] Creating agent for ${colonist.name}...`);
  const memoryProvider = await AgentMemory.sqlite({ path: ':memory:' });

  // Seed memory with simulation experiences
  for (const entry of memories) {
    await memoryProvider.remember(entry.text, { tags: entry.tags, importance: 0.8 });
  }
  console.log(`  [chat] Seeded ${memories.length} memories for ${colonist.name}`);

  // Map HEXACO shorthand to full trait names
  const personality = colonist.hexaco ? {
    openness: colonist.hexaco.O ?? 0.5,
    conscientiousness: colonist.hexaco.C ?? 0.5,
    extraversion: colonist.hexaco.E ?? 0.5,
    agreeableness: colonist.hexaco.A ?? 0.5,
    emotionality: colonist.hexaco.Em ?? 0.5,
    honesty: colonist.hexaco.HH ?? 0.5,
  } : undefined;

  const settlement = opts.settlementNoun ?? 'colony';
  const popNoun = opts.populationNoun ?? 'colonist';

  const instructions = buildInstructions(colonist, settlement, popNoun);

  const chatAgent = createAgent({
    provider: opts.provider || 'openai',
    model: 'gpt-4o-mini',
    name: colonist.name,
    instructions,
    personality,
    memory: { types: ['episodic', 'semantic'] },
    memoryProvider,
  });

  const session = chatAgent.session(key);
  const entry: PoolEntry = { agent: chatAgent, session, lastUsed: Date.now(), colonistName: colonist.name };
  pool.set(key, entry);

  return { session, isNew: true };
}

/**
 * Build the system prompt instructions for a colonist chat agent.
 * Grounding information only: identity, role, personality description.
 * Simulation data lives in memory and is retrieved via RAG.
 */
function buildInstructions(colonist: ColonistProfile, settlement: string, popNoun: string): string {
  const lines: string[] = [];

  lines.push(`You are ${colonist.name}, a ${popNoun.replace(/s$/, '')} at the ${settlement}.`);

  if (colonist.age) lines.push(`Age: ${colonist.age}.`);
  if (colonist.marsborn !== undefined) lines.push(colonist.marsborn ? 'Born on Mars.' : 'Born on Earth.');
  if (colonist.role && colonist.department) lines.push(`Role: ${colonist.role} in ${colonist.department}.`);
  if (colonist.specialization) lines.push(`Specialization: ${colonist.specialization}.`);

  // HEXACO personality as behavioral descriptors
  if (colonist.hexaco) {
    const h = colonist.hexaco;
    const traits: string[] = [];
    if ((h.O ?? 0.5) > 0.7) traits.push('curious and open to new ideas');
    if ((h.O ?? 0.5) < 0.3) traits.push('practical and conventional');
    if ((h.C ?? 0.5) > 0.7) traits.push('disciplined and thorough');
    if ((h.C ?? 0.5) < 0.3) traits.push('flexible and spontaneous');
    if ((h.E ?? 0.5) > 0.7) traits.push('sociable and talkative');
    if ((h.E ?? 0.5) < 0.3) traits.push('reserved and quiet');
    if ((h.A ?? 0.5) > 0.7) traits.push('patient and cooperative');
    if ((h.A ?? 0.5) < 0.3) traits.push('direct and critical');
    if ((h.Em ?? 0.5) > 0.7) traits.push('emotionally sensitive');
    if ((h.Em ?? 0.5) < 0.3) traits.push('calm and detached');
    if ((h.HH ?? 0.5) > 0.7) traits.push('honest and straightforward');
    if ((h.HH ?? 0.5) < 0.3) traits.push('shrewd and self-interested');
    if (traits.length) lines.push(`Personality: ${traits.join(', ')}.`);
  }

  lines.push('');
  lines.push('Stay in character. Be direct, personal, emotional. Reference your actual experiences from the simulation when relevant. Your memories of simulation events will be provided automatically. Do not contradict anything you have previously said in this conversation. 2-4 sentences per response.');

  return lines.join(' ');
}

/**
 * Extract memory entries for a colonist from simulation SSE events.
 *
 * Ingests: personal reactions, crises witnessed, department reports
 * from their department, commander decisions, and outcomes.
 */
export function extractColonistMemories(
  agentId: string,
  simEvents: Array<{ type: string; leader: string; data: Record<string, unknown> }>,
): ColonistMemoryEntry[] {
  const memories: ColonistMemoryEntry[] = [];

  for (const evt of simEvents) {
    const d = evt.data || {};
    const turn = (d.turn as number) || 0;
    const year = (d.year as number) || 0;

    // Personal reactions
    if (evt.type === 'agent_reactions') {
      const reactions = (d.reactions as Array<Record<string, unknown>>) || [];
      for (const r of reactions) {
        if (r.agentId === agentId || String(r.name || '').toLowerCase().includes(agentId.toLowerCase())) {
          memories.push({
            type: 'reaction',
            turn, year,
            text: `Turn ${turn} (Year ${year}): I felt ${r.mood}. My reaction: "${r.quote}"`,
            tags: ['personal', 'reaction', `turn-${turn}`],
          });
        }
      }
    }

    // Crises (the colonist witnessed these)
    if (evt.type === 'turn_start' && d.title && d.title !== 'Director generating...') {
      memories.push({
        type: 'crisis',
        turn, year,
        text: `Turn ${turn} (Year ${year}): Crisis "${d.title}" (${d.category}). ${String(d.crisis || d.turnSummary || '').slice(0, 300)}`,
        tags: ['crisis', String(d.category), `turn-${turn}`],
      });
    }

    // Department reports (for departments the colonist might work in)
    if (evt.type === 'dept_done') {
      memories.push({
        type: 'department',
        turn, year,
        text: `Turn ${turn} ${d.department} department report: ${String(d.summary || '').slice(0, 300)}`,
        tags: ['department', String(d.department), `turn-${turn}`],
      });
    }

    // Commander decisions
    if (evt.type === 'commander_decided') {
      memories.push({
        type: 'decision',
        turn, year,
        text: `Turn ${turn}: The commander decided: ${String(d.decision || '').slice(0, 300)}`,
        tags: ['decision', `turn-${turn}`],
      });
    }

    // Outcomes
    if (evt.type === 'outcome') {
      memories.push({
        type: 'outcome',
        turn, year,
        text: `Turn ${turn}: Outcome was ${d.outcome}. Colony effects applied.`,
        tags: ['outcome', `turn-${turn}`],
      });
    }
  }

  return memories;
}

/** Get pool stats for the /results API. */
export function getPoolStats(): { active: number; maxSize: number; agents: string[] } {
  return {
    active: pool.size,
    maxSize: MAX_POOL_SIZE,
    agents: Array.from(pool.values()).map(e => e.colonistName),
  };
}

/** Clear all agents from the pool. */
export function clearPool(): void {
  for (const entry of pool.values()) {
    try { entry.agent.close(); } catch { /* ignore */ }
  }
  pool.clear();
}
