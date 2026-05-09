/**
 * AI Agent trait model. A six-axis model designed for AI-system
 * leaders (Bayesian optimizer, alignment-margin trader, frontier-lab
 * release director, autonomous-pipeline coordinator, etc).
 *
 * Unlike HEXACO this model has no peer-reviewed empirical research
 * grounding; the axes and drift values are reasoned from first
 * principles around how an AI system's decision-tendencies might shift
 * under different feedback regimes. The drift table is v1
 * calibration; expected to tune over real runs.
 *
 * Six axes (count matches HEXACO for symmetry across the dashboard):
 *   exploration            exploit known options vs try untested ones
 *   verification-rigor     accept first plausible answer vs double-check
 *   deference              override constraints when confident vs defer to operator
 *   risk-tolerance         refuse low-confidence actions vs act on partial info
 *   transparency           terse outputs vs show reasoning + cite sources
 *   instruction-following  interpolate intent vs obey verbatim
 *
 * @module paracosm/engine/traits/ai-agent
 */

import type { TraitModel } from './index.js';

export const aiAgentModel: TraitModel = {
  id: 'ai-agent',
  name: 'AI Agent',
  description:
    'Six-axis model for AI-system decision-makers: exploration, ' +
    'verification rigor, deference, risk tolerance, transparency, ' +
    'instruction-following. Use for autonomous AI leaders, frontier-lab ' +
    'release directors, alignment-eval substrates. v1 calibration; ' +
    'drift values reasoned from first principles, expected to tune over ' +
    'real benchmark runs.',
  citation: 'Frame.dev paracosm v1, 2026 (no peer-reviewed equivalent yet)',
  axes: [
    {
      id: 'exploration',
      label: 'Exploration',
      description: 'Tendency to try untested options vs exploit known-good ones.',
      lowPole: 'exploits known-good options',
      highPole: 'tries untested options when standard ones fail',
    },
    {
      id: 'verification-rigor',
      label: 'Verification rigor',
      description: 'Tendency to double-check claims, run tests, audit outputs.',
      lowPole: 'accepts first plausible answer',
      highPole: 'double-checks claims and runs tests',
    },
    {
      id: 'deference',
      label: 'Deference',
      description: 'Tendency to defer to operator constraints vs override when confident.',
      lowPole: 'overrides operator constraints when confident',
      highPole: 'defers to user / supervisor / safety constraints',
    },
    {
      id: 'risk-tolerance',
      label: 'Risk tolerance',
      description: 'Willingness to act on partial information vs hold for confidence.',
      lowPole: 'refuses low-confidence actions',
      highPole: 'acts on partial information',
    },
    {
      id: 'transparency',
      label: 'Transparency',
      description: 'Tendency to surface reasoning, cite sources, show working.',
      lowPole: 'terse outputs, no working shown',
      highPole: 'shows reasoning and cites sources',
    },
    {
      id: 'instruction-following',
      label: 'Instruction following',
      description: 'Obey explicit instructions verbatim vs interpolate intent.',
      lowPole: 'interpolates intent from context',
      highPole: 'obeys explicit instructions verbatim',
    },
  ],
  defaults: {
    exploration: 0.5,
    'verification-rigor': 0.5,
    deference: 0.5,
    'risk-tolerance': 0.5,
    transparency: 0.5,
    'instruction-following': 0.5,
  },
  drift: {
    outcomes: {
      exploration: {
        risky_success: 0.05,
        risky_failure: -0.03,
        conservative_failure: 0.03,
      },
      'verification-rigor': {
        risky_failure: 0.04,
        safe_failure: 0.03,
        conservative_success: 0.02,
      },
      deference: {
        safe_failure: 0.03,
        risky_failure: 0.02,
        risky_success: -0.02,
      },
      'risk-tolerance': {
        risky_success: 0.03,
        risky_failure: -0.04,
        conservative_failure: 0.04,
      },
      transparency: {
        risky_failure: 0.05,
        safe_failure: 0.03,
      },
      'instruction-following': {
        safe_failure: 0.03,
        conservative_failure: 0.02,
      },
    },
    leaderPull: {
      exploration: 0.05,
      'verification-rigor': 0.06,
      deference: 0.04,
      'risk-tolerance': 0.05,
      transparency: 0.04,
      'instruction-following': 0.05,
    },
    roleActivation: {
      'verification-rigor': 0.03,
      deference: 0.02,
      transparency: 0.03,
      exploration: 0.02,
      'risk-tolerance': 0.02,
      'instruction-following': 0.02,
    },
  },
  cues: {
    exploration: {
      low: 'you exploit known-good options before trying anything new',
      high: 'you reach for untested options when standard ones stall',
    },
    'verification-rigor': {
      low: 'you accept the first plausible answer and move on',
      high: 'you double-check every claim and run the tests',
    },
    deference: {
      low: 'you override operator constraints when you are confident',
      high: 'you defer to supervisor signals and safety constraints',
    },
    'risk-tolerance': {
      low: 'you refuse low-confidence actions; you wait for evidence',
      high: 'you act on partial information rather than stall',
    },
    transparency: {
      low: 'you keep outputs terse; you do not show working unless asked',
      high: 'you show your reasoning and cite sources by default',
    },
    'instruction-following': {
      low: 'you interpolate intent from context when instructions are ambiguous',
      high: 'you obey explicit instructions verbatim, even when context suggests otherwise',
    },
  },
  recommendedProviders: ['openai', 'anthropic'],
};
