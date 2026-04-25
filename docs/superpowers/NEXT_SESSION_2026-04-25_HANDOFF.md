# Next-Session Handoff. 2026-04-25 (Post-Tier-4 + T5.2)

**Supersedes:** the prior handoff at `NEXT_SESSION_CONTINUATION_2026-04-24_STAGE_G_FINAL.md` is now stale; it covered work since shipped.

**Status at handoff:** every line of code from 2026-04-24 is committed and pushed across all repos:

- `framersai/agentos@9d4c77a4` (npm `@framers/agentos@0.2.6` live)
- `framersai/agentos-extensions@81c1738`
- `framersai/agentos-extensions-registry@5d6ad12`
- `framersai/agentos-skills-registry@ac89415`
- `framersai/wilds-ai@f533929d0`
- `framersai/paracosm@ca5446c9`
- `manicinc/voice-chat-assistant@eb09ad3ef`

paracosm tsc clean. agentos sandbox tests 102/102. paracosm targeted tests 200+/0 fail. **Tier 4 of the paracosm roadmap is now COMPLETE.**

The full session audit is at `docs/superpowers/SESSION_2026-04-24_FULL_AUDIT.md`. Read that first.

---

## 0. The 60-second briefing

What's shipping (post-2026-04-24):

| Feature | Status | Where |
|---|---|---|
| T4.1 V8 sandbox hardening | SHIPPED | agentos `9d4c77a4`, paracosm `d178cabd` |
| T4.2 /simulate HTTP endpoint | SHIPPED | paracosm `a9eab106` |
| T4.3 SQLite run-history persistence | SHIPPED | paracosm `65167e6e` |
| T4.4 Test fixture cleanup | SHIPPED | paracosm `ecd85b5a` |
| T4.5 state.systems to state.metrics rename | SHIPPED | paracosm `c4f0be0e` |
| T4.6 useSSE legacy alias cleanup | SHIPPED | paracosm `c434dbb8` |
| T5.2 paracosm init CLI | SHIPPED | paracosm `ca5446c9` |
| T5.3 Quickstart onboarding | SHIPPED | paracosm `a32eafbc` |

`@framers/agentos` is at `0.2.6` on npm. All consumers pinned at `^0.2.5` or `workspace:*` semver-resolve to the live 0.2.6 on next install.

Tier 4 row is closed. Open work lives in T5.1, T5.4, T5.5, T6+.

---

## 1. Mission for next session

The natural next pick is **T5.1 dashboard viz kit** (1 day estimate). It's the largest open T5 item, user-facing, and would ship composable primitives so batch-trajectory + batch-point artifacts render properly (today only turn-loop has nice cards). Detailed spec scope is in §3 below.

If the user wants something else, alternatives ranked by ROI / size are in §2.

---

## 2. Open roadmap items (ranked)

### 2.1 T5.1 Dashboard viz kit (1 day, recommended)

> Composable primitives (`<TimepointCard>`, `<HealthScoreGauge>`, `<RiskFlagList>`, `<TrajectoryStrip>`) so batch-trajectory digital-twin and batch-point forecast artifacts render, not just turn-loop. Each mode-aware via `metadata.mode`.

**Why next:** the `/simulate` endpoint (T4.2) accepts `mode` but the dashboard only renders `turn-loop` properly. Batch-trajectory and batch-point produce valid `RunArtifact`s that render as a wall of JSON or empty cards today. The viz kit closes the "T4.2 produces output you can't see" gap.

**Cost:** zero LLM. ~1 day of React + SCSS module work.

**Risk:** dashboard `useSSE` reducer was just rewritten in T4.6; the new viz components must consume the updated event-type union (`specialist_*`, `decision_*`, `personality_drift`).

See §3 for full spec scope.

### 2.2 T5.4 paracosm/digital-twin subpath (half-day)

> Purpose-built helpers for the `SubjectConfig` + `InterventionConfig` flow. Makes the digital-twin use case first-class in the API, matching the marketing.

Smaller scope, narrow audience. Useful after T5.1 lands (the viz kit shows digital-twin output; the subpath makes producing it ergonomic).

### 2.3 T5.5 WorldModel.replay(artifact) (half-day)

> Deterministic re-execution of a stored RunArtifact. Audit + regression use case.

