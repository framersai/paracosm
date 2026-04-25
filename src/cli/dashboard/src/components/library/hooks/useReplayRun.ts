import * as React from 'react';
import { WorldModel } from '../../../../../runtime/world-model/index.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import { marsScenario } from '../../../../../engine/mars/index.js';
import { lunarScenario } from '../../../../../engine/lunar/index.js';

export type ReplayResult =
  | { kind: 'idle' }
  | { kind: 'inflight' }
  | { kind: 'match' }
  | { kind: 'diverged'; divergence: string }
  | { kind: 'error'; error: string };

export function useReplayRun(): {
  result: ReplayResult;
  replay: (artifact: RunArtifact) => Promise<void>;
  reset: () => void;
} {
  const [result, setResult] = React.useState<ReplayResult>({ kind: 'idle' });

  const replay = React.useCallback(async (artifact: RunArtifact) => {
    setResult({ kind: 'inflight' });
    try {
      const scenarioId = artifact.metadata.scenario.id;
      const scenario =
        scenarioId === marsScenario.id ? marsScenario :
        scenarioId === lunarScenario.id ? lunarScenario :
        null;
      if (!scenario) {
        setResult({ kind: 'error', error: `Scenario "${scenarioId}" is not available client-side; recompile from JSON to replay.` });
        return;
      }
      const wm = WorldModel.fromScenario(scenario);
      const r = await wm.replay(artifact);
      // Record asynchronously; failure to record is non-fatal.
      if (typeof fetch !== 'undefined') {
        fetch(`/api/v1/runs/${encodeURIComponent(artifact.metadata.runId)}/replay-result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ matches: r.matches }),
        }).catch(() => {});
      }
      if (r.matches) setResult({ kind: 'match' });
      else setResult({ kind: 'diverged', divergence: r.divergence });
    } catch (err) {
      setResult({ kind: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }, []);

  const reset = React.useCallback(() => setResult({ kind: 'idle' }), []);

  return { result, replay, reset };
}
