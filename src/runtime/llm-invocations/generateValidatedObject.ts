/**
 * One-shot schema-validated LLM call, wrapping AgentOS's generateObject
 * with paracosm's run-level observability (cost tracking, provider error
 * classification) and a caller-provided fallback on validation failure.
 *
 * Use this for LLM calls that DO NOT need conversation memory: director,
 * reactions, verdict. Session-based call sites (commander, departments)
 * use sendAndValidate instead.
 *
 * @module paracosm/runtime/llm-invocations/generateValidatedObject
 */
import {
  generateObject as agentosGenerateObject,
  ObjectGenerationError,
} from '@framers/agentos';
import type { ZodType, z } from 'zod';

export interface ValidatedObjectOptions<T extends ZodType> {
  provider: string;
  model: string;
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  /** Cached system block (goes through systemBlocks with cacheBreakpoint:true). */
  systemCacheable?: string;
  /** Non-cached system content appended after the cached block. */
  systemTail?: string;
  prompt: string;
  maxRetries?: number;
  onUsage?: (r: { usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number } }) => void;
  onProviderError?: (err: unknown) => void;
  /**
   * Fires when schema validation exhausts retries and the wrapper falls
   * back to the caller-provided default. Separate from `onProviderError`
   * so callers can distinguish quota / auth failures from model
   * misbehavior on schema. Orchestrator uses this to emit a
   * `validation_fallback` SSE event so the dashboard can surface the
   * fallback state instead of silently showing degraded data.
   */
  onValidationFallback?: (details: { rawText: string; schemaName?: string; err: unknown }) => void;
  fallback?: z.infer<T>;
  /**
   * Dependency-injection hook for tests. Production callers omit this
   * and let the default AgentOS import take effect.
   *
   * @internal
   */
  _generateObjectImpl?: typeof agentosGenerateObject;
}

export interface ValidatedObjectResult<T> {
  object: T;
  fromFallback: boolean;
  rawText: string;
  usage?: { totalTokens?: number; promptTokens?: number; completionTokens?: number; costUSD?: number };
}

/**
 * Call AgentOS generateObject with paracosm's cost-tracking and fallback
 * conventions. On `ObjectGenerationError`, fires onProviderError and
 * either returns the caller's fallback (marked fromFallback:true) or
 * re-throws if no fallback was supplied.
 */
export async function generateValidatedObject<T extends ZodType>(
  opts: ValidatedObjectOptions<T>,
): Promise<ValidatedObjectResult<z.infer<T>>> {
  const impl = opts._generateObjectImpl ?? agentosGenerateObject;

  const systemBlocks: Array<{ text: string; cacheBreakpoint?: boolean }> = [];
  if (opts.systemCacheable) systemBlocks.push({ text: opts.systemCacheable, cacheBreakpoint: true });
  if (opts.systemTail) systemBlocks.push({ text: opts.systemTail });

  try {
    const result = await impl({
      provider: opts.provider,
      model: opts.model,
      schema: opts.schema,
      schemaName: opts.schemaName,
      schemaDescription: opts.schemaDescription,
      system: systemBlocks.length ? systemBlocks : undefined,
      prompt: opts.prompt,
      maxRetries: opts.maxRetries,
    });
    opts.onUsage?.({ usage: result.usage });
    return {
      object: result.object,
      fromFallback: false,
      rawText: result.text,
      usage: result.usage,
    };
  } catch (err) {
    opts.onProviderError?.(err);
    if (err instanceof ObjectGenerationError && opts.fallback !== undefined) {
      opts.onValidationFallback?.({
        rawText: err.rawText,
        schemaName: opts.schemaName,
        err,
      });
      return {
        object: opts.fallback,
        fromFallback: true,
        rawText: err.rawText,
      };
    }
    throw err;
  }
}
