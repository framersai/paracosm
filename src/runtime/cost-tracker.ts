/**
 * Per-run cost + token telemetry with per-stage buckets.
 *
 * Extracted from orchestrator.ts so the trackUsage / cache-savings math
 * has one home, testable in isolation from the turn loop. The tracker
 * is stateful (totals accumulate across every tagged LLM call) and
 * returns a buildCostPayload() helper the orchestrator invokes before
 * every SSE emit so the dashboard breakdown modal reflects the latest
 * per-stage split + cache hit rate.
 *
 * Pricing lookup comes from pricing.ts so MODEL_PRICING has one home.
 *
 * @module paracosm/runtime/cost-tracker
 */

import type { SimulationModelConfig } from '../engine/types.js';
import {
  buildPriceForSite,
  getDefaultPricing,
  type CostSite,
} from './pricing.js';

/** Token + cost rollup for a single pipeline stage across a run. */
export interface CostBucket {
  totalTokens: number;
  totalCostUSD: number;
  calls: number;
  /** Cache-read tokens billed at 0.1× input rate (prompt-cache hit). */
  cacheReadTokens: number;
  /** Cache-write tokens billed at 1.25× input rate (new cache entry). */
  cacheCreationTokens: number;
}

/** Shape of the `usage` field providers return on each LLM call. */
export interface CallUsage {
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  costUSD?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/** Per-stage entry on the breakdown payload attached to every SSE emit. */
export interface CostBreakdownEntry {
  totalTokens: number;
  totalCostUSD: number;
  calls: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  /** USD saved vs no-caching run. Negative during turn 1, positive turn 2+. */
  cacheSavingsUSD?: number;
}

/** Aggregate cost payload embedded on every SSE event's `_cost` field. */
export interface CostPayload {
  totalTokens: number;
  totalCostUSD: number;
  llmCalls: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  /** Run-wide USD saved by prompt caching vs a no-cache run. */
  cacheSavingsUSD: number;
  breakdown: Record<string, CostBreakdownEntry>;
  /**
   * Per-schema retry rollup. Populated once sendAndValidate / generateValidatedObject
   * start reporting attempt counts. Only present when at least one
   * schema-validated call completed.
   */
  schemaRetries?: Record<string, { attempts: number; calls: number; fallbacks: number }>;
}

/** Cost tracker bundle returned by createCostTracker. */
export interface CostTracker {
  /** Record token + cost usage from a single LLM call, tagged by site. */
  trackUsage(result: { usage?: CallUsage }, site?: CostSite): void;
  /**
   * Record that a schema-validated call finished — used for retry
   * telemetry. `attempts` is the count returned by the wrapper (1 =
   * first-try success, N = N-1 retries, maxRetries+1 = fallback).
   * Builds a per-schema rollup exposed in `finalCost().schemaRetries`.
   */
  recordSchemaAttempt(schemaName: string, attempts: number, fellBack: boolean): void;
  /** Build the _cost payload attached to every SSE event. */
  buildCostPayload(): CostPayload;
  /**
   * Final-run snapshot for the output JSON. Includes a per-schema
   * retry rollup when any schema-validated call reported its attempt
   * count; consumers use this to track LLM-reliability regressions
   * across runs on different models.
   */
  finalCost(): {
    totalTokens: number;
    totalCostUSD: number;
    llmCalls: number;
    schemaRetries?: Record<string, { attempts: number; calls: number; fallbacks: number }>;
  };
}

/**
 * Create a per-run cost tracker bound to a specific model config.
 *
 * Cache cost math: Anthropic bills cache_read at 0.10× input (saves
 * 0.90×) and cache_creation at 1.25× (costs +0.25×). Net savings per
 * site = (reads × 0.90 − creates × 0.25) × inputPrice. Turn 1 is a
 * net COST because the cache hasn't amortized. Turn 3+ with reads
 * dominating produces substantial savings.
 *
 * Fallback cost estimate (when provider omits costUSD) uses
 * commander-tier pricing as an approximation. Previously this path
 * ignored cache entirely so heavy-caching runs under-reported billed
 * amount by ~10-15%.
 */
export function createCostTracker(modelConfig: SimulationModelConfig): CostTracker {
  let totalTokens = 0;
  let totalCostUSD = 0;
  let llmCalls = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  /**
   * Per-schema retry rollup. Populated by recordSchemaAttempt when
   * sendAndValidate / generateValidatedObject return with an attempt
   * count. Empty when no schema-validated call site fed results in
   * (older call sites still using plain generateText bypass this).
   */
  const schemaRetries = new Map<string, { attempts: number; calls: number; fallbacks: number }>();

  const defaultPricing = getDefaultPricing(modelConfig);
  const priceForSite = buildPriceForSite(modelConfig);

  const newBucket = (): CostBucket => ({
    totalTokens: 0, totalCostUSD: 0, calls: 0,
    cacheReadTokens: 0, cacheCreationTokens: 0,
  });
  const costBySite: Record<CostSite, CostBucket> = {
    director: newBucket(),
    commander: newBucket(),
    departments: newBucket(),
    judge: newBucket(),
    reactions: newBucket(),
    other: newBucket(),
  };

  const trackUsage: CostTracker['trackUsage'] = (result, site = 'other') => {
    if (!result?.usage) return;
    const tokensThisCall = result.usage.totalTokens ?? 0;
    const callCacheRead = result.usage.cacheReadTokens ?? 0;
    const callCacheCreate = result.usage.cacheCreationTokens ?? 0;
    let costThisCall: number;
    if (typeof result.usage.costUSD === 'number') {
      costThisCall = result.usage.costUSD;
    } else {
      const input = result.usage.promptTokens ?? 0;
      const output = result.usage.completionTokens ?? 0;
      costThisCall =
        (input * defaultPricing.input / 1_000_000)
        + (output * defaultPricing.output / 1_000_000)
        + (callCacheRead * defaultPricing.input * 0.10 / 1_000_000)
        + (callCacheCreate * defaultPricing.input * 1.25 / 1_000_000);
    }
    totalTokens += tokensThisCall;
    totalCostUSD += costThisCall;
    llmCalls++;
    cacheReadTokens += callCacheRead;
    cacheCreationTokens += callCacheCreate;
    const bucket = costBySite[site];
    bucket.totalTokens += tokensThisCall;
    bucket.totalCostUSD += costThisCall;
    bucket.calls++;
    bucket.cacheReadTokens += callCacheRead;
    bucket.cacheCreationTokens += callCacheCreate;
  };

  const buildCostPayload: CostTracker['buildCostPayload'] = () => {
    let runCacheSavingsUSD = 0;
    const breakdown: Record<string, CostBreakdownEntry> = {};
    for (const [k, v] of Object.entries(costBySite)) {
      if (v.calls > 0) {
        const sitePricing = priceForSite(k as CostSite);
        const siteSavings =
          ((v.cacheReadTokens * 0.90) - (v.cacheCreationTokens * 0.25))
          * sitePricing.input / 1_000_000;
        runCacheSavingsUSD += siteSavings;
        breakdown[k] = {
          totalTokens: v.totalTokens,
          totalCostUSD: Math.round(v.totalCostUSD * 10000) / 10000,
          calls: v.calls,
          ...(v.cacheReadTokens > 0 ? { cacheReadTokens: v.cacheReadTokens } : {}),
          ...(v.cacheCreationTokens > 0 ? { cacheCreationTokens: v.cacheCreationTokens } : {}),
          ...(Math.abs(siteSavings) >= 0.0001
            ? { cacheSavingsUSD: Math.round(siteSavings * 10000) / 10000 }
            : {}),
        };
      }
    }
    const payload: CostPayload = {
      totalTokens,
      totalCostUSD: Math.round(totalCostUSD * 10000) / 10000,
      llmCalls,
      cacheReadTokens,
      cacheCreationTokens,
      cacheSavingsUSD: Math.round(runCacheSavingsUSD * 10000) / 10000,
      breakdown,
    };
    if (schemaRetries.size > 0) {
      payload.schemaRetries = Object.fromEntries(schemaRetries.entries());
    }
    return payload;
  };

  const recordSchemaAttempt: CostTracker['recordSchemaAttempt'] = (schemaName, attempts, fellBack) => {
    if (!schemaName) return;
    const existing = schemaRetries.get(schemaName) ?? { attempts: 0, calls: 0, fallbacks: 0 };
    schemaRetries.set(schemaName, {
      attempts: existing.attempts + attempts,
      calls: existing.calls + 1,
      fallbacks: existing.fallbacks + (fellBack ? 1 : 0),
    });
  };

  const finalCost: CostTracker['finalCost'] = () => {
    const out: ReturnType<CostTracker['finalCost']> = {
      totalTokens,
      totalCostUSD: Math.round(totalCostUSD * 10000) / 10000,
      llmCalls,
    };
    if (schemaRetries.size > 0) {
      out.schemaRetries = Object.fromEntries(schemaRetries.entries());
    }
    return out;
  };

  return { trackUsage, recordSchemaAttempt, buildCostPayload, finalCost };
}
