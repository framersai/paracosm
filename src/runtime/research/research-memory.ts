/**
 * Research Memory: AgentOS Memory-backed research retrieval.
 *
 * Ingests citations from a scenario's KnowledgeBundle into a semantic
 * memory store. During simulation, crisis keywords drive semantic recall
 * instead of static category lookup.
 *
 * Falls back to static knowledge base if Memory init fails.
 */

import type { CrisisResearchPacket } from '../contracts.js';
import type { KnowledgeBundle } from '../../engine/types.js';

let _memory: any = null;
let _initialized = false;
let _initPromise: Promise<void> | null = null;
let _lastKnowledge: KnowledgeBundle | null = null;
/**
 * Per-simulation cache of recall results. Keyed by `${query}|${keywords}|${category}`.
 * Two events with the same researchKeywords + category in one simulation
 * share the same packet without re-hitting the memory store or live search.
 * Reset by `closeResearchMemory()` between runs.
 */
const _recallCache = new Map<string, CrisisResearchPacket>();

/** Flatten a KnowledgeBundle into ingestion entries */
function flattenKnowledgeBundle(
  bundle: KnowledgeBundle,
): Array<{ claim: string; source: string; url: string; doi?: string; topics: string[] }> {
  const entries: Array<{ claim: string; source: string; url: string; doi?: string; topics: string[] }> = [];

  for (const [topic, data] of Object.entries(bundle.topics)) {
    for (const f of data.canonicalFacts) {
      entries.push({ claim: f.claim, source: f.source, url: f.url, doi: f.doi, topics: [topic] });
    }
    for (const c of data.counterpoints) {
      entries.push({ claim: c.claim, source: c.source, url: c.url, topics: [topic] });
    }
  }

  return entries;
}

/**
 * Initialize the research memory with citations from a scenario's knowledge bundle.
 * If no bundle is provided, skips ingestion (memory stays empty, fallback will be used).
 */
export async function initResearchMemory(knowledge?: KnowledgeBundle): Promise<boolean> {
  if (_initialized) return true;
  if (_initPromise) return _initPromise.then(() => _initialized);

  _initPromise = (async () => {
    _lastKnowledge = knowledge || null;
    try {
      const { AgentMemory } = await import('@framers/agentos');
      _memory = await AgentMemory.sqlite({ path: ':memory:' });

      if (knowledge) {
        const entries = flattenKnowledgeBundle(knowledge);
        console.log(`  [research-memory] Ingesting ${entries.length} citations from scenario knowledge...`);

        for (const entry of entries) {
          await _memory.remember(
            `${entry.claim} [${entry.source}](${entry.url})${entry.doi ? ` DOI:${entry.doi}` : ''}`,
            { tags: entry.topics, importance: 0.8 },
          );
        }

        console.log(`  [research-memory] Ready: ${entries.length} citations in memory`);
      } else {
        console.log(`  [research-memory] No knowledge bundle provided, memory empty (will use static fallback)`);
      }

      _initialized = true;
    } catch (err) {
      console.log(`  [research-memory] Init failed (will use static fallback): ${err}`);
      _initialized = false;
    }
  })();

  await _initPromise;
  return _initialized;
}

/** Recall research relevant to a crisis query. Memoized per simulation. */
export async function recallResearch(query: string, keywords: string[] = [], category: string = 'infrastructure'): Promise<CrisisResearchPacket> {
  // Memoization key: same researchKeywords + category in two events share the
  // same packet without re-hitting memory or live search. Reset per simulation.
  const cacheKey = `${query}|${keywords.slice(0, 4).join(',')}|${category}`;
  const cached = _recallCache.get(cacheKey);
  if (cached) return cached;

  if (!_memory || !_initialized) {
    // Fallback to scenario-aware research from knowledge bundle
    const { getResearchFromBundle } = await import('./scenario-research.js');
    // Use stored knowledge bundle if available, otherwise fall back to legacy
    let packet: CrisisResearchPacket;
    if (_lastKnowledge) {
      packet = getResearchFromBundle(_lastKnowledge, category, keywords);
    } else {
      const { getResearchForCategory } = await import('./knowledge-base.js');
      packet = getResearchForCategory(category, keywords);
    }
    _recallCache.set(cacheKey, packet);
    return packet;
  }

  const searchQuery = [query, ...keywords.slice(0, 3)].join(' ');
  let results: any[];
  try {
    const raw = await _memory.recall(searchQuery, { limit: 6 });
    results = Array.isArray(raw) ? raw : [];
  } catch {
    results = [];
  }

  const facts: CrisisResearchPacket['canonicalFacts'] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const content = r.trace?.content || '';
    const match = content.match(/^(.+?)\s*\[(.+?)\]\((.+?)\)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      const doiMatch = content.match(/DOI:(\S+)/);
      facts.push({
        claim: match[1].trim(),
        source: match[2],
        url: match[3],
        ...(doiMatch ? { doi: doiMatch[1] } : {}),
      });
    }
  }

  const packet: CrisisResearchPacket = {
    canonicalFacts: facts,
    counterpoints: [],
    departmentNotes: {},
  };
  _recallCache.set(cacheKey, packet);
  return packet;
}

/** Clean up memory on simulation end */
export async function closeResearchMemory(): Promise<void> {
  if (_memory) {
    try { await _memory.close(); } catch {}
    _memory = null;
    _initialized = false;
    _initPromise = null;
    _lastKnowledge = null;
  }
  _recallCache.clear();
}
