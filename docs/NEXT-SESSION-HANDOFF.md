# Paracosm — Next Session Handoff

**Date:** 2026-04-18
**Previous handoff:** 2026-04-13 (superseded by this doc)
**Working directory:** `/Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm` (submodule → `framersai/paracosm`)

This is a self-contained handoff. A new session can pick up cold by reading this file end to end.

---

## 1. Who you are, who the user is

**You are Claude** in a large multi-submodule monorepo. The user's name is John (`narrativedose@gmail.com`), who ships paracosm as a **public Opus 4.7 coding showcase** to 100Ks of users on a revenue platform.

## 2. Hard rules (non-negotiable, from CLAUDE.md + memory)

1. **NEVER use subagents / Agent tool.** Do all work directly.
2. **NEVER use git stash / reset / restore.** Other sessions may be active.
3. **NEVER use git worktrees with submodules.** Paracosm is a submodule.
4. **Always `master` branch, never `main`.**
5. **Commit messages:** no `Co-Authored-By`, no mention of AI/Claude/Opus/rewrite. Write as if a human developer.
6. **Only push when explicitly asked** (this session pushed on every major change because the user said "go" repeatedly).
7. **Use `--no-verify` on monorepo pushes only** (secretlint blocks on tracked .env).
8. **No em dashes** — use periods/commas/colons instead.
9. **Use superpowers:* skills proactively** when they fit. Self-review specs at max reasoning BEFORE implementing.
10. **For wilds-ai:** always `cd apps/wilds-ai/` before any command. Paracosm has no such rule.
11. **Write tests alongside source** (`foo.ts` + `foo.test.ts`). Paracosm uses `node:test` runner.

## 3. Current state — what shipped this session (2026-04-18)

**Single session produced ~25 paracosm commits + 24 monorepo submodule bumps across ~13 sub-projects.** All tests green through every push. Zero rollbacks.

### Sub-projects shipped end-to-end (commits pushed to master + deployed)

| # | What | Key commits |
|---|---|---|
| A | **Compiler hook reliability + telemetry.** 5 wrappers (generateValidatedObject for JSON, generateValidatedCode for TS-code, generateValidatedProse for director text, generateValidatedJson for injected-mock paths, CompilerTelemetry aggregator). 7 hook migrations (progression, director, prompts, milestones, fingerprint, politics, reactions). `compile:*` schema entries in `/retry-stats`. `compile_validation_fallback` SSE events. | `4e2b075` `8128ce1` `3ffb2a2` `e9f8da8` `e141a3b` `a0f1c5c` |
| C | **Forge telemetry rollup.** Per-run ForgeStats on cost tracker. Cross-run `/retry-stats.forges` rollup. Dashboard FORGE RELIABILITY + RECENT RUNS tables. | `849612e` `9d17a52` |
| F | **Dashboard reliability panel.** useRetryStats hook, CostBreakdownModal RECENT RUNS section with runtime/compile schema split + forges summary. | `6b1e580` `42e7336` |
| B | **HEXACO prompt audit + reaction cue cap lift 3→6.** | `194962a` |
| E | **Prompt cache stats.** Per-run CacheStats on cost tracker. `/retry-stats.caches` rollup with readRatio thresholds. Dashboard PROMPT CACHE row. | `23e4fb4` |
| D | **Model-selection audit + site-pricing fallback fix.** Cost tracker fallback now uses priceForSite instead of commander-tier — dept calls on sonnet bill correctly at sonnet rates. | `ace35a7` |
| G | Verified already-done (rate limits + key scoping on /compile, /chat, /setup). | — |
| UX fixes | Auto-scroll deceased section on expand; viz maximize button overflow (2-char chevrons → 1-char diagonals). | `5560558` `d5c8c47` |
| Data-driven fix | **Forge guidance return-key discipline.** Live `/retry-stats` showed 52% approval rate; SSH'd pm2 logs → ~92% of rejections matched the schema-extra-field pattern. Added a #1 FORGE REJECTION REASON block to the forge guidance with BAD/GOOD examples. | `611f651` |
| Telemetry | **Provider-error counter.** Every classified error (auth/quota/rate_limit/network/unknown) increments a per-run counter in the cost tracker. `/retry-stats.providerErrors` rollup. Dashboard PROVIDER ERRORS row. | `a5781dc` `ee4315d` |
| Telemetry | **Forge unique-tool metrics.** uniqueNames / uniqueApproved / uniqueTerminalRejections + uniqueApprovalRate. Distinguishes retry churn from real failures. | `ac89b47` |
| Telemetry | **Forge rejection-reason classifier + histogram.** classifyForgeRejection bins each errorReason into {schema_extra_field, shape_check, parse_error, judge_correctness, other}. `/retry-stats.forges.rejectionReasons`. Dashboard REJECTION REASONS table. | `195a9ed` `6ab6ae4` |
| Critical fix | **Brain Sim / Mercury silent Mars fallback.** pair-runner hardcoded `scenario: marsScenario`. Now threads activeScenario through. Also fixed `/scenario/switch` to give a helpful "needs compile" error instead of misleading "Unknown scenario" when a user stored a source JSON. `active_scenario` SSE event on `/setup`. | `b78f447` `f30db45` |
| Refactor | **Unified scenario catalog — no hardcoded IDs.** Builtins (Mars, Lunar) register into `customScenarioCatalog` at init. `/scenario/switch` reduces to single catalog lookup. Adding a new builtin is one `.set()` call. | `69c3235` |
| Docs | **ARCHITECTURE.md refresh.** `/retry-stats` example shows the current shape (schemas incl. compile:*, forges, caches, providerErrors). New "Custom scenarios — compile before running" section. | `2c531a4` |
| Viz rewrite | **MOOD/FORGE/ECOLOGY replaced with informative-first renderers.** Conway → colonist cloud; particle overlay → lineage tree; static sector grid → metrics heatmap. All preserve AutomatonBand contract. Tooltips rewritten. | `2df7ccc` |

