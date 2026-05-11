/**
 * Shared URL fetcher for CLI init + dashboard quickstart flows.
 *
 * AgentOS exposes WebSearchService from the `@framers/agentos/cognition/web-search`
 * subpath. The package root does not export it, and the service is a
 * search API rather than a single-URL scraper. This helper uses the real
 * search API when provider keys are configured, then falls back to direct
 * text/HTML fetch for ordinary public URLs.
 *
 * @module paracosm/cli/fetch-seed-url
 */

export interface FetchedSeedUrl {
  text: string;
  title: string;
  sourceUrl: string;
}

export interface WebSearchResultLike {
  url: string;
  title: string;
  snippet: string;
  content?: string;
}

export interface WebSearchClient {
  registerProvider: (provider: any) => void;
  hasProviders: () => boolean;
  search: (
    query: string,
    options?: { maxResults?: number; rerank?: boolean },
  ) => Promise<WebSearchResultLike[]>;
}

export type WebSearchServiceCtor = new (opts?: any) => WebSearchClient;
export type WebSearchProviderCtor = new (apiKey: string) => unknown;

export interface WebSearchModule {
  WebSearchService: WebSearchServiceCtor;
  FirecrawlProvider: WebSearchProviderCtor;
  TavilyProvider: WebSearchProviderCtor;
  SerperProvider: WebSearchProviderCtor;
  BraveProvider: WebSearchProviderCtor;
}

export type WebSearchImporter = () => Promise<WebSearchModule>;

export interface FetchSeedFromUrlOptions {
  importWebSearch?: WebSearchImporter;
  env?: NodeJS.ProcessEnv | Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export async function loadWebSearchModule(
  importWebSearch: WebSearchImporter = () => import('@framers/agentos/cognition/web-search'),
): Promise<WebSearchModule> {
  return importWebSearch();
}

function registerConfiguredProviders(
  service: WebSearchClient,
  mod: WebSearchModule,
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
): void {
  if (env.FIRECRAWL_API_KEY) service.registerProvider(new mod.FirecrawlProvider(env.FIRECRAWL_API_KEY));
  if (env.TAVILY_API_KEY) service.registerProvider(new mod.TavilyProvider(env.TAVILY_API_KEY));
  if (env.SERPER_API_KEY) service.registerProvider(new mod.SerperProvider(env.SERPER_API_KEY));
  if (env.BRAVE_API_KEY) service.registerProvider(new mod.BraveProvider(env.BRAVE_API_KEY));
}

function normalizeUrlForCompare(raw: string): string {
  try {
    const url = new URL(raw);
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return raw.replace(/\/$/, '');
  }
}

async function fetchViaAgentOSSearch(
  url: string,
  options: FetchSeedFromUrlOptions,
): Promise<FetchedSeedUrl | null> {
  const mod = await loadWebSearchModule(options.importWebSearch);
  const service = new mod.WebSearchService({ maxResults: 5 });
  registerConfiguredProviders(service, mod, options.env ?? process.env);
  if (!service.hasProviders()) return null;

  const results = await service.search(url, { maxResults: 5, rerank: false });
  if (results.length === 0) return null;

  const wanted = normalizeUrlForCompare(url);
  const exact = results.find((result) => normalizeUrlForCompare(result.url) === wanted);
  const withContent = results.find((result) => typeof result.content === 'string' && result.content.trim().length > 0);
  const result = exact ?? withContent ?? results[0];
  const text = (result.content || result.snippet || '').trim();
  if (!text) return null;
  return {
    text,
    title: result.title || '',
    sourceUrl: url,
  };
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractTitleFromHtml(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeBasicHtmlEntities(match[1].replace(/\s+/g, ' ').trim()) : '';
}

function stripHtmlToText(html: string): string {
  return decodeBasicHtmlEntities(
    html
      .replace(/<head[\s\S]*?<\/head>/gi, ' ')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

async function fetchDirectly(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<FetchedSeedUrl> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'text/html,text/plain,application/xhtml+xml;q=0.9,*/*;q=0.1' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const contentType = res.headers.get('content-type') || '';
  const raw = await res.text();
  const isHtml = /\bhtml\b/i.test(contentType) || /<html[\s>]/i.test(raw);
  return {
    text: isHtml ? stripHtmlToText(raw) : raw.trim(),
    title: isHtml ? extractTitleFromHtml(raw) : '',
    sourceUrl: url,
  };
}

export async function fetchSeedFromUrl(
  url: string,
  options: FetchSeedFromUrlOptions = {},
): Promise<FetchedSeedUrl> {
  try {
    const viaSearch = await fetchViaAgentOSSearch(url, options);
    if (viaSearch) return viaSearch;
  } catch {
    // Fall through to direct fetch. Some AgentOS providers are search-only
    // and may reject exact URL lookups; public URLs can still be fetched.
  }
  return fetchDirectly(url, options.fetchImpl);
}
