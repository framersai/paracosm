import type { LlmProvider } from '../types.js';

/** Provider credentials accepted by hosted routes and runtime calls. */
export interface ProviderCredentialOptions {
  /** OpenAI API key. Historical dashboard field name. */
  apiKey?: string;
  /** Anthropic API key. */
  anthropicKey?: string;
}

/** Search-provider credentials accepted by setup/run paths. */
export interface SearchCredentialOptions {
  serperKey?: string;
  firecrawlKey?: string;
  tavilyKey?: string;
  braveKey?: string;
  cohereKey?: string;
}

export type RuntimeCredentialOptions = ProviderCredentialOptions & SearchCredentialOptions;

/**
 * Return a usable secret or undefined for empty and masked placeholder
 * values. The dashboard persists masks such as "sk-..."; those must
 * never replace a real server-side key.
 */
export function normalizeCredential(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.includes('...')) return undefined;
  return trimmed;
}

/** True when either supported LLM provider has a real explicit key. */
export function hasProviderCredentials(credentials: ProviderCredentialOptions): boolean {
  return !!(normalizeCredential(credentials.apiKey) || normalizeCredential(credentials.anthropicKey));
}

/**
 * Infer provider from explicit keys. A single real key is treated as
 * user intent; when both are present, the caller's provider selection
 * remains authoritative.
 */
export function inferProviderFromCredentials(
  credentials: ProviderCredentialOptions,
): LlmProvider | undefined {
  const hasOpenAI = !!normalizeCredential(credentials.apiKey);
  const hasAnthropic = !!normalizeCredential(credentials.anthropicKey);
  if (hasOpenAI && !hasAnthropic) return 'openai';
  if (hasAnthropic && !hasOpenAI) return 'anthropic';
  return undefined;
}

/** Resolve provider, preferring unambiguous explicit-key intent. */
export function resolveProviderFromCredentials(
  requested: LlmProvider | undefined,
  credentials: ProviderCredentialOptions,
  fallback: LlmProvider = 'openai',
): LlmProvider {
  return inferProviderFromCredentials(credentials) ?? requested ?? fallback;
}

/** Return the explicit API key for the selected provider, if present. */
export function apiKeyForProvider(
  provider: LlmProvider,
  credentials: ProviderCredentialOptions,
): string | undefined {
  return provider === 'anthropic'
    ? normalizeCredential(credentials.anthropicKey)
    : normalizeCredential(credentials.apiKey);
}

/** Stable non-secret identity for cache keys that must vary by credential. */
export function credentialFingerprint(value: string | undefined): string {
  const key = normalizeCredential(value);
  if (!key) return 'env';
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/** Explicit search key first, then host env fallback. */
export function searchCredential(
  explicitValue: unknown,
  envName: string,
  env: NodeJS.ProcessEnv | undefined = typeof process !== 'undefined' ? process.env : undefined,
): string | undefined {
  return normalizeCredential(explicitValue) ?? normalizeCredential(env?.[envName]);
}
