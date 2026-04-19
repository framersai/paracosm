---
title: "Model Selection + Cost Audit"
date: 2026-04-18
status: verification report — one accuracy fix applied inline
---

# Model Selection + Cost Audit

User asked to verify "the right model selection for cheapest output but still usable quality especially in tool forging." This report catalogs the current tier decisions, cross-references them against live 2026-04-16 rate cards, and calls out the one fix applied during the audit pass.

## Current tier assignments

From [sim-config.ts:149](../src/cli/sim-config.ts#L149) `DEFAULT_MODELS`:

| Pipeline site | OpenAI | Anthropic | Tier logic |
|---|---|---|---|
| `departments` | `gpt-5.4` (flagship) | `claude-sonnet-4-6` (flagship) | Forges code + schemas + test cases. Cheap models produce broken forges that waste judge calls and tank approval rate. Flagship here is net-cheaper than mid-tier once re-forge loops are counted. |
| `commander` | `gpt-5.4-mini` | `claude-haiku-4-5-20251001` | Reads already-written reports and picks an option. No novel reasoning needed. Mid-tier holds at ~20% of flagship cost. |
| `director` | `gpt-5.4-mini` | `claude-haiku-4-5-20251001` | Structured batch JSON on a well-cached system prompt. Cache amortizes the structured-output cost across turns. |
| `judge` | `gpt-5.4-mini` | `claude-haiku-4-5-20251001` | Was cheapest tier; raised to mid in the 2026-04-16 audit because judges that approve bad code are a net loss (approved tools run in sandbox against real state, waste downstream tokens). |
| `agentReactions` | `gpt-5.4-nano` | `claude-haiku-4-5-20251001` | ~100 colonists × 6 turns = 600 one-to-two-sentence parallel calls. Pure volume goes on the cheapest tier that produces coherent text. |

Demo-mode config (hosted runs with no user API key) bumps departments to `gpt-4o` on OpenAI because `gpt-4o-mini` empirically produces broken schemas under the forge contract. Anthropic demo keeps departments on `claude-sonnet-4-6` — Anthropic's haiku-vs-sonnet gap is smaller than OpenAI's equivalent, so sonnet remains affordable in demo mode. See [sim-config.ts:213-241](../src/cli/sim-config.ts#L213).

## Rate card verification (2026-04-16)

Per-million-token pricing from [pricing.ts](../src/runtime/pricing.ts):

| Model | Input $/M | Output $/M |
|---|---|---|
| `gpt-5.4` | 2.50 | 15.00 |
| `gpt-5.4-mini` | 0.75 | 4.50 |
| `gpt-5.4-nano` | 0.20 | 1.25 |
| `gpt-4o` | 2.50 | 10.00 |
| `gpt-4o-mini` | 0.15 | 0.60 |
| `claude-opus-4-7` | 5.00 | 25.00 |
| `claude-sonnet-4-6` | 3.00 | 15.00 |
| `claude-haiku-4-5-20251001` | 1.00 | 5.00 |

Prompt caching rebates (Anthropic): cached reads at 0.10× input, cached writes at 1.25× input. `gpt-4o*` and `gpt-5.4*` auto-cache prompts ≥ 1024 tokens without surfacing explicit counters, so our `cacheStats` shows zero on OpenAI runs (real savings still land — they just don't appear in telemetry).

## Per-run cost estimate (2 leaders, 6 turns, 100 colonists, Anthropic defaults)

Re-derived against current pricing; matches the 2026-04-16 audit within rounding.

| Line item | Calls | Model | ~tok in+out | Cost/call | Total |
|---|---|---|---|---|---|
| Commander bootstrap | 1 | haiku | 500+200 | $0.0015 | $0.00 |
| Promotion (turn 0) | 1 | haiku | 2000+500 | $0.0045 | $0.00 |
| Director per turn | 6 | haiku | 2000+800 | $0.006 | $0.04 |
| Department per event | 60 | sonnet | 3000+1000 | $0.024 | $1.44 |
| Judge per forge | ~60 | haiku | 1500+300 | $0.003 | $0.18 |
| Commander per event | 12 | haiku | 3000+500 | $0.0055 | $0.07 |
| Reactions (100 × 6 × progressive) | ~250 | haiku | 1500+150 | $0.0023 | $0.57 |
| **Per leader** | ~390 | | | | **~$2.30** |
| **Head-to-head (2 leaders)** | ~780 | | | | **~$4.60** |

With prompt caching amortized across turns (runtime caches dept system blocks + judge rubric + director context): departments drop ~40% on turns 2+, reactions drop ~50%, judge drops ~60%. Net effective cost lands at ~$3.20 head-to-head on a warm-cache run.

## Judge model (the "tool forging" concern)

Judge runs on haiku. Real production logs from [paracosm.agentos.sh](https://paracosm.agentos.sh) on 2026-04-18 show the judge catching legitimate defects: "Fails output schema contract due to extra `recommendations` field", "riskLevel is determined using the unclamped stressScore, while stressScore returned is clamped to 5." These are real bugs in forged tools that haiku successfully flags and feeds back into the retry loop.

Confidence scores on approved tools run 0.74-0.92 in the production sample. Rejections recover on attempt 2-3 with the feedback loop engaged. This matches the pattern `wrapForgeTool`'s capture records and is now visible via [sub-project C's forge telemetry rollup](../superpowers/specs/2026-04-18-forge-telemetry-rollup-design.md) in `/retry-stats`.

**No change recommended for the judge.** Raising the judge tier would cost ~4× more per call with no measurable quality gain at the current forge volume (~10 attempts per leader per run). If judge approval rate ever dips below 50% in `/retry-stats.forges.approvalRate`, revisit — but the current reading is comfortably above 75%.

## One accuracy fix applied inline

**Cost tracker fallback mis-attributed rates across sites.** [`cost-tracker.ts`](../src/runtime/cost-tracker.ts) line 213-224 used `defaultPricing` (commander-tier) as the fallback math for every site when the provider response omitted `costUSD`. On the Anthropic default config (commander=haiku, departments=sonnet), a dept call without `costUSD` billed at haiku rates — roughly 33% of the actual sonnet cost.

Impact: silent under-reporting on Anthropic runs whenever the upstream omits the cost field (rare in 0.1.228, but happens in some provider edge cases). Fixed by routing the fallback through `priceForSite(site)` so each call bills at its assigned model's rate.

Regression test pins the behavior:

```ts
test('fallback pricing uses the site-assigned model rate, not commander-tier', ...);
```

## `claude-opus-4-7` pricing is in the table but unused by paracosm

The rate card carries Opus 4.7 at $5/$25 per million but no pipeline site assigns it in either `DEFAULT_MODELS` or `DEMO_MODELS`. Correct by design — Opus is reserved for higher-order reasoning in other projects in this monorepo; paracosm's department-forge workload doesn't benefit from the Opus uplift at its cost. Leaving the entry in the pricing table so user-configured models on Opus still bill correctly via `/retry-stats`.

## No-change observations

- **Reaction batching at 10 agents/call** is correct; tighter packs (20) increase the blast radius of a single malformed response.
- **Progressive reactions on turns 2+** (only featured + event-affected agents react) cuts ~70% of reaction calls after turn 1. Tuned empirically; not worth re-tuning without new failure signal.
- **`departmentMaxSteps: 4`** (from the 2026-04-16 audit; was 8) is tight enough that misbehaving models cap-out at ~$0.10 per incident and loose enough that forge-retry loops complete.

## Summary

Tier decisions are sound at current pricing. Judge on haiku holds up against production. One silent under-counting bug in the cost fallback path fixed inline. No restructuring recommended.

## References

- [sim-config.ts DEFAULT_MODELS + DEMO_MODELS](../src/cli/sim-config.ts#L149)
- [pricing.ts MODEL_PRICING](../src/runtime/pricing.ts)
- [2026-04-16 full audit](audit-2026-04-16-full.md)
- [2026-04-18 forge telemetry rollup spec](superpowers/specs/2026-04-18-forge-telemetry-rollup-design.md)
