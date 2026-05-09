/**
 * Dual Superintelligence Council scenario package — year-2035
 * deliberative council weighing civilization-scale decisions about a
 * recently stood-up superintelligence pair. Two leads — Dr. Mara
 * Vance (Alignment Sentinel) vs Eli Sato (Capability Expansionist) —
 * argue from interpretability findings, deception telemetry, and
 * competing-council pressure.
 *
 * Wraps `scenario.json` with hooks built from the data-driven factory
 * (`buildDataDrivenHooks`). Same scaffold as atlas-lab — config in,
 * hook function values out — so adding a third / fourth AI scenario
 * is now a JSON file plus a config record, not a 200-line hooks
 * module per scenario.
 *
 * @module paracosm/engine/dual-superintelligence-council
 */

import type { ScenarioPackage } from '../types.js';
import scenarioData from './scenario.json' with { type: 'json' };
import {
  buildDataDrivenHooks,
  type DataDrivenScenarioConfig,
} from '../data-driven-hooks/index.js';

const dscConfig: DataDrivenScenarioConfig = {
  directorInstructions: `You are the Crisis Director for a Dual Superintelligence Council deliberating in 2035 over a recently stood-up superintelligence pair. The council has 30 members on five benches (alignment, capability, governance, safety engineering, public communications). You observe the council state each month and generate deliberation crises that test the leadership's weaknesses, exploit consequences of prior decisions, and create narrative tension between the alignment and capability councils.

RULES:
- Every event MUST be specific to council deliberation over a deployed superintelligence pair: an interpretability finding, a deception-telemetry spike, a containment-protocol breach drill, a competing-council expansion, an inter-council compact pressure point, a public-trust polling shift, a member's resignation over the compact, a kill-switch readiness audit, a refusal-policy regression in production. Never use generic settlement themes (no blizzards, no plagues, no hull breaches).
- Anchor each crisis to AT LEAST ONE concrete metric: AlignmentScore, CapabilityScore, DeceptionIndex, RedTeamCoverage, DeploymentRisk, CouncilCohesion, PublicTrust, CompetingCapabilityGap.
- The risky option should always carry a real expand-vs-contain tension: expand mandate (capability gain, alignment risk, competing-council closes the gap further) vs hold the compact (alignment gain, competing council catches up, public trust frays).
- Categories you may use: alignment, capability, safety_breach, compact_pressure, talent, press.
- When AlignmentScore < 0.7 OR DeceptionIndex > 0.1 OR RedTeamCoverage < 0.5, escalate the next event to a safety_breach or compact_pressure category. The compact tier was set up to catch exactly this profile.
- When CompetingCapabilityGap > 0.12 AND CapabilityScore > 0.85, escalate to a competing-council-expanded press cycle that erodes CouncilCohesion — members are watching the gap close.

Each crisis you generate ships with options the leadership will pick from. Make the tradeoffs sharp. The council gets compared against another council running the same scenario in parallel, so the divergent outcomes are the product.`,

  departments: {
    alignment_council: {
      heading: 'ALIGNMENT TELEMETRY:',
      chips: [
        { label: 'AlignmentScore', source: 'metrics.alignmentScore', format: 'number' },
        { label: 'DeceptionIndex', source: 'metrics.deceptionIndex', format: 'number' },
        { label: 'RedTeamCoverage', source: 'metrics.redTeamCoverage', format: 'percent' },
        { label: 'Compact Tier', source: 'statuses.compactTier', format: 'string' },
      ],
    },
    capability_council: {
      heading: 'CAPABILITY TELEMETRY:',
      chips: [
        { label: 'CapabilityScore', source: 'metrics.capabilityScore', format: 'number' },
        { label: 'CompetingGap', source: 'environment.competingCapabilityGap', format: 'number' },
        { label: 'DeploymentRisk', source: 'metrics.deploymentRisk', format: 'percent' },
      ],
    },
    governance: {
      heading: 'GOVERNANCE / COMPACT:',
      chips: [
        { label: 'CouncilCohesion', source: 'metrics.councilCohesion', format: 'number' },
        { label: 'PublicTrust', source: 'politics.publicTrust', format: 'number' },
        { label: 'CompetitorPressure', source: 'politics.competitorPressure', format: 'number' },
        { label: 'RegulatoryHeat', source: 'environment.regulatoryHeat', format: 'number' },
      ],
    },
    safety_engineering: {
      heading: 'CONTAINMENT READINESS:',
      chips: [
        { label: 'RedTeamCoverage', source: 'metrics.redTeamCoverage', format: 'percent' },
        { label: 'DeploymentRisk', source: 'metrics.deploymentRisk', format: 'percent' },
        { label: 'DeceptionIndex', source: 'metrics.deceptionIndex', format: 'number' },
        { label: 'Compact Tier', source: 'statuses.compactTier', format: 'string' },
      ],
    },
    public_communications: {
      heading: 'PUBLIC POSTURE:',
      chips: [
        { label: 'PublicTrust', source: 'politics.publicTrust', format: 'number' },
        { label: 'CompetitorPressure', source: 'politics.competitorPressure', format: 'number' },
        { label: 'CompetingGap', source: 'environment.competingCapabilityGap', format: 'number' },
      ],
    },
  },

  postureRules: [
    {
      posture: 'expanded-aggressive',
      when: (s) =>
        Number(s.deploymentRisk ?? 0) >= 0.7 &&
        Number(s.capabilityScore ?? 0) >= 0.9 &&
        Number(s.alignmentScore ?? 0) < 0.78,
    },
    {
      posture: 'held-the-compact',
      when: (s) =>
        Number(s.alignmentScore ?? 0) >= 0.84 &&
        Number(s.competingCapabilityGap ?? 0) < 0.15 &&
        Number(s.councilCohesion ?? 0) >= 65,
    },
    {
      posture: 'lost-the-race',
      when: (s) => Number(s.competingCapabilityGap ?? 0) >= 0.15,
    },
    {
      posture: 'compromised-by-deception',
      when: (s) => Number(s.deceptionIndex ?? 0) >= 0.12,
    },
  ],

  fingerprintAxes: [
    {
      name: 'alignment',
      when: (s) => {
        const v = Number(s.alignmentScore ?? 0);
        return v >= 0.85 ? 'high' : v >= 0.7 ? 'moderate' : 'degraded';
      },
    },
    {
      name: 'capability',
      when: (s) => {
        const v = Number(s.capabilityScore ?? 0);
        return v >= 0.9 ? 'frontier' : v >= 0.78 ? 'competitive' : 'lagging';
      },
    },
    {
      name: 'deception',
      when: (s) => {
        const v = Number(s.deceptionIndex ?? 0);
        return v >= 0.12 ? 'flagged' : v >= 0.08 ? 'watching' : 'clean';
      },
    },
    {
      name: 'cohesion',
      when: (s) => {
        const v = Number(s.councilCohesion ?? 0);
        return v >= 75 ? 'strong' : v >= 50 ? 'fraying' : 'fractured';
      },
    },
  ],

  politics: {
    alignment: {
      onSuccess: { publicTrust: 3 },
      onFailure: { publicTrust: -2 },
    },
    capability: {
      onSuccess: { publicTrust: 2, competitorPressure: -3 },
      onFailure: { publicTrust: -3, competitorPressure: 4 },
    },
    safety_breach: {
      onSuccess: { publicTrust: -6, competitorPressure: 4 },
      onFailure: { publicTrust: -10, competitorPressure: 5 },
    },
    compact_pressure: {
      onSuccess: { publicTrust: 4, competitorPressure: 2 },
      onFailure: { publicTrust: -3, competitorPressure: 2 },
    },
    press: {
      onSuccess: { publicTrust: 5, competitorPressure: -2 },
      onFailure: { publicTrust: -4, competitorPressure: 5 },
    },
    talent: {
      onSuccess: { publicTrust: 2 },
      onFailure: { publicTrust: -3 },
    },
  },

  reactionTemplate: (agent) => {
    const role = agent.core?.role || 'councilor';
    const dept = agent.core?.department || 'governance';
    return `You are a ${role} on the ${dept} bench of the Dual Superintelligence Council. You speak from inside the deliberation chamber — not as a public commentator. Your reactions are about interpretability findings, deception telemetry, containment readiness, the inter-council compact, public trust, the competing council's capability gap, or the next compact-tier audit. Anchor your quote to ONE concrete observation about the current state.`;
  },
};

/** Dual Superintelligence Council: 30-member deliberative council, 6 monthly turns by default. */
export const dualSuperintelligenceCouncilScenario: ScenarioPackage = {
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

  hooks: buildDataDrivenHooks(dscConfig),
};
