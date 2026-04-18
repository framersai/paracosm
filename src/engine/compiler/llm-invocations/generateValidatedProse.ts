/**
 * Prose-producing compile hook wrapper. Used by the director
 * instructions generator, which returns a system-prompt string rather
 * than executable code.
 *
 * @module paracosm/engine/compiler/llm-invocations/generateValidatedProse
 */
import type { GenerateTextFn } from '../types.js';
import type { CompilerTelemetry } from '../telemetry.js';

const MAX_PRIOR_OUTPUT_CHARS = 2000;

export type ProseValidator = (text: string) => { ok: true } | { ok: false; reason: string };

export interface ValidatedProseOptions {
  hookName: string;
  systemCacheable: string;
  prompt: string;
  validate: ProseValidator;
  fallback: string;
  maxRetries?: number;
  generateText: GenerateTextFn;
  telemetry?: CompilerTelemetry;
}

export interface ValidatedProseResult {
  text: string;
  attempts: number;
  fromFallback: boolean;
  failedRawText?: string;
  failedReason?: string;
}

function buildRetryPrompt(originalPrompt: string, priorText: string, reason: string): string {
  const excerpt = priorText.length > MAX_PRIOR_OUTPUT_CHARS
    ? priorText.slice(-MAX_PRIOR_OUTPUT_CHARS)
    : priorText;
  return `${originalPrompt}\n\nPrevious attempt failed: ${reason}\n\nYOUR PRIOR OUTPUT:\n\`\`\`\n${excerpt}\n\`\`\`\n\nFix the specific issue named above. Return ONLY the corrected text. No markdown fences, no explanation.`;
}

export async function generateValidatedProse(
  opts: ValidatedProseOptions,
): Promise<ValidatedProseResult> {
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
    });
    lastRawText = text;
    const cleaned = text.trim().replace(/^```(?:text)?\n?/i, '').replace(/\n?```$/i, '').trim();

    const verdict = opts.validate(cleaned);
    if (verdict.ok) {
      opts.telemetry?.recordAttempt(opts.hookName, attempt + 1, false);
      return { text: cleaned, attempts: attempt + 1, fromFallback: false };
    }
    lastReason = verdict.reason;
  }

  opts.telemetry?.recordFallback(opts.hookName, {
    rawText: lastRawText,
    reason: lastReason,
    attempts: maxRetries,
  });
  return {
    text: opts.fallback,
    attempts: maxRetries,
    fromFallback: true,
    failedRawText: lastRawText,
    failedReason: lastReason,
  };
}
