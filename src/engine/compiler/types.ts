/**
 * Shared types for the scenario compiler module.
 */

import type { LlmProvider } from '../types.js';

/** Function signature for LLM text generation calls. */
export type GenerateTextFn = (prompt: string) => Promise<string>;

/** Options for compileScenario(). */
export interface CompileOptions {
  /** LLM provider to use for hook generation. */
  provider?: LlmProvider;
  /** Model name for hook generation. */
  model?: string;
  /** Whether to use disk caching. Default: true. */
  cache?: boolean;
  /** Base directory for the disk cache. Default: '.paracosm/cache'. */
  cacheDir?: string;
  /** Custom generateText function (overrides provider/model). */
  generateText?: GenerateTextFn;
  /** Progress callback for each hook being generated. */
  onProgress?: (hookName: string, status: 'generating' | 'cached' | 'done' | 'fallback') => void;
  /** Seed text to ingest into the scenario's knowledge bundle via LLM extraction + optional web search. */
  seedText?: string;
  /** Seed URL to fetch and ingest. If set, seedText is ignored. */
  seedUrl?: string;
  /** Enable live web search during seed ingestion. Requires search API keys. Default: true. */
  webSearch?: boolean;
  /** Max web searches during seed ingestion. Default: 5. */
  maxSearches?: number;
}
