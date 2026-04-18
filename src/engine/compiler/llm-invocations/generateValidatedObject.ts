/**
 * Compile-side Zod-validated one-shot LLM wrapper.
 *
 * Mirrors the runtime's generateValidatedObject (src/runtime/llm-invocations/
 * generateValidatedObject.ts) but lives under src/engine/ to preserve the
 * engine-cannot-import-runtime boundary. Both wrap AgentOS generateObject
 * with paracosm's observability conventions (cost tracking, validation
 * fallback, provider-error forwarding).
 *
 * @module paracosm/engine/compiler/llm-invocations/generateValidatedObject
 */
import { generateObject as agentosGenerateObject, ObjectGenerationError } from '@framers/agentos';
import type { ZodType, z } from 'zod';

export interface ValidatedObjectOptions<T extends ZodType> {
  provider: string;
  model: string;
  schema: T;
  schemaName?: string;
  schemaDescription?: string;
  /** Cached system block (wrapped in cacheBreakpoint:true automatically). */
  systemCacheable?: string;
  /** Non-cached system content appended after the cached block. */
  systemTail?: string;
  prompt: string;
  maxRetries?: number;
  onUsage?: (r: { usage?: unknown }) => void;
  onProviderError?: (err: unknown) => void;
  /**
   * Fires when retries exhaust and fallback is used. Separate from
   * onProviderError so quota/auth failures are distinguishable from
   * schema-validation misbehavior.
   */
  onValidationFallback?: (details: { rawText: string; schemaName?: string; err: unknown }) => void;
  fallback?: z.infer<T>;
  /** Test-only injection point. */
  _generateObjectImpl?: typeof agentosGenerateObject;
}

export interface ValidatedObjectResult<T> {
  object: T;
  fromFallback: boolean;
  rawText: string;
  usage?: unknown;
  attempts: number;
}

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
    opts.onUsage?.({ usage: (result as { usage?: unknown }).usage });
    return {
      object: result.object,
      fromFallback: false,
      rawText: (result as { text?: string }).text ?? '',
      usage: (result as { usage?: unknown }).usage,
      attempts: 1,
    };
  } catch (err) {
    opts.onProviderError?.(err);
    if (err instanceof ObjectGenerationError && opts.fallback !== undefined) {
      opts.onValidationFallback?.({
        rawText: err.rawText ?? '',
        schemaName: opts.schemaName,
        err,
      });
      return {
        object: opts.fallback,
        fromFallback: true,
        rawText: err.rawText ?? '',
        attempts: (opts.maxRetries ?? 2) + 1,
      };
    }
    throw err;
  }
}