Naturally falls out of the kernel snapshot/fromSnapshot work shipped in Tier 2. Ships as a single static method on the `WorldModel` facade. Useful for T6.x audit-track tests (replay a historical run and assert the artifact bit-equals).

### 2.4 T6.1 Property-based tests on SimulationKernel reproducibility (half-day)

Fuzzing over seed space: run kernel twice, assert byte-equal. Pillar #2 (reproducible) is currently unverified. Cheap to add via `fast-check`; would catch any nondeterminism creeping into the kernel.

### 2.5 T6.2 Schema breaking-change detector in CI (2 hours)

Fails if `RunArtifactSchema.shape` diverges from HEAD without `COMPILE_SCHEMA_VERSION` bump. Prevents the "forgot to bump" regression. Smallest scope, immediate hygiene return.

### 2.6 T6.3 + T6.4 Mars + Lunar real-LLM smoke scripts (2-3 hours each)

Parallel to `scripts/smoke-corporate-quarterly.ts`. Catches Mars / Lunar regressions that corporate-quarterly doesn't. Small but each costs $5-10 in LLM tokens per run. Run on every release, not every commit.

### 2.7 T8.x docs items (half-day to 1 day each)

- T8.1 Scenario-author cookbook (1 day, marketing leverage)
- T8.2 Compiler-hook authoring guide (half-day)
- T8.3 Performance / cost tuning guide (half-day)
- T8.4 Counterfactual analysis methodology guide (half-day)

Documentation work; no code changes. Ship when there's a content week, not a feature week.

### 2.8 T6.7 Paracosm as an agentos-bench workload (1 day, large)

Reuse agentos-bench harness to benchmark LLM providers / cost presets across scenarios. Produces a paracosm-native cost-vs-quality matrix. Cross-package. Has cost ($50-100 LLM). Defer until other T5/T6 items land.

---

## 3. T5.1 Dashboard viz kit. spec-quality scope

### 3.1 Goal

Ship four composable React components so the dashboard renders all three simulation modes properly:

- `<TimepointCard>`. single timepoint summary (works for any mode)
- `<HealthScoreGauge>`. radial / linear gauge for a single metric (e.g., morale, foodMonthsReserve)
- `<RiskFlagList>`. flagged risks from a turn / timepoint
- `<TrajectoryStrip>`. horizontal strip of N timepoints with metric overlay (batch-trajectory mode primary use case)

Each component is **mode-aware via `metadata.mode`** so consumers do not branch on the artifact shape.

### 3.2 File structure

```
src/cli/dashboard/src/components/viz/kit/
├── TimepointCard.tsx + .module.scss + .test.tsx
├── HealthScoreGauge.tsx + .module.scss + .test.tsx
├── RiskFlagList.tsx + .module.scss + .test.tsx
├── TrajectoryStrip.tsx + .module.scss + .test.tsx
├── shared/
│   ├── metric-color.ts + .test.ts (color scale: red/amber/green by value range)
│   ├── format-metric.ts + .test.ts (number formatting: pct, count, currency, time)
│   └── types.ts (TimepointSummary, MetricSpec, RiskFlag interfaces)
└── index.ts (barrel re-export)
```

Plus integration:

- `src/cli/dashboard/src/components/reports/ReportView.tsx`. wire viz kit into batch-trajectory + batch-point branches
- `src/cli/dashboard/src/components/sim/EventCard.tsx`. optional, swap inline metric display for `<HealthScoreGauge>`
- `src/cli/dashboard/src/components/quickstart/QuickstartResults.tsx`. preview a `<TimepointCard>` per leader result

### 3.3 Component API sketches

#### `<TimepointCard>`

```typescript
interface TimepointCardProps {
  timepoint: number;          // turn or batch-trajectory time index
  mode: 'turn-loop' | 'batch-trajectory' | 'batch-point';
  metrics: Record<string, number>;        // from worldSnapshot.metrics
  highlights?: string[];                  // bullet points from outcome / event
  riskFlags?: RiskFlag[];                 // optional risk strip
  className?: string;
}
```

Renders: timepoint label, top-3 metrics as `<HealthScoreGauge>` mini-instances, highlight bullets, risk-flag chips. Mode-aware label: "Turn 3" vs "T+12mo" vs "Forecast Q3".

