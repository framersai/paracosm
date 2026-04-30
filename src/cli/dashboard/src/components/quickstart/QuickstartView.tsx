/**
 * QuickstartView: orchestrates Input -> Progress -> Results.
 * Reads sse state via props + useBranchesContext for parent promotion.
 *
 * @module paracosm/dashboard/quickstart/QuickstartView
 */
import { useState, useCallback, useEffect } from 'react';
import { SeedInput } from './SeedInput';
import { InterventionDemoCard } from '../digital-twin/InterventionDemoCard';
import { CompareModal } from '../compare/CompareModal.js';
import { QuickstartProgress, type Stage, type ActorProgress } from './QuickstartProgress';
import { QuickstartResults } from './QuickstartResults';
import type { ActorConfig, ScenarioPackage } from '../../../../../engine/types.js';
import type { RunArtifact } from '../../../../../engine/schema/index.js';
import type { LeaderPreset } from '../../../../../engine/leader-presets.js';
import type { SimEvent } from '../../hooks/useSSE';
import styles from './QuickstartView.module.scss';

/** Shape returned by /api/quickstart/ground-scenario, surfaced to the
 *  Quickstart progress panel so the Research stage card can render
 *  real citation events instead of the legacy "folded into compile"
 *  placeholder. */
export type GroundingSummary =
  | { skipped: true; reason: string }
  | {
      citations: Array<{
        query: string;
        sources: Array<{ title: string; link: string; domain: string; provider?: string }>;
      }>;
      totalSources: number;
      durationMs: number;
      providersUsed?: string[];
      providersFailed?: Array<{ provider: string; reason: string }>;
    };

interface SseResultItem {
  leader: string;
  summary: Record<string, unknown>;
  fingerprint: Record<string, string> | null;
  artifact?: RunArtifact;
  actorIndex?: number;
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
  /** Fires the moment the user clicks Generate so App.tsx can flip the
   *  user-triggered-run gate that controls the verdict banner + the
   *  terminal/sim-saved toasts. Without it, a Quickstart-started run
   *  is treated like a stale rehydration and its outputs stay hidden
   *  in the cross-tab views (VIZ, REPORTS, banner). */
  onRunStarted?: () => void;
  /** Forwarded to the InterventionDemoCard. When the digital-twin run
   *  completes, App.tsx receives the artifact, parks it in
   *  interventionArtifact state, and switches to the SIM tab so
   *  DigitalTwinPanel renders. */
  onInterventionResult?: (artifact: RunArtifact) => void;
  /** Fired the instant the user clicks Run inside InterventionDemoCard,
   *  before the fetch lands. App.tsx uses it to switch to SIM
   *  immediately so live SSE events from the run render in
   *  DigitalTwinProgress while the synchronous fetch is still in
   *  flight. Carries the prefilled subject + intervention. */
  onInterventionStart?: (payload: {
    subject: { id: string; name: string; profile?: Record<string, unknown> };
    intervention: { id: string; name: string; description: string; duration?: { value: number; unit: string } };
  }) => void;
}

type Phase =
  | { kind: 'input' }
  | { kind: 'progress'; stage: Stage; scenario?: ScenarioPackage; actors?: ActorConfig[] }
  | { kind: 'results'; scenario: ScenarioPackage; actors: ActorConfig[]; artifacts: RunArtifact[] };

