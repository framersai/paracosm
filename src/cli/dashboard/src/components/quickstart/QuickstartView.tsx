/**
 * QuickstartView: orchestrates Input -> Progress -> Results.
 * Reads sse state via props + useBranchesContext for parent promotion.
 *
 * @module paracosm/dashboard/quickstart/QuickstartView
 */
import { useState, useCallback, useEffect } from 'react';
import { SeedInput } from './SeedInput';
import { QuickstartProgress, type Stage, type LeaderProgress } from './QuickstartProgress';
import { QuickstartResults } from './QuickstartResults';
import type { LeaderConfig, ScenarioPackage } from '../../../../../engine/types.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import type { LeaderPreset } from '../../../../../engine/leader-presets.js';
import type { SimEvent } from '../../hooks/useSSE';
import styles from './QuickstartView.module.scss';

interface SseResultItem {
  leader: string;
  summary: Record<string, unknown>;
  fingerprint: Record<string, string> | null;
  artifact?: RunArtifact;
  leaderIndex?: number;
}

export interface QuickstartViewProps {
  sse: {
    events: SimEvent[];
    results: SseResultItem[];
    isComplete: boolean;
    isAborted: boolean;
    errors: string[];
    reset: () => void;
  };
  sessionId?: string;
}

type Phase =
  | { kind: 'input' }
  | { kind: 'progress'; stage: Stage; scenario?: ScenarioPackage; leaders?: LeaderConfig[] }
  | { kind: 'results'; scenario: ScenarioPackage; leaders: LeaderConfig[]; artifacts: RunArtifact[] };

export function QuickstartView({ sse, sessionId }: QuickstartViewProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const handleSeedReady = useCallback(async (payload: { seedText: string; sourceUrl?: string; domainHint?: string }) => {
    setErrorBanner(null);
    setPhase({ kind: 'progress', stage: 'compile' });
    try {
      const compileRes = await fetch('/api/quickstart/compile-from-seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!compileRes.ok) {
        const body = await compileRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? `Compile failed: HTTP ${compileRes.status}`);
      }
      const { scenario, scenarioId } = await compileRes.json() as { scenario: ScenarioPackage; scenarioId: string };
      setPhase({ kind: 'progress', stage: 'research', scenario });
      // Research stage is folded into compileScenario server-side;
      // advance optimistically since we don't get a separate signal.
      setPhase({ kind: 'progress', stage: 'leaders', scenario });

      const leadersRes = await fetch('/api/quickstart/generate-leaders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId, count: 3 }),
      });
      if (!leadersRes.ok) {
        const body = await leadersRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? `Leader generation failed: HTTP ${leadersRes.status}`);
      }
      const { leaders } = await leadersRes.json() as { leaders: LeaderConfig[] };
      setPhase({ kind: 'progress', stage: 'running', scenario, leaders });

      sse.reset();
      const setupRes = await fetch('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaders,
          turns: scenario.setup.defaultTurns,
          seed: scenario.setup.defaultSeed ?? 42,
          captureSnapshots: true,
          quickstart: { scenarioId },
        }),
      });
      if (!setupRes.ok) {
        const body = await setupRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? `Setup failed: HTTP ${setupRes.status}`);
      }
    } catch (err) {
      setPhase({ kind: 'input' });
      setErrorBanner(String(err));
    }
  }, [sse]);

  // Transition to results when all expected artifacts arrive.
  useEffect(() => {
    if (phase.kind !== 'progress' || phase.stage !== 'running') return;
    const artifacts = sse.results
      .map(r => r.artifact)
      .filter((a): a is RunArtifact => !!a);
    if (phase.leaders && artifacts.length >= phase.leaders.length) {
      setPhase({
        kind: 'results',
        scenario: phase.scenario!,
        leaders: phase.leaders,
        artifacts: artifacts.slice(0, phase.leaders.length),
      });
    }
  }, [sse.results, phase]);

  // Derive per-leader progress from SSE events for the running phase.
  const leaderProgress: LeaderProgress[] | undefined =
    phase.kind === 'progress' && phase.stage === 'running' && phase.leaders
      ? phase.leaders.map((l, i) => {
          const lastTurn = sse.events
            .filter(e => e.type === 'turn_done' || e.type === 'turn_start')
            .reduce((max, e) => {
              const t = (e.data as { turn?: number } | null | undefined)?.turn ?? 0;
              return t > max ? t : max;
            }, 0);
          const result = sse.results.find(r => r.leaderIndex === i);
          const errored = sse.errors.length > 0 && !result;
          const status: LeaderProgress['status'] = errored
            ? 'error'
            : sse.isAborted
              ? 'aborted'
              : result
                ? 'complete'
                : 'running';
          return {
            name: l.name,
            archetype: l.archetype,
            currentTurn: result ? (phase.scenario?.setup.defaultTurns ?? lastTurn) : lastTurn,
            maxTurns: phase.scenario?.setup.defaultTurns ?? 6,
            status,
          };
        })
      : undefined;

  const handleSwap = useCallback((leaderIndex: number, preset: LeaderPreset) => {
    // MVP: swap points users at the Branches Fork flow for now.
    // v1.1 will wire this to a single-leader /setup POST that reruns
    // just that card in place.
    void leaderIndex; void preset;
    setErrorBanner('Leader swap rerun is a v1.1 follow-up. Use "Fork in Branches" on the Branches tab to try a preset leader against this run.');
  }, []);

  return (
    <div className={styles.view}>
      {phase.kind === 'input' && (
        <>
          <header className={styles.header}>
            <h2>Quickstart</h2>
            <p>Paste a brief, drop a PDF, or supply a URL. Paracosm compiles a scenario and runs three distinct leaders against it.</p>
          </header>
          {errorBanner && <p className={styles.errorBanner} role="alert">{errorBanner}</p>}
          <SeedInput onSeedReady={handleSeedReady} />
        </>
      )}
      {phase.kind === 'progress' && (
        <QuickstartProgress stage={phase.stage} leaders={leaderProgress} />
      )}
      {phase.kind === 'results' && (
        <>
          {errorBanner && <p className={styles.errorBanner} role="alert">{errorBanner}</p>}
          <QuickstartResults
            leaders={phase.leaders}
            artifacts={phase.artifacts}
            sessionId={sessionId}
            onSwap={handleSwap}
          />
        </>
      )}
    </div>
  );
}