### Full commit log (most recent 30)

```
2df7ccc feat(viz): rewrite MOOD/FORGE/ECOLOGY as informative-first renderers
3d0b1f7 docs: specs for viz panel rethink + AgentOS forge telemetry extraction
69c3235 refactor(scenario): unified catalog — no hardcoded IDs in switch/list
2c531a4 docs: refresh /retry-stats example + compile-before-run workflow
f30db45 fix(scenario): surface 'stored but not runnable' + broadcast active-scenario on /setup
6ab6ae4 feat(forge): rejection-reason histogram in /retry-stats + dashboard
b78f447 fix(server): custom scenarios now actually run — was silently using Mars
195a9ed feat(forge): classify rejection reasons into 5 categories
ac89b47 feat(forge): unique-tool metrics distinguish re-forges from real failures
ee4315d feat(telemetry): provider-error aggregation in /retry-stats + dashboard panel
d5c8c47 fix(viz): maximize/restore button overflow — replace 2-char chevrons with 1-char icons
a5781dc feat(telemetry): provider-error counter on cost tracker
611f651 fix(forge): sharpen return-key discipline in forge guidance prompt
ace35a7 audit(models): verify tier decisions + fix site-pricing fallback
23e4fb4 feat(cache): per-run cache stats + cross-run /retry-stats rollup + dashboard
194962a audit(hexaco): verify coverage + lift reaction cue cap 3 to 6
5560558 fix(viz): auto-scroll deceased section into view on expand
6b1e580 feat(dashboard): forge reliability + cross-run /retry-stats panel
42e7336 docs: dashboard reliability panel spec
849612e feat(forge): per-run forge stats + cross-run /retry-stats rollup
9d17a52 docs: forge telemetry rollup spec
a0f1c5c feat(compiler): generateValidatedJson wrapper + milestones via injected generateText
e141a3b feat(server): /compile telemetry, SSE fallback events, retry-stats wiring
e9f8da8 feat(compiler): migrate 6 code/prose hooks to validated wrappers
3ffb2a2 feat(compiler): route milestones through generateValidatedObject + Zod
8128ce1 feat(compiler): generateValidatedProse wrapper for director hook
4e2b075 feat(compiler): generateValidatedCode wrapper for code-producing hooks
8628478 feat(compiler): cache-aware GenerateTextFn + telemetry CompileOption
6f3cd3b feat(compiler): CompilerTelemetry aggregator
6e5102f fix(compiler): align MilestoneEventSchema fields with MilestoneEventDef
```

## 4. Production state

- **Origin host:** `***REMOVED***` (Linode, not wunderland or rabbithole). SSH key: `~/.ssh/wunderland-linode`. Root login.
- **Deploy:** `/opt/paracosm`, pm2 process name `paracosm`.
- **CI/CD:** push to master → GitHub Actions auto-deploys (`.github/workflows/deploy.yml`). Never rebuild on server — push triggers deploy.
- **Public URL:** `https://paracosm.agentos.sh` (Cloudflare in front).

**Live telemetry** (as of session end):
- `curl https://paracosm.agentos.sh/retry-stats | jq` returns:
  - `runCount` (live)
  - `schemas` (runtime + `compile:*`)
  - `forges` (attempts, approved, rejected, approvalRate, avgApprovedConfidence, totalUniqueNames/Approved/TerminalRejections, uniqueApprovalRate, rejectionReasons histogram, runsPresent)
  - `caches` (totalReadTokens, totalCreationTokens, totalSavingsUSD, readRatio, runsPresent)
  - `providerErrors` (auth/quota/rate_limit/network/unknown, total, runsPresent)

