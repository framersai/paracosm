/**
 * Pure builder that maps paracosm's internal run state onto the
 * universal `RunArtifact` shape published under `paracosm/schema`.
 *
 * Keeps the orchestrator return site a single function call. Every
 * field rebucketing + shape normalization lives here.
 *
 * @module paracosm/runtime/build-artifact
 */
import type {
  Citation,
  Cost,
  Decision,
  ForgedToolSummary,
  ProviderError,
  RunArtifact,
  SimulationMode,
  SpecialistNote,
  Timepoint,
  TrajectoryPoint,
  WorldSnapshot,
} from '../engine/schema/index.js';

/**
 * Input bag for {@link buildRunArtifact}. Shapes match paracosm's
 * current internal run state; this function is the single place where
 * the internal shape meets the public one.
 */
export interface BuildArtifactInputs {
  runId: string;
  scenarioId: string;
  scenarioName: string;
  seed?: number;
  mode: SimulationMode;
  startedAt: string;
  completedAt?: string;
  /** Time-unit labels — post-F23 scenario-declared singular/plural. */
  timeUnit: { singular: string; plural: string };
  /** Raw per-turn internal state (today's TurnArtifact shape). */
  turnArtifacts: Array<{
    turn: number;
    year: number;
    stateSnapshotAfter: Record<string, number>;
    departmentReports: Array<{
      department: string;
      summary: string;
      confidence: number;
      risks: Array<{ severity: string; description: string }>;
      opportunities: Array<{ impact: string; description: string }>;
      citations: Array<{ text: string; url: string; doi?: string; context?: string }>;
      recommendedActions: string[];
      openQuestions: string[];
    }>;
    commanderDecision: {
      decision: string;
      rationale: string;
      reasoning?: string;
      selectedPolicies: string[];
    };
    policyEffectsApplied: string[];
  }>;
  /** Flat list of commander decisions across turns. */
  commanderDecisions: Array<{
    turn: number;
    year: number;
    actor?: string;
    decision: string;
    rationale: string;
    reasoning?: string;
    outcome?: Decision['outcome'];
  }>;
  /** Deduped forged toolbox. */
  forgedToolbox: ForgedToolSummary[];
  /** Deduped citation catalog. */
  citationCatalog: Citation[];
  /** Per-turn agent reactions — stashed under scenarioExtensions.reactions. */
  agentReactions: unknown[];
  finalState?: { systems: Record<string, number>; metadata?: unknown };
  fingerprint?: Record<string, number | string>;
  cost?: Cost;
  providerError?: ProviderError | null;
  aborted?: boolean;
  /** Narrative-layer overrides — batch modes populate these directly. */
  overview?: string;
  assumptions?: string[];
  leveragePoints?: string[];
  disclaimer?: string;
}

export function buildRunArtifact(inputs: BuildArtifactInputs): RunArtifact {
  const timepoints: Timepoint[] = inputs.turnArtifacts.map((ta) => ({
    time: ta.year,
    label: `${inputs.timeUnit.singular.charAt(0).toUpperCase()}${inputs.timeUnit.singular.slice(1)} ${ta.year}`,
    worldSnapshot: {
      metrics: ta.stateSnapshotAfter,
    } satisfies WorldSnapshot,
  }));

  const points: TrajectoryPoint[] = inputs.turnArtifacts.map((ta) => ({
    time: ta.year,
    metrics: ta.stateSnapshotAfter,
  }));

  const specialistNotes: SpecialistNote[] = inputs.turnArtifacts.flatMap((ta) =>
    ta.departmentReports.map((r) => ({
      domain: r.department,
      summary: r.summary,
      confidence: r.confidence,
      detail: {
        risks: r.risks.map((risk) => ({
          severity: risk.severity as 'low' | 'medium' | 'high' | 'critical',
          description: risk.description,
        })),
        opportunities: r.opportunities.map((o) => ({
          impact: o.impact as 'low' | 'medium' | 'high',
          description: o.description,
        })),
        recommendedActions: r.recommendedActions,
        citations: r.citations.map((c) => ({
          text: c.text,
          url: c.url,
          doi: c.doi,
          context: c.context ?? '',
        })),
        openQuestions: r.openQuestions,
      },
    })),
  );

  const decisions: Decision[] = inputs.commanderDecisions.map((d) => ({
    time: d.year,
    actor: d.actor,
    choice: d.decision,
    rationale: d.rationale,
    reasoning: d.reasoning,
    outcome: d.outcome,
  }));

  const trajectoryPopulated = timepoints.length > 0 || points.length > 0;

  const artifact: RunArtifact = {
    metadata: {
      runId: inputs.runId,
      scenario: { id: inputs.scenarioId, name: inputs.scenarioName },
      seed: inputs.seed,
      mode: inputs.mode,
      startedAt: inputs.startedAt,
      completedAt: inputs.completedAt,
    },
    overview: inputs.overview,
    assumptions: inputs.assumptions,
    leveragePoints: inputs.leveragePoints,
    disclaimer: inputs.disclaimer,
    trajectory: trajectoryPopulated
      ? { timeUnit: inputs.timeUnit, points, timepoints }
      : undefined,
    specialistNotes: specialistNotes.length > 0 ? specialistNotes : undefined,
    decisions: decisions.length > 0 ? decisions : undefined,
    finalState: inputs.finalState
      ? { metrics: inputs.finalState.systems }
      : undefined,
    fingerprint: inputs.fingerprint,
    citations: inputs.citationCatalog.length > 0 ? inputs.citationCatalog : undefined,
    forgedTools: inputs.forgedToolbox.length > 0 ? inputs.forgedToolbox : undefined,
    cost: inputs.cost,
    providerError: inputs.providerError ?? null,
    aborted: inputs.aborted ?? false,
    scenarioExtensions:
      inputs.agentReactions.length > 0 ? { reactions: inputs.agentReactions } : undefined,
  };

  return artifact;
}
