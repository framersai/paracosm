/**
 * JSON-producing compile hook wrapper. Parses + Zod-validates the
 * LLM's text output using the injected {@link GenerateTextFn} so
 * callers can substitute a mock for tests (the generateObject path
 * in AgentOS doesn't honor injected generateText mocks).
 *
 * Equivalent to runtime's sendAndValidate but one-shot (no session)
 * and without the session-memory plumbing — milestones doesn't need
 * conversation state.
 *
 * @module paracosm/engine/compiler/llm-invocations/generateValidatedJson
 */
import type { ZodType, ZodError, z } from 'zod';
import type { GenerateTextFn } from '../types.js';
import type { CompilerTelemetry } from '../telemetry.js';

const MAX_PRIOR_OUTPUT_CHARS = 2000;
const MAX_ZOD_ERRORS_IN_FEEDBACK = 5;

export interface ValidatedJsonOptions<T extends ZodType> {
  hookName: string;
  systemCacheable: string;
  prompt: string;
  schema: T;
  fallback: z.infer<T>;
  maxRetries?: number;
  /** Completion-token ceiling per call — caps tail spend on model yap. */
  maxTokens?: number;
  generateText: GenerateTextFn;
  telemetry?: CompilerTelemetry;
}

export interface ValidatedJsonResult<T> {
  object: T;
  source: string;
  attempts: number;
  fromFallback: boolean;
  failedRawText?: string;
  failedReason?: string;
}

function extractJsonObject(text: string): string | null {
  const cleaned = text.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  if (!cleaned) return null;
  // Try direct parse first
  try {
    JSON.parse(cleaned);
    return cleaned;
  } catch { /* fall through */ }
  // Greedy match: first `{` to last `}`
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null;
  const candidate = cleaned.slice(firstBrace, lastBrace + 1);
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return null;
  }
}

function summarizeZodErrors(err: ZodError): string {
  const issues = err.issues.slice(0, MAX_ZOD_ERRORS_IN_FEEDBACK);
  const lines = issues.map(i => `- ${i.path.join('.') || '<root>'}: ${i.message}`);
  if (err.issues.length > MAX_ZOD_ERRORS_IN_FEEDBACK) {
    lines.push(`(${err.issues.length - MAX_ZOD_ERRORS_IN_FEEDBACK} more issues omitted)`);
  }
  return lines.join('\n');
}

function buildRetryPrompt(originalPrompt: string, priorText: string, reason: string): string {
  const excerpt = priorText.length > MAX_PRIOR_OUTPUT_CHARS
    ? priorText.slice(-MAX_PRIOR_OUTPUT_CHARS)
    : priorText;
  return `${originalPrompt}\n\nPrevious attempt failed: ${reason}\n\nYOUR PRIOR OUTPUT (the JSON that failed):\n\`\`\`\n${excerpt}\n\`\`\`\n\nFix the specific issue named above. Return ONLY the corrected JSON object. No markdown fences, no explanation.`;
}

export async function generateValidatedJson<T extends ZodType>(
  opts: ValidatedJsonOptions<T>,
): Promise<ValidatedJsonResult<z.infer<T>>> {
  const maxRetries = opts.maxRetries ?? 3;
  let lastRawText = '';
  let lastReason = '';

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const prompt = attempt === 0
      ? opts.prompt
      : buildRetryPrompt(opts.prompt, lastRawText, lastReason);

    const text = await opts.generateText({
      system: [{ text: opts.systemCacheable, cacheBreakpoint: true }],
      prompt,
      maxTokens: opts.maxTokens,
    });
    lastRawText = text;

    const jsonStr = extractJsonObject(text);
    if (jsonStr === null) {
      lastReason = 'no JSON object found in response';
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (err) {
      lastReason = `JSON.parse failed: ${(err as Error).message}`;
      continue;
    }
    const validation = opts.schema.safeParse(parsed);
    if (validation.success) {
      opts.telemetry?.recordAttempt(opts.hookName, attempt + 1, false);
      return {
        object: validation.data,
        source: JSON.stringify(validation.data, null, 2),
        attempts: attempt + 1,
        fromFallback: false,
      };
    }
    lastReason = summarizeZodErrors(validation.error);
  }

  opts.telemetry?.recordFallback(opts.hookName, {
    rawText: lastRawText,
    reason: lastReason,
    attempts: maxRetries,
  });
  return {
    object: opts.fallback,
    source: JSON.stringify(opts.fallback, null, 2),
    attempts: maxRetries,
    fromFallback: true,
    failedRawText: lastRawText,
    failedReason: lastReason,
  };
}