export function QuickstartView({ sse, sessionId, onRunStarted, onInterventionResult, onInterventionStart }: QuickstartViewProps) {
  const [phase, setPhase] = useState<Phase>({ kind: 'input' });
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  // Bundle id for the just-finished run; surfaced as a "Compare all N
  // actors" CTA on the results phase. Discovered by fetching the first
  // artifact's RunRecord (the RunRecord carries bundleId from /setup).
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);
  // Citations from the ground-scenario pass, set after compile + before
  // generate-actors. Forwarded into QuickstartProgress so the Research
  // stage card can render real citation events.
  const [groundingSummary, setGroundingSummary] = useState<GroundingSummary | null>(null);

  const handleSeedReady = useCallback(async (payload: { seedText: string; sourceUrl?: string; domainHint?: string; actorCount?: number }) => {
    setErrorBanner(null);
    // Flip the user-triggered-run gate before any UI changes so the
    // verdict banner + terminal/sim-saved toasts unlock for this
    // session. Symmetric with handleRun's setUserTriggeredRun(true)
    // in App.tsx.
    onRunStarted?.();
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
      // Real grounding pass: hits Serper for 3 derived queries, attaches
      // citations to the scenario's metadata server-side. Returns
      // { skipped: true } when SERPER_API_KEY is missing on the server,
      // in which case we just continue — the run isn't blocked by
      // missing grounding, only impoverished.
      try {
        const groundRes = await fetch('/api/quickstart/ground-scenario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenarioId }),
        });
        if (groundRes.ok) {
          const groundBody = await groundRes.json() as GroundingSummary;
          setGroundingSummary(groundBody);
        }
      } catch {
        // Network/parse error — surface nothing, still let the run continue.
        setGroundingSummary({ skipped: true, reason: 'request failed' });
      }
      setPhase({ kind: 'progress', stage: 'actors', scenario });

      // Honor the actor-count from the seed input; fall back to 3 for
      // back-compat with callers that don't supply one. Server-side
      // GenerateActorsSchema clamps 1-50 (Compare-runs UI cap).
      const requestedCount = Math.max(1, Math.min(50, payload.actorCount ?? 3));
      const actorsRes = await fetch('/api/quickstart/generate-actors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenarioId, count: requestedCount }),
      });
      if (!actorsRes.ok) {
        const body = await actorsRes.json().catch(() => ({} as { error?: string }));
        throw new Error(body.error ?? `Actor generation failed: HTTP ${actorsRes.status}`);
      }
      const { actors } = await actorsRes.json() as { actors: ActorConfig[] };
      setPhase({ kind: 'progress', stage: 'running', scenario, actors });

      sse.reset();
      const setupRes = await fetch('/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actors,
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
      // Map raw fetch / setup exceptions to actionable copy. Network
      // failures ('Failed to fetch'), origin 502/504s, and JSON parse
      // errors all stringify to noise the viewer can't act on.
      const raw = (err as Error)?.message ?? String(err);
      let msg: string;
      if (/Failed to fetch|NetworkError|ERR_CONNECTION|ERR_NETWORK/i.test(raw)) {
        msg = "Couldn't reach the server. Check your connection and try again.";
      } else if (/HTTP 502|HTTP 503|HTTP 504/.test(raw)) {
        msg = 'Server is temporarily unavailable (502/503/504). Try again in a moment.';
      } else if (/HTTP 429|rate.?limit/i.test(raw)) {
        msg = 'Hosted demo is rate-limited right now. Drop your own API key in Settings or wait a minute.';
      } else if (/HTTP 401|HTTP 403|unauthor/i.test(raw)) {
        msg = 'Auth error talking to the LLM provider. Check your API key in Settings.';
      } else {
        msg = `Quickstart failed: ${raw}`;
      }
      setErrorBanner(msg);
    }
  }, [sse, onRunStarted]);

  // Transition to results when all expected artifacts arrive.
  useEffect(() => {
    if (phase.kind !== 'progress' || phase.stage !== 'running') return;
    if (!phase.scenario || !phase.actors) return;
    const artifacts = sse.results
      .map(r => r.artifact)
      .filter((a): a is RunArtifact => !!a);
    if (artifacts.length >= phase.actors.length) {
      setPhase({
        kind: 'results',
        scenario: phase.scenario,
        actors: phase.actors,
        artifacts: artifacts.slice(0, phase.actors.length),
      });
    }
  }, [sse.results, phase]);

  // After results arrive, look up the bundleId for the first artifact
  // so the "Compare all N actors" CTA can open the CompareModal scoped
  // to this Quickstart submission. The first runId is enough — every
  // artifact in this submission shares the same bundleId.
  useEffect(() => {
    if (phase.kind !== 'results') return;
    if (bundleId !== null) return;
    const firstRunId = phase.artifacts[0]?.metadata?.runId;
    if (!firstRunId) return;
    let cancelled = false;
    fetch(`/api/v1/runs/${encodeURIComponent(firstRunId)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json() as Promise<{ record?: { bundleId?: string } }>;
      })
      .then((body) => {
        if (cancelled) return;
        const id = body?.record?.bundleId;
        if (id) setBundleId(id);
      })
      .catch(() => { /* CTA stays hidden if lookup fails; UX degrades gracefully */ });
    return () => { cancelled = true; };
  }, [phase, bundleId]);

  // Derive per-actor progress from SSE events for the running phase.
  const actorProgress: ActorProgress[] | undefined =
    phase.kind === 'progress' && phase.stage === 'running' && phase.actors
      ? phase.actors.map((a, i) => {
          const lastTurn = sse.events
            .filter(e => e.type === 'turn_done' || e.type === 'turn_start')
            .reduce((max, e) => {
              const t = (e.data as { turn?: number } | null | undefined)?.turn ?? 0;
              return t > max ? t : max;
            }, 0);
          const result = sse.results.find(r => r.actorIndex === i);
          const errored = sse.errors.length > 0 && !result;
          const status: ActorProgress['status'] = errored
            ? 'error'
            : sse.isAborted
              ? 'aborted'
              : result
                ? 'complete'
                : 'running';
          return {
            name: a.name,
            archetype: a.archetype,
            currentTurn: result ? (phase.scenario?.setup.defaultTurns ?? lastTurn) : lastTurn,
            maxTurns: phase.scenario?.setup.defaultTurns ?? 6,
            status,
          };
        })
      : undefined;

  const handleSwap = useCallback((actorIndex: number, preset: LeaderPreset) => {
    // MVP: swap points users at the Branches Fork flow for now.
    // v1.1 will wire this to a single-actor /setup POST that reruns
    // just that card in place.
    void actorIndex; void preset;
    setErrorBanner('Actor swap rerun is a v1.1 follow-up. Use "Fork in Branches" on the Branches tab to try a preset actor against this run.');
  }, []);

  return (
    <div className={styles.view}>
      {phase.kind === 'input' && (
        <>
          <header className={styles.header}>
            <h2>Quickstart</h2>
            <p>Paste a brief, drop a PDF, or supply a URL. Paracosm compiles a scenario and runs three distinct actors against it.</p>
          </header>
          {errorBanner && <p className={styles.errorBanner} role="alert">{errorBanner}</p>}
          <SeedInput onSeedReady={handleSeedReady} />
          {/* Digital-twin demo lives BELOW the seed input as a
              secondary path. Quickstart's primary use case is
              compile-a-scenario + run-three-actors; the dt card is a
              one-click "or test a single subject under one
              intervention" affordance. The dt section on the landing
              page is the dedicated showcase for the digital-twin
              import path. */}
          {onInterventionResult && (
            <InterventionDemoCard
              onResult={onInterventionResult}
              onRunStart={onInterventionStart}
              onError={(msg) => setErrorBanner(msg)}
            />
          )}
        </>
      )}
      {phase.kind === 'progress' && (
        <QuickstartProgress
          stage={phase.stage}
          actors={actorProgress}
          events={sse.events}
          actorCount={phase.actors?.length ?? actorProgress?.length ?? 3}
          groundingSummary={groundingSummary}
        />
      )}
      {phase.kind === 'results' && (
        <>
          {errorBanner && <p className={styles.errorBanner} role="alert">{errorBanner}</p>}
          {bundleId && phase.artifacts.length >= 2 && (
            <button
              type="button"
              className={styles.compareCta}
              onClick={() => setCompareOpen(true)}
              aria-label={`Compare all ${phase.artifacts.length} actors side-by-side`}
            >
              Compare all {phase.artifacts.length} actors →
            </button>
          )}
          <QuickstartResults
            actors={phase.actors}
            artifacts={phase.artifacts}
            sessionId={sessionId}
            onSwap={handleSwap}
          />
          {bundleId && compareOpen && (
            <CompareModal
              bundleId={bundleId}
              open
              onClose={() => setCompareOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