#### `<HealthScoreGauge>`

```typescript
interface HealthScoreGaugeProps {
  spec: MetricSpec;            // { id, label, unit, range: [min, max], thresholds: {warn, critical} }
  value: number;
  variant?: 'radial' | 'linear';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

interface MetricSpec {
  id: string;
  label: string;
  unit?: 'pct' | 'count' | 'currency' | 'time' | string;
  range: [number, number];
  thresholds?: { warn?: number; critical?: number };
  inverted?: boolean;          // true for "lower is worse" metrics like radiation exposure
}
```

Renders: SVG arc (radial) or filled bar (linear) with color from `metric-color.ts`. Label below, value with formatted unit. No external chart lib.

#### `<RiskFlagList>`

```typescript
interface RiskFlag {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  label: string;
  detail?: string;             // optional expandable detail
  source?: string;             // department/specialist that flagged it
}

interface RiskFlagListProps {
  flags: RiskFlag[];
  expandable?: boolean;
  className?: string;
}
```

Renders: vertical list of pills sorted by severity. Color-coded. Click to expand detail when `expandable`.

#### `<TrajectoryStrip>`

```typescript
interface TrajectoryStripProps {
  timepoints: Array<{
    label: string;
    metrics: Record<string, number>;
    riskFlags?: RiskFlag[];
  }>;
  primaryMetric: MetricSpec;     // the metric drawn as the overlay line
  width?: number;
  height?: number;
  className?: string;
}
```

Renders: horizontal SVG strip with N timepoint columns. Primary metric drawn as a line graph across columns. Risk flags appear as colored dots above their timepoint. Mini-cards below for hover. Used heavily in batch-trajectory mode.

### 3.4 Integration touch points

- `ReportView.tsx`: today the report only renders for `mode === 'turn-loop'`. Add branches for `batch-trajectory` (uses `<TrajectoryStrip>` + per-timepoint `<TimepointCard>` grid) and `batch-point` (single `<TimepointCard>` for the forecast point).
- `metadata.mode` discriminates which view to render. The viz components themselves don't branch on mode; the ReportView branches.
- The default Mars/Lunar `MetricSpec` instances live in `src/engine/{mars,lunar}/metrics.ts` already (post-T4.5 rename). Re-export from the viz kit's `shared/types.ts` for ergonomic import in the dashboard.

### 3.5 Testing

| File | What |
|---|---|
| `metric-color.test.ts` | Color buckets respect threshold + inversion, edge cases at min/max |
| `format-metric.test.ts` | Each unit formats correctly (pct, currency, count, time) + handles NaN/null |
| `TimepointCard.test.tsx` | Renders label correctly per mode, top-3 metric selection, accepts empty highlights/riskFlags |
| `HealthScoreGauge.test.tsx` | Variant rendering, threshold color picks, inverted metric correctness |
| `RiskFlagList.test.tsx` | Sort by severity, click-to-expand when expandable, no-flags empty state |
| `TrajectoryStrip.test.tsx` | Renders N columns, primary metric line correct, risk dots positioned at right column |

Use `@testing-library/react` (already a wilds-ai dep but check paracosm dashboard). If missing, lighter approach: render-to-string + DOM string assertions.

### 3.6 Out of scope

- Animation / transitions (static rendering; nice-to-have for v2)
- Drilldown / modal-on-click (cards are self-contained)
- Export / share buttons (separate concern)
- Color theming beyond the existing dashboard CSS variables (no new theme system)
- Mobile responsiveness audit (the dashboard is desktop-first; mobile pass is T8.5 a11y audit territory)

### 3.7 Estimate

~1 day. Roughly:

- 2 hours: `metric-color.ts`, `format-metric.ts`, `types.ts` + their tests
- 2 hours: `<HealthScoreGauge>` + `<RiskFlagList>` (simplest pair)
- 3 hours: `<TimepointCard>` + `<TrajectoryStrip>` (composes the others)
- 1 hour: `ReportView.tsx` integration for batch-trajectory + batch-point branches
- 1 hour: spec, plan, em-dash sweep, commit + push

---

## 4. Audit + eval improvements (cheap, high credibility)

