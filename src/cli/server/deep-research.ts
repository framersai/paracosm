/**
 * Quickstart "Ground with citations" stage. Takes a freshly-compiled
 * ScenarioPackage and runs it through a small batch of Serper web
 * searches, returning citations the actor-generation + run prompts
 * can ground against. The goal is "the simulation is informed by real
 * sources" rather than "every claim cites a footnote" — we surface 3-5
 * citations per derived query, deduplicated by URL.
 *
 * Why Serper rather than the wilds-ai deep-research stack: Serper is a
 * plain HTTPS POST + JSON response and has no internal-package
 * dependencies (no Cohere reranker, no Tavily, no Firecrawl). Paracosm
 * already has SERPER_API_KEY in .env, so this works without new deps.
 * The wilds-ai stack is preferable when reranking quality matters
 * (game-design research, lore enrichment), but for a 4-second grounding
 * pass a single search provider is enough — the LLM judge that consumes
 * citations will weight them by reading the snippets.
 *
 * @module paracosm/cli/server/deep-research
 */
import type { ScenarioPackage } from '../../engine/types.js';

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

export interface SerperResult {
  /** Result title from Serper. */
  title: string;
  /** Canonical URL of the source. */
  link: string;
  /** Free-text snippet from Serper, usually 100-200 chars. */
  snippet: string;
  /** Optional date string, present for news-style results. */
  date?: string;
  /** Origin domain (e.g. "wikipedia.org"); derived from `link`. */
  domain: string;
}

export interface GroundingCitation {
  /** Query that surfaced this result. Useful for showing the user
   *  WHY a particular source was attached. */
  query: string;
  /** Top results for that query (deduplicated by URL across queries). */
  sources: SerperResult[];
}

export interface GroundingProgressEvent {
  /** Phase tag drives the log-line tone in the Quickstart card. */
  kind: 'query_started' | 'query_done' | 'query_failed' | 'complete';
  /** Query string. Populated for query_started/query_done/query_failed. */
  query?: string;
  /** Result count. Populated for query_done/complete. */
  resultCount?: number;
  /** Total citations collected so far. Populated for query_done/complete. */
  totalCitations?: number;
  /** Error message. Populated for query_failed. */
  error?: string;
  /** Wall-clock ms since the grounding pass started. */
  elapsedMs: number;
}

export interface GroundingResult {
  /** Per-query citation buckets. */
  citations: GroundingCitation[];
  /** Total unique sources across all queries. */
  totalSources: number;
  /** Wall-clock duration of the grounding pass in ms. */
  durationMs: number;
  /** Queries that returned 0 results or failed. Used to surface gaps. */
  emptyQueries: string[];
}

/**
 * Derive 3 search queries from the ScenarioPackage. We pick the
 * scenario's primary subject (compiled from the seed text), one
 * department-or-context query, and one crisis-flavored query so the
 * citations cover the world's setting + people + threats. Queries are
 * generic enough that Serper finds Wikipedia/news/research links
 * rather than Twitter or random forums.
 */
export function deriveGroundingQueries(scenario: ScenarioPackage): string[] {
  const queries: string[] = [];
  const subject = scenario.labels?.name || scenario.id || 'simulation scenario';
  queries.push(subject);

  // Department or context query: pick the first department label that
  // looks domain-ish (avoid generic "Operations", "Leadership"). Falls
  // back to the settlement noun + the scenario subject when no
  // departments survive the filter.
  const dept = (scenario.departments ?? [])
    .map((d) => d.label || d.id)
    .find((label) => !!label && label.length > 4 && !/operations|leadership|admin/i.test(label));
  if (dept) {
    queries.push(`${dept} best practices`);
  } else if (scenario.labels?.settlementNoun) {
    queries.push(`${scenario.labels.settlementNoun} ${subject}`);
  }

  // Crisis-flavored query so the run's stress-test events have
  // grounding. EventDefinition is the closest thing to a "crisis" in
  // ScenarioPackage; we pick the first event label that isn't a generic
  // "decision" / "outcome" wrapper.
  const eventLabel = (scenario.events ?? [])
    .map((e) => e.label)
    .find((label) => !!label && !/decision|outcome|notice/i.test(label));
  if (eventLabel) {
    queries.push(`${eventLabel} response strategies`);
  } else {
    queries.push(`${subject} crisis decision making`);
  }

  return [...new Set(queries.filter(Boolean))].slice(0, 3);
}