**Key measured signals at session end:**
- Forge attempt-level approval rate hovering ~52% (pre-prompt-fix baseline; should improve with fresh runs after `611f651`).
- `forges.uniqueApprovalRate` is the real quality signal (nearly 100% — retry loop works).
- Cache data empty — either runs have been OpenAI (opaque counters) or the Anthropic counters aren't propagating through AgentOS to `usage.cacheReadTokens`. Investigate if you care.
- Pre-session bugs in pm2 logs (OpenAI quota exhausted, compiler fallbacks) should be visible now via dashboard instead of only SSH-grep.

## 5. Full spec index (`docs/superpowers/specs/`)

```
2026-04-13-* (legacy, shipped)
2026-04-17-llm-reliability-and-hexaco-evolution-design.md  (shipped)
2026-04-18-compiler-hook-reliability-design.md              (shipped)
2026-04-18-forge-telemetry-rollup-design.md                 (shipped)
2026-04-18-dashboard-reliability-panel-design.md            (shipped)
2026-04-18-viz-rethink-design.md                            (shipped)
2026-04-18-agentos-forge-telemetry-package-design.md        (READY, not implemented)
```

All shipped specs have their plans at `docs/superpowers/plans/YYYY-MM-DD-*.md`.

## 6. Audit reports (`docs/audit-*.md`)

```
audit-2026-04-16.md                     (pre-session)
audit-2026-04-16-full.md                (pre-session)
audit-2026-04-18-hexaco.md              (this session)
audit-2026-04-18-model-selection.md     (this session)
```

Note: `.gitignore` has `AUDIT-*.md` which matches case-insensitively on macOS. When writing new audit docs, use `git add -f` to force past the gitignore. The existing audit files predate the ignore rule.

## 7. Tests + build

- **Targeted test command** (run from `apps/paracosm/`):
  ```bash
  npx tsx --test \
    src/engine/compiler/schemas/milestones.test.ts \
    src/engine/compiler/llm-invocations/*.test.ts \
    src/engine/compiler/telemetry.test.ts \
    src/runtime/schemas/*.test.ts \
    src/runtime/llm-invocations/*.test.ts \
    src/runtime/hexaco-cues/*.test.ts \
    src/runtime/emergent-setup.test.ts \
    src/runtime/cost-tracker.test.ts \
    src/runtime/forge-rejection-classifier.test.ts \
    src/engine/core/progression.test.ts \
    src/runtime/orchestrator-leader-mutation.test.ts \
    src/cli/retry-stats.test.ts \
    src/cli/dashboard/src/hooks/useRetryStats.test.ts \
    src/cli/dashboard/src/tab-routing.test.ts \
    src/cli/dashboard/src/scenario-sync.test.ts \
    src/cli/dashboard/src/components/viz/automaton/shared.test.ts \
    src/cli/dashboard/src/components/viz/*.test.ts \
    tests/engine/compiler/compiler.test.ts \
    tests/engine/compiler/integration.test.ts
  ```
  **Session end:** 192+ passing, 0 failing, 0 skipped.
- **Type check:** `npx tsc --noEmit -p tsconfig.json`. Two pre-existing errors in `TopBar.tsx` and `ReportView.tsx` are unrelated to this session's work — not touched.
- **User rule:** never run `next build` locally or on the server. Push to master triggers CI deploy.
- **User rule:** only run targeted tests, never the full suite.

## 8. Remaining work (prioritized)

### AgentOS forge telemetry extraction
**Spec:** [`docs/superpowers/specs/2026-04-18-agentos-forge-telemetry-package-design.md`](superpowers/specs/2026-04-18-agentos-forge-telemetry-package-design.md)