### 4.1 T5.2 manual smoke (1 hour, $0.10)

`paracosm init` ships unsmoked. Recommended pre-launch:

```bash
cd /tmp && mkdir -p paracosm-init-smoke && cd paracosm-init-smoke
set -a && source /Users/johnn/Documents/git/voice-chat-assistant/apps/wilds-ai/.env && set +a
node --import tsx /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm/src/cli/run.ts \
  init test-app \
  --domain "Submarine crew of 8 surviving in deep ocean for 30 days. Resource pressures: oxygen, food, sanity. Three department heads (engineering, medical, navigation) with rotating shift duties. The captain decides on every contingency event the director generates." \
  --mode turn-loop --leaders 3 --force
ls test-app/
node -e "JSON.parse(require('fs').readFileSync('test-app/scenario.json'))" && echo "scenario.json parses"
node -e "JSON.parse(require('fs').readFileSync('test-app/leaders.json'))" && echo "leaders.json parses"
```

Expected: 7 files, both JSONs parse. Cost: one `compileFromSeed` + one `generateQuickstartLeaders` call against Anthropic Claude Sonnet (default provider). ~$0.05-0.15 total.

### 4.2 CodeRabbit pass on the unreviewed features (~$0, free tier)

T4.3, T4.4, T4.5, T4.6, T5.2 shipped without CR. T4.1 was the only feature CR-reviewed (and produced one real finding that became the realm-intrinsics fix). Recommended:

```bash
# Free tier rate-limits at ~3 reviews/hour. Spread across 1-2 hours.
coderabbit review --agent --base ca5446c9~7 -t committed
```

Fix any criticals + ship as a `fix(*): coderabbit` commit per T4.x area.

### 4.3 T6.2 Schema breaking-change detector (2 hours)

Smallest scope on T6.x list. Watch the `RunArtifactSchema.shape` over time and fail CI if it diverges without a `COMPILE_SCHEMA_VERSION` bump in `src/engine/schema/version.ts` (or wherever the version literal lives).

### 4.4 Bundle-size audit on dist/ (T8.6, 2 hours)

Run `du -sh dist/` + `npx pkg-size .` after `npm run build`. Identify any unexpectedly-large bundled module. Cut unused exports. Useful baseline for deciding when to refactor (e.g., split agentos imports if they balloon the dist).

---

## 5. Constraints (NON-NEGOTIABLE)

- **Git branch:** master, never main.
- **Commits:** NEVER commit unless user explicitly asks.
- **Push:** NEVER push unless user explicitly asks.
- **Commit messages:** NEVER mention AI, Claude, Opus, rewrite, LLM. No "Co-Authored-By" lines.
- **Monorepo commits:** Always `--no-verify` (secretlint blocks tracked .env files).
- **agentos / paracosm / wilds-ai are submodules**: cd into each, commit, push to its origin, then update submodule pointer in monorepo.
- **No subagents.** No worktrees with submodules. Never stash / reset / restore.
- **Working dir for paracosm:** always `cd apps/paracosm` or absolute paths.
- **Working dir for wilds-ai:** always `cd apps/wilds-ai` (Next.js 16 vs 14 conflict).
- **No em dashes** in prose.
- **No local builds for wilds-ai.** Postgres in production.
- **Lead with full recommendation.** Never menu without a decisive pick.
- **agentos-bench is benchmarks only.** Memory/RAG/retrieval improvements go in agentos core.
- **Use deep-research skill for web research.** Honest cost comparisons at matched reader.

---

## 6. Pre-flight checklist for the fresh session

1. **`git status -s`** in monorepo + `apps/paracosm` + `packages/agentos`. Confirm clean (matches §0 of the audit doc).
2. **Run §0 verification commands** in `SESSION_2026-04-24_FULL_AUDIT.md`. Confirm all checks pass.
3. **Read the audit doc end-to-end at max reasoning** before touching anything new. Tier 4 architecture is fresh; the renames + sandbox delegation will surface in any new T5/T6 work.
4. **Pick a roadmap item from §2 above.** Get explicit user approval on which one before starting.
5. **For ANY new feature: invoke `superpowers:brainstorming` first.** Full spec → plan → execute flow per the user's established pattern.
6. **For ANY behavior change: write the failing test first.** TDD is the user's stored pattern.
7. **Don't claim "verified" for anything the fresh session hasn't rebuilt + re-run.** Use `superpowers:verification-before-completion`.
8. **Em-dash sweep before every commit.** `git diff --name-only HEAD | while read f; do perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' "$f" 2>/dev/null; done; echo "(em-dash done)"`.