/** Extract the registrable domain (host minus leading "www.") from a URL. */
function urlDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

interface SerperRawResult {
  title?: string;
  link?: string;
  snippet?: string;
  date?: string;
}

/**
 * One Serper search. Returns up to `maxResults` unique results. Throws
 * on network/parse errors so the caller can mark the query as failed
 * in its progress log; never returns null/undefined.
 */
export async function searchSerper(
  query: string,
  apiKey: string,
  maxResults = 5,
  fetchImpl: typeof fetch = fetch,
): Promise<SerperResult[]> {
  const res = await fetchImpl(SERPER_ENDPOINT, {
    method: 'POST',
    headers: {
      'X-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ q: query, num: maxResults }),
  });
  if (!res.ok) {
    throw new Error(`Serper HTTP ${res.status}: ${await res.text().catch(() => '<no body>')}`);
  }
  const body = (await res.json()) as { organic?: SerperRawResult[] };
  const organic = body.organic ?? [];
  return organic
    .filter((r): r is SerperRawResult & { title: string; link: string } =>
      typeof r.title === 'string' && typeof r.link === 'string')
    .slice(0, maxResults)
    .map((r) => ({
      title: r.title,
      link: r.link,
      snippet: typeof r.snippet === 'string' ? r.snippet : '',
      date: typeof r.date === 'string' ? r.date : undefined,
      domain: urlDomain(r.link),
    }));
}

/**
 * Run the grounding pass for a scenario. Calls searchSerper for each
 * derived query in parallel, deduplicates results by URL across
 * queries, and emits progress callbacks for the Quickstart UI.
 *
 * Returns null when SERPER_API_KEY is not set so the caller can skip
 * the whole stage gracefully (rather than fail the run).
 */
export async function groundScenario(
  scenario: ScenarioPackage,
  options: {
    serperApiKey?: string;
    maxResultsPerQuery?: number;
    onProgress?: (event: GroundingProgressEvent) => void;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<GroundingResult | null> {
  const apiKey = options.serperApiKey ?? process.env.SERPER_API_KEY;
  if (!apiKey) return null;
  const maxPerQuery = options.maxResultsPerQuery ?? 5;
  const fetchImpl = options.fetchImpl ?? fetch;

  const t0 = Date.now();
  const queries = deriveGroundingQueries(scenario);
  const seenUrls = new Set<string>();
  const citations: GroundingCitation[] = [];
  const emptyQueries: string[] = [];

  // Run all queries in parallel — Serper is rate-limited per minute
  // not per second, so 3 simultaneous calls are well under any cap.
  await Promise.all(
    queries.map(async (q) => {
      options.onProgress?.({
        kind: 'query_started',
        query: q,
        elapsedMs: Date.now() - t0,
      });
      try {
        const raw = await searchSerper(q, apiKey, maxPerQuery, fetchImpl);
        const deduped = raw.filter((r) => {
          if (seenUrls.has(r.link)) return false;
          seenUrls.add(r.link);
          return true;
        });
        if (deduped.length === 0) emptyQueries.push(q);
        citations.push({ query: q, sources: deduped });
        options.onProgress?.({
          kind: 'query_done',
          query: q,
          resultCount: deduped.length,
          totalCitations: seenUrls.size,
          elapsedMs: Date.now() - t0,
        });
      } catch (err) {
        emptyQueries.push(q);
        citations.push({ query: q, sources: [] });
        options.onProgress?.({
          kind: 'query_failed',
          query: q,
          error: err instanceof Error ? err.message : String(err),
          elapsedMs: Date.now() - t0,
        });
      }
    }),
  );

  const result: GroundingResult = {
    citations,
    totalSources: seenUrls.size,
    durationMs: Date.now() - t0,
    emptyQueries,
  };
  options.onProgress?.({
    kind: 'complete',
    totalCitations: seenUrls.size,
    elapsedMs: result.durationMs,
  });
  return result;
}