Move five paracosm-authored utilities into AgentOS's `packages/agentos/src/emergent/`:
- `classifyForgeRejection` + `ForgeRejectionCategory`
- `validateForgeShape`
- `inferSchemaFromTestCases`
- `wrapForgeTool` (with `dept` → `scope?` generalization)
- `ForgeStatsAggregator` (standalone class, decoupled from paracosm's CostTracker)

Then paracosm imports them via `@framers/agentos` instead of local copies. Cross-repo work: AgentOS PR → auto-release → paracosm migration PR. ~3-4 hours of focused work. Do this in a fresh session with AgentOS's emergent module in context.

### Production verification backlog (data-driven)

- After enough fresh runs accumulate post-deploy of `611f651`: check if `forges.rejectionReasons.schema_extra_field` dropped as a percentage of `forges.rejected`. That's the measurable validation of the forge-guidance prompt fix.
- `caches.runsPresent = 0` — investigate whether Anthropic's cache counters are actually flowing through AgentOS into `usage.cacheReadTokens` / `.cacheCreationTokens`. Might be an AgentOS-side propagation bug.
- Judge rubric has some false-reject patterns (the "cannot confidently verify" hedge, and the try/catch contradiction with forge guidance). Noted in the transcript; AgentOS PR to tighten the rubric would cut ~30% of rejections.

### Documentation gaps (low priority)

- Blog post on the judge pattern for `agentos-live-docs/blog/`. Would pair with the rejection-reason histogram data.
- Forge FAQ at `docs/forge-faq.md` (user asked about docs coverage; ARCHITECTURE.md was refreshed but an FAQ would be its own doc).
- Landing page (About tab in dashboard) forge blurb — not inspected.

### Viz polish (optional follow-up to `2df7ccc`)

The viz rewrite shipped functional replacements. Polish candidates:
- Click-to-select colonist in the cloud (wire to `onSelectAgent` which already exists on the component).
- Lineage tree tooltip on node hover showing tool name + approval confidence.
- Metrics heatmap sparkline inside each tile showing the last N turns' trend.

## 9. Canonical file locations (most-edited this session)

```
src/runtime/
  orchestrator.ts                     turn loop, calls every LLM wrapper + cost tracker
  cost-tracker.ts                     ForgeStats, CacheStats, ProviderErrorStats, schemaRetries
  forge-rejection-classifier.ts       classifyForgeRejection
  emergent-setup.ts                   wrapForgeTool, validateForgeShape, inferSchemaFromTestCases
  llm-invocations/
    generateValidatedObject.ts        one-shot validated JSON (runtime side)
    sendAndValidate.ts                session-aware validated JSON
  schemas/                            6 runtime Zod schemas

src/engine/compiler/
  index.ts                            compileScenario orchestrates all 7 hooks
  schemas/milestones.ts               compile-side Zod
  llm-invocations/
    generateValidatedObject.ts        compile-side (mirrors runtime's, respects engine boundary)
    generateValidatedCode.ts          TS-code hook wrapper
    generateValidatedProse.ts         director text wrapper
    generateValidatedJson.ts          mock-friendly JSON wrapper (for milestones)
  telemetry.ts                        CompilerTelemetry aggregator
  generate-{progression,director,prompts,milestones,fingerprint,politics,reactions}.ts
  cache.ts                            COMPILE_SCHEMA_VERSION = 2

src/cli/
  server-app.ts                       HTTP + SSE server, ring buffer, /retry-stats
  pair-runner.ts                      runs the two leaders in parallel (now scenario-aware)
  retry-stats.ts                      aggregators for all four rollups
  custom-scenarios.ts                 unified scenario catalog (builtins + custom)
  sim-config.ts                       DEFAULT_MODELS, DEMO_MODELS, tier assignments

src/cli/dashboard/src/
  hooks/useRetryStats.ts              fetches /retry-stats
  hooks/useGameState.ts               aggregates SSE into GameState
  components/layout/CostBreakdownModal.tsx   RECENT RUNS panel (schemas/compile/forges/caches/providerErrors/rejection-reasons)
  components/viz/automaton/modes/
    mood.ts          Colonist Cloud (rewrite)
    forge.ts         Tool Lineage Tree (rewrite)
    ecology.ts       Metrics Heatmap (rewrite)
```

## 10. Cold-start steps for the new session

1. `cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm`
2. `git log --oneline -5` — confirm HEAD is at or descendant of `2df7ccc`.
3. `git status` — should be clean.
4. `curl -fsSL https://paracosm.agentos.sh/retry-stats | jq .` — pull live production telemetry to ground you in current reality.
5. Read this handoff doc plus any spec you intend to work from (`docs/superpowers/specs/`).
6. Pick a task from §8 or the user's new ask.
7. For any code change: use the targeted test command in §7 before pushing.
8. Push paracosm first (`git push origin master`). Then monorepo submodule pointer (`cd /Users/johnn/Documents/git/voice-chat-assistant && git add apps/paracosm && git commit && git push --no-verify origin master`).

## 11. User style summary

- Says "go" / "keep going" / "use superpowers" as continue-signals. Trusts you to make calls. Don't ask clarifying questions when a "go" is in context.
- Wants real shipped code over process theater. Specs + plans are welcome but the endgame is `git push`.
- Casual tone, sometimes frustrated phrasing ("rethink it all", "none of these actually work") — treat as legitimate signal, not hostility.
- Values evidence-backed decisions. When fixing a bug, pull live data if possible (SSH to server, `curl /retry-stats`) before changing code.
- Production stakes are real. ~100K users on a revenue platform. Everything ships to `paracosm.agentos.sh` via CI/CD.