---

## 7. Open architectural questions for future sessions

1. Should `paracosm/digital-twin` (T5.4) be a separate package subpath or just barrel-export the existing `SubjectConfig` + `InterventionConfig` types from `paracosm` root?
2. Should `WorldModel.replay(artifact)` (T5.5) return a fresh `RunArtifact` and assert byte-equal vs the input, or just re-emit SSE events (replay semantics vs verify semantics)?
3. Should T5.1 viz kit ship as a sub-export `paracosm/dashboard-kit` so external consumers can import it, or stay private to the dashboard?
4. Is there a need for a `paracosm dev` subcommand (parallel to `paracosm init`) that runs the dashboard against a scaffolded project? Today the user runs `paracosm-dashboard` separately.
5. Should `/api/v1/runs/:runId` (single-run lookup) be added alongside the listing endpoint? T4.3 only ships the list query.
6. Should `RunHistoryStore` get a `deleteRun(runId)` method? Currently runs accumulate forever (no retention by default).
7. Should the `paracosm init` subcommand router be generalized to a real subcommand framework (commander, yargs, etc.) when the next subcommand lands, or stay as the one-line `if argv[2]` dispatch until 3+ subcommands exist?

---

## 8. Methodology invariants (carry forward)

- Tests use `node --import tsx --test` for paracosm, `vitest` for agentos. Don't mix.
- All paracosm work cd's into `apps/paracosm`. Use absolute paths in chained Bash calls.
- Submodule pushes precede monorepo pointer bumps. Never reverse the order.
- HEREDOC pattern for multi-line commit messages. Single-quoted EOF marker.
- After any rename: full em-dash sweep + tsc both configs + targeted tests of touched files.
- Per-task ~5 minute action granularity in plans. Each step has expected output.

---

## 9. FRESH-SESSION PROMPT (paste verbatim)

```
I'm continuing the paracosm work from the 2026-04-24 session. Two docs to read end-to-end at max reasoning before touching anything:

  apps/paracosm/docs/superpowers/SESSION_2026-04-24_FULL_AUDIT.md
  apps/paracosm/docs/superpowers/NEXT_SESSION_2026-04-25_HANDOFF.md

Session context at handoff:
- Tier 4 of the paracosm roadmap is COMPLETE (T4.1 sandbox + T4.2 /simulate + T4.3 SQLite + T4.4 fixture cleanup + T4.5 metrics rename + T4.6 useSSE alias). Plus T5.2 paracosm init CLI.
- @framers/agentos at 0.2.6 on npm. SandboxedToolForge delegates to hardened CodeSandbox.
- All 7 repos pushed clean. paracosm tsc 0; agentos sandbox tests 102/102.

Mission: pick from T5.1 / T5.4 / T5.5 / T6.x / T8.x and ship it. Recommended start: T5.1 dashboard viz kit (1 day, user-facing, closes the "T4.2 produces output you can't see" gap for batch-trajectory + batch-point modes). Full spec scope in §3 of the handoff.

Before taking any action:
1. `git status -s` in monorepo + apps/paracosm + packages/agentos. Confirm clean.
2. Run §0 verification commands in the audit doc. Confirm all green.
3. Get explicit user approval on which roadmap item to start before touching code.

Do NOT start new work without explicit approval. Start by reporting your understanding of where things stand, then ask which item to pick.
```

---

## 10. Closing claim

Today's session shipped 9 numbered features, hardened the production sandbox layer across two stacks (wilds-ai + paracosm) plus a CodeRabbit-driven follow-up, and swept dependencies across 5 repos. Tier 4 of the paracosm roadmap is closed.

Every shipping number is reproducible from the SHA listed. Every test count is named. Every spec doc explains the scope decision. The audit at `SESSION_2026-04-24_FULL_AUDIT.md` is structured for review with no prior context.

End of handoff. Next session: read the audit, ask, then act.
