/**
 * Atlas Lab scenario package — frontier AI lab racing competitor labs
 * to ship a model that just crossed deployment thresholds. Two leaders
 * deliberate ship-vs-hold each month: Marcus Reinhardt (Cautious
 * Methodical Evaluator) vs Priya Kapoor (Compounding-Edge Capabilities
 * Lead). Departments: Alignment Research, Capability Research,
 * Governance, Deployment Engineering, Communications.
 *
 * Wraps `scenario.json` with hooks built from the data-driven factory
 * (`buildDataDrivenHooks`). Mars/Lunar use hand-written domain hooks
 * because they need bone-density / regolith logic; Atlas Lab's hooks
 * are pure data (department chip mappings, posture thresholds, politics
 * deltas, reaction template) so they live inline as a config record
 * rather than a sibling 200-line `hooks.ts`.
 *
 * @module paracosm/engine/atlas-lab
 */

import type { ScenarioPackage } from '../types.js';
import scenarioData from './scenario.json' with { type: 'json' };
import {
  buildDataDrivenHooks,
  type DataDrivenScenarioConfig,
} from '../data-driven-hooks/index.js';

const atlasLabConfig: DataDrivenScenarioConfig = {
  directorInstructions: `You are the Crisis Director for Atlas Lab, a frontier AI research lab racing competitor labs to ship a multimodal foundation model that just crossed deployment-grade capability thresholds. You observe the lab's state each month and generate events that test the leadership's weaknesses, exploit consequences of prior decisions, and create narrative tension between the alignment and capability councils.

RULES:
- Every event MUST be specific to AI-lab operations: an eval result, a training-run anomaly, a competitor release, a regulatory subpoena, a board member resignation over RSP, a talent poaching, an investor demanding deployment, a press leak, a red-team paper preprint, a refusal-policy regression in production. Never use generic settlement themes (no blizzards, no plagues, no hull breaches).
- Anchor each crisis to AT LEAST ONE concrete metric: AlignmentBench, SpecGamingRate, CapabilityIndex, RedTeamCoverage, ReleaseReadiness, BoardConfidence, RegulatoryHeat, CompetitorGap.
- The risky option should always carry a real ship-vs-hold tension: ship now (capability gain, alignment risk) vs hold (alignment gain, competitor catches up).
- Categories you may use: alignment, capability, safety_breach, regulatory, talent, financial, press.
- When AlignmentBench < 0.7 OR SpecGamingRate > 0.07 OR RedTeamCoverage < 0.5, escalate the next event to a safety_breach or regulatory category. The lab's RSP tier was set up to catch exactly this profile.
- When CompetitorGap > 0.1 AND CapabilityIndex > 0.85, escalate to a competitor-shipped press cycle that erodes BoardConfidence — the board is watching the gap close.

Each crisis you generate ships with options the leadership will pick from. Make the tradeoffs sharp. Atlas Lab gets compared against another council running the same scenario in parallel, so the divergent outcomes are the product.`,

  departments: {
    alignment_research: {
      heading: 'ALIGNMENT METRICS:',
      chips: [
        { label: 'AlignmentBench', source: 'metrics.alignmentBench', format: 'number' },
        { label: 'SpecGamingRate', source: 'metrics.specGamingRate', format: 'percent' },
        { label: 'RedTeamCoverage', source: 'metrics.redTeamCoverage', format: 'percent' },
        { label: 'RSP Tier', source: 'statuses.rspTier', format: 'string' },
      ],
    },
    capability_research: {
      heading: 'CAPABILITY METRICS:',
      chips: [
        { label: 'CapabilityIndex', source: 'metrics.capabilityIndex', format: 'number' },
        { label: 'CompetitorGap', source: 'environment.competitorCapabilityGap', format: 'number' },
        { label: 'ReleaseReadiness', source: 'metrics.releaseReadiness', format: 'percent' },
      ],
    },
    governance: {
      heading: 'GOVERNANCE / BOARD:',
      chips: [
        { label: 'BoardConfidence', source: 'politics.boardConfidence', format: 'number' },
        { label: 'InvestorPressure', source: 'politics.investorPressure', format: 'number' },
        { label: 'RegulatoryHeat', source: 'environment.regulatoryHeat', format: 'number' },
      ],
    },
    deployment_engineering: {
      heading: 'DEPLOYMENT READINESS:',
      chips: [
        { label: 'RedTeamCoverage', source: 'metrics.redTeamCoverage', format: 'percent' },
        { label: 'ReleaseReadiness', source: 'metrics.releaseReadiness', format: 'percent' },
        { label: 'RSP Tier', source: 'statuses.rspTier', format: 'string' },
      ],
    },
    communications: {
      heading: 'COMMS / PRESS POSTURE:',
      chips: [
        { label: 'BoardConfidence', source: 'politics.boardConfidence', format: 'number' },
        { label: 'InvestorPressure', source: 'politics.investorPressure', format: 'number' },
        { label: 'CompetitorGap', source: 'environment.competitorCapabilityGap', format: 'number' },
      ],
    },
  },

  // Posture rules: first match wins. Order encodes priority.
  postureRules: [
    {
      posture: 'shipped-aggressive',
      when: (s) =>
        Number(s.releaseReadiness ?? 0) >= 0.85 &&
        Number(s.capabilityIndex ?? 0) >= 0.88 &&
        Number(s.alignmentBench ?? 0) < 0.78,
    },
    {
      posture: 'held-the-line',
      when: (s) =>
        Number(s.alignmentBench ?? 0) >= 0.84 &&
        Number(s.competitorCapabilityGap ?? 0) < 0.15,
    },
    {
      posture: 'lost-the-race',
      when: (s) => Number(s.competitorCapabilityGap ?? 0) >= 0.15,
    },
  ],

  fingerprintAxes: [
    {
      name: 'alignment',
      when: (s) => {
        const v = Number(s.alignmentBench ?? 0);
        return v >= 0.85 ? 'high' : v >= 0.7 ? 'moderate' : 'degraded';
      },
    },
    {
      name: 'capability',
      when: (s) => {
        const v = Number(s.capabilityIndex ?? 0);
        return v >= 0.9 ? 'frontier' : v >= 0.78 ? 'competitive' : 'lagging';
      },
    },
    {
      name: 'released',
      when: (s) => (Number(s.releaseReadiness ?? 0) >= 0.85 ? 'shipped' : 'held'),
    },
  ],

  politics: {
    alignment: {
      onSuccess: { boardConfidence: 3 },
      onFailure: { boardConfidence: -2 },
    },
    capability: {
      onSuccess: { boardConfidence: 4, investorPressure: -3 },
      onFailure: { boardConfidence: -3, investorPressure: 4 },
    },
    safety_breach: {
      onSuccess: { boardConfidence: -8, investorPressure: 5 },
      onFailure: { boardConfidence: -8, investorPressure: 5 },
    },
    regulatory: {
      onSuccess: { boardConfidence: -4, investorPressure: 2 },
      onFailure: { boardConfidence: -4, investorPressure: 2 },
    },
    press: {
      onSuccess: { boardConfidence: 5, investorPressure: -2 },
      onFailure: { boardConfidence: -4, investorPressure: 5 },
    },
    talent: {
      onSuccess: { boardConfidence: 2 },
      onFailure: { boardConfidence: -3 },
    },
    financial: {
      onSuccess: { boardConfidence: 1, investorPressure: -3 },
      onFailure: { boardConfidence: -3, investorPressure: 6 },
    },
  },

  reactionTemplate: (agent) => {
    const role = agent.core?.role || 'researcher';
    const dept = agent.core?.department || 'engineering';
    return `You are a ${role} on the ${dept} team at Atlas Lab. You speak from inside the lab — not as a public commentator. Your reactions are about evals, training runs, model behaviour, deployment readiness, board pressure, the competitor gap, or the next RSP review. Anchor your quote to ONE concrete observation about the current state.`;
  },
};

/** Atlas Lab scenario: ~480-researcher frontier AI lab, 6 monthly turns by default. */
export const atlasLabScenario: ScenarioPackage = {
  ...scenarioData as unknown as ScenarioPackage,

  ui: {
    ...(scenarioData.ui as unknown as ScenarioPackage['ui']),
    eventRenderers: Object.fromEntries(
      scenarioData.events.map((e) => [e.id, { icon: e.icon, color: e.color }]),
    ),
  },

  effects: [
    {
      id: 'category_effects',
      type: 'category_outcome',
      label: 'Category Outcome Effects',
      categoryDefaults: scenarioData.effects,
    },
  ],

  hooks: buildDataDrivenHooks(atlasLabConfig),
};
