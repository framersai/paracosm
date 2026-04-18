/**
 * Compile-time telemetry aggregator. Collects attempts and fallbacks
 * per hook during a single compileScenario() invocation, then exposes
 * a snapshot shaped for /retry-stats ring-buffer persistence.
 *
 * Schema names are synthesized as `compile:<hookName>` so /retry-stats
 * can report compile + runtime schemas under one uniform rollup.
 *
 * @module paracosm/engine/compiler/telemetry
 */

export interface CompilerFallback {
  hookName: string;
  rawText: string;
  reason: string;
  attempts: number;
  timestamp: number;
}

export interface CompilerTelemetrySnapshot {
  schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }>;
  fallbacks: CompilerFallback[];
}

export interface CompilerTelemetry {
  recordAttempt(hookName: string, attempts: number, fromFallback: boolean): void;
  recordFallback(hookName: string, details: { rawText: string; reason: string; attempts: number }): void;
  snapshot(): CompilerTelemetrySnapshot;
}

export function createCompilerTelemetry(): CompilerTelemetry {
  const schemaRetries: Record<string, { calls: number; attempts: number; fallbacks: number }> = {};
  const fallbacks: CompilerFallback[] = [];

  const bucket = (hookName: string) => {
    const key = `compile:${hookName}`;
    if (!schemaRetries[key]) schemaRetries[key] = { calls: 0, attempts: 0, fallbacks: 0 };
    return schemaRetries[key];
  };

  return {
    recordAttempt(hookName, attempts, fromFallback) {
      const b = bucket(hookName);
      b.calls += 1;
      b.attempts += attempts;
      if (fromFallback) b.fallbacks += 1;
    },
    recordFallback(hookName, details) {
      const b = bucket(hookName);
      b.calls += 1;
      b.attempts += details.attempts;
      b.fallbacks += 1;
      fallbacks.push({
        hookName,
        rawText: details.rawText,
        reason: details.reason,
        attempts: details.attempts,
        timestamp: Date.now(),
      });
    },
    snapshot() {
      return {
        schemaRetries: JSON.parse(JSON.stringify(schemaRetries)),
        fallbacks: [...fallbacks],
      };
    },
  };
}
