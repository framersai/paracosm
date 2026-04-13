/**
 * Research Memory: AgentOS Memory-backed research retrieval.
 *
 * Replaces the static category-indexed knowledge base with a semantic
 * memory store. On initialization, all DOI-linked citations from the
 * static knowledge base are ingested. During simulation, crisis keywords
 * drive semantic recall instead of category lookup.
 *
 * Falls back to static knowledge base if Memory init fails.
 */

import type { CrisisResearchPacket } from '../agents/contracts.js';

let _memory: any = null;
let _initialized = false;
let _initPromise: Promise<void> | null = null;

/** All static research entries flattened for ingestion */
function getStaticResearchEntries(): Array<{ claim: string; source: string; url: string; doi?: string; topics: string[] }> {
  // Import synchronously since this is a static dataset
  const entries: Array<{ claim: string; source: string; url: string; doi?: string; topics: string[] }> = [];

  const KNOWLEDGE: Record<string, { canonicalFacts: Array<{ claim: string; source: string; url: string; doi?: string }>; counterpoints: Array<{ claim: string; source: string; url: string }> }> = {
    radiation: {
      canonicalFacts: [
        { claim: 'Mars surface radiation averages 0.67 mSv/day, approximately 20x Earth background', source: 'Hassler et al. 2014, Science', url: 'https://doi.org/10.1126/science.1244797', doi: '10.1126/science.1244797' },
        { claim: 'NASA radiation risk model establishes dose-response for astronaut cancer risk', source: 'Cucinotta et al. 2010', url: 'https://doi.org/10.1667/RR2397.1', doi: '10.1667/RR2397.1' },
        { claim: 'September 2017 solar event measured by Curiosity RAD showed significant dose spike', source: 'Guo et al. 2018, GRL', url: 'https://doi.org/10.1029/2018GL077731', doi: '10.1029/2018GL077731' },
      ],
      counterpoints: [],
    },
    water: {
      canonicalFacts: [
        { claim: 'Mars subsurface ice confirmed at multiple latitudes by MARSIS and SHARAD radar', source: 'Plaut et al. 2007', url: 'https://doi.org/10.1126/science.1139672', doi: '10.1126/science.1139672' },
        { claim: 'MOXIE on Perseverance demonstrated in-situ oxygen extraction from Mars atmosphere', source: 'NASA Mars 2020', url: 'https://mars.nasa.gov/mars2020/spacecraft/instruments/moxie/' },
      ],
      counterpoints: [
        { claim: 'Deep drilling risks contaminating pristine subsurface aquifers with biological material', source: 'Planetary protection protocols', url: 'https://planetaryprotection.nasa.gov/' },
      ],
    },
    psychology: {
      canonicalFacts: [
        { claim: 'Mars-500 study observed depression, altered sleep cycles, and social withdrawal in 520-day isolation', source: 'Basner et al. 2014, PNAS', url: 'https://doi.org/10.1073/pnas.1212646110', doi: '10.1073/pnas.1212646110' },
        { claim: 'Antarctic overwinter studies document psychological effects of long-term isolation', source: 'Palinkas & Suedfeld 2008', url: 'https://doi.org/10.1146/annurev.psych.58.110405.085726', doi: '10.1146/annurev.psych.58.110405.085726' },
      ],
      counterpoints: [],
    },
    'bone-density': {
      canonicalFacts: [
        { claim: 'ISS bone density studies show significant loss in microgravity', source: 'Sibonga et al. 2019, npj Microgravity', url: 'https://doi.org/10.1038/s41526-019-0075-2', doi: '10.1038/s41526-019-0075-2' },
        { claim: 'Mars gravity is 3.72 m/s2 (38% of Earth)', source: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
        { claim: 'Cardiovascular adaptation in spaceflight includes cardiac chamber enlargement', source: 'Hughson et al. 2018, CMAJ', url: 'https://doi.org/10.1503/cmaj.180343', doi: '10.1503/cmaj.180343' },
      ],
      counterpoints: [],
    },
    perchlorate: {
      canonicalFacts: [
        { claim: 'Phoenix lander detected 0.5-1% calcium perchlorate in Mars soil globally', source: 'Hecht et al. 2009, Science', url: 'https://doi.org/10.1126/science.1172339', doi: '10.1126/science.1172339' },
        { claim: 'Perchlorate-reducing bacteria (Dechloromonas) can bioremediate contaminated soil', source: 'Davila et al. 2013', url: 'https://doi.org/10.1089/ast.2013.0995', doi: '10.1089/ast.2013.0995' },
      ],
      counterpoints: [],
    },
    terraforming: {
      canonicalFacts: [
        { claim: 'Jakosky & Edwards (2018) concluded Mars lacks sufficient CO2 for significant atmospheric thickening', source: 'Jakosky & Edwards 2018, Nature Astronomy', url: 'https://doi.org/10.1038/s41550-018-0529-6', doi: '10.1038/s41550-018-0529-6' },
        { claim: 'Zubrin & McKay (1993) argued terraforming is feasible with sufficient energy input', source: 'Zubrin & McKay 1993', url: 'https://doi.org/10.1089/153110703769016389', doi: '10.1089/153110703769016389' },
      ],
      counterpoints: [
        { claim: 'Mars atmospheric pressure is 0.6 kPa vs Earth 101.3 kPa. Gap is enormous.', source: 'NASA Mars Fact Sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
      ],
    },
    infrastructure: {
      canonicalFacts: [
        { claim: 'NASA ECLSS regenerative life support on ISS supports 6-7 crew on ~11,000 kg system', source: 'NASA ECLSS', url: 'https://www.nasa.gov/humans-in-space/eclss/' },
        { claim: 'Arcadia Planitia contains extensive subsurface ice deposits detected by MARSIS radar', source: 'Mars Express MARSIS', url: 'https://www.esa.int/Science_Exploration/Space_Science/Mars_Express' },
      ],
      counterpoints: [],
    },
    governance: {
      canonicalFacts: [
        { claim: 'Communication delay makes real-time governance of off-world colonies impractical', source: 'Zubrin 1996, The Case for Mars', url: 'https://en.wikipedia.org/wiki/The_Case_for_Mars' },
      ],
      counterpoints: [],
    },
  };

  for (const [topic, data] of Object.entries(KNOWLEDGE)) {
    for (const f of data.canonicalFacts) {
      entries.push({ ...f, topics: [topic] });
    }
    for (const c of data.counterpoints) {
      entries.push({ claim: c.claim, source: c.source, url: c.url, topics: [topic] });
    }
  }
  return entries;
}

/** Initialize the research memory with all static citations */
export async function initResearchMemory(): Promise<boolean> {
  if (_initialized) return true;
  if (_initPromise) return _initPromise.then(() => _initialized);

  _initPromise = (async () => {
    try {
      const { AgentMemory } = await import('@framers/agentos');
      _memory = await AgentMemory.sqlite({ path: ':memory:' });

      const entries = getStaticResearchEntries();
      console.log(`  [research-memory] Ingesting ${entries.length} citations...`);

      for (const entry of entries) {
        await _memory.remember(
          `${entry.claim} [${entry.source}](${entry.url})${entry.doi ? ` DOI:${entry.doi}` : ''}`,
          { tags: entry.topics, importance: 0.8 },
        );
      }

      _initialized = true;
      console.log(`  [research-memory] Ready: ${entries.length} citations in memory`);
    } catch (err) {
      console.log(`  [research-memory] Init failed (will use static fallback): ${err}`);
      _initialized = false;
    }
  })();

  await _initPromise;
  return _initialized;
}

/** Recall research relevant to a crisis query */
export async function recallResearch(query: string, keywords: string[] = [], category: string = 'infrastructure'): Promise<CrisisResearchPacket> {
  if (!_memory || !_initialized) {
    // Fallback to static with the actual crisis category
    const { getResearchForCategory } = await import('./knowledge-base.js');
    return getResearchForCategory(category, keywords);
  }

  const searchQuery = [query, ...keywords.slice(0, 3)].join(' ');
  const results = await _memory.recall(searchQuery, { limit: 6 });

  const facts: CrisisResearchPacket['canonicalFacts'] = [];
  const seen = new Set<string>();

  for (const r of results) {
    const content = r.trace?.content || '';
    // Parse out the claim, source, and url from the stored format
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

  return {
    canonicalFacts: facts,
    counterpoints: [],
    departmentNotes: {},
  };
}

/** Clean up memory on simulation end */
export async function closeResearchMemory(): Promise<void> {
  if (_memory) {
    try { await _memory.close(); } catch {}
    _memory = null;
    _initialized = false;
    _initPromise = null;
  }
}
