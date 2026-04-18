---
title: "Paracosm Dashboard Reliability Panel"
date: 2026-04-18
status: design — brief scope, execution-ready
scope: paracosm dashboard only (no runtime or server changes)
---

# Paracosm Dashboard Reliability Panel

Sub-projects A (compiler hook telemetry, 2026-04-18) and C (forge telemetry rollup, 2026-04-18) added `_cost.forgeStats`, `compile:*` schema entries in `/retry-stats`, and a `forges` rollup on the same endpoint. Nothing in the dashboard consumes any of it yet. This spec closes the visibility loop.

## Problem

The [CostBreakdownModal](../../../src/cli/dashboard/src/components/layout/CostBreakdownModal.tsx) renders `combined.schemaRetries` under SCHEMA RELIABILITY. That's the only place reliability data surfaces. Operators can't see:

- Forge approval rate for the current run (live in `_cost.forgeStats`)
- Cross-run trends from `/retry-stats` — runs-so-far-ever rollup with schema + forge aggregates
- Compile-time schema failures (they land in `/retry-stats` under `compile:*` names; current UI doesn't separate them from runtime entries)

## Goals

1. Render `forgeStats` for the current run in CostBreakdownModal, matching the SCHEMA RELIABILITY pattern.
2. Fetch `/retry-stats` once on modal open and on run completion; render a RECENT RUNS section showing schema + forge rollups across the last 100 runs.
3. Separate `compile:*` schemas from runtime schemas in the display so operators can see each class's health distinctly.

## Non-Goals

- Fetching continuously (once per open + once on `complete` is sufficient)
- Historical charting (simple table rendering only)
- Alert thresholds (display only; thresholds can come later)
- Mobile layout polish beyond the existing modal's responsive behavior

## Architecture

### Modified files

- [`src/cli/dashboard/src/hooks/useGameState.ts`](../../../src/cli/dashboard/src/hooks/useGameState.ts)
  - `CostBreakdown` gains `forgeStats?: { attempts, approved, rejected, approvedConfidenceSum }`
  - `evtCost` destructure reads it from SSE payloads
  - Per-leader assignment carries it through to `costA` / `costB`
  - Merge rule (sum fields element-wise) added alongside the existing `mergedSchemaRetries` logic

- [`src/cli/dashboard/src/hooks/useRetryStats.ts`](../../../src/cli/dashboard/src/hooks/useRetryStats.ts) [NEW]
  - Small hook that fetches `/retry-stats` and returns `{ data, loading, error, refresh() }`. Fetched on mount; `refresh()` exposed so modal can re-fetch when the run completes.

- [`src/cli/dashboard/src/components/layout/CostBreakdownModal.tsx`](../../../src/cli/dashboard/src/components/layout/CostBreakdownModal.tsx)
  - New FORGE RELIABILITY section below SCHEMA RELIABILITY, rendering `combined.forgeStats` when present
  - New RECENT RUNS section at the modal footer fetching via `useRetryStats`. Groups schema rows into "Runtime" and "Compile" using the `compile:` prefix. Forges rollup shown inline.
  - Modal opening triggers fetch; completion triggers refresh.

### Unchanged

- SSE payload schema (already carries `forgeStats`)
- `/retry-stats` response shape (already has `schemas` + `forges`)
- All runtime code

## Display shape

```
SCHEMA RELIABILITY                 (this run)
  schema          calls  avg att  fallbacks
  DepartmentReport    30     1.02          0
  ...

FORGE RELIABILITY                  (this run)
  attempts  approved  rejected  approval rate  avg conf
  12        10        2         83%            0.81

RECENT RUNS (last N from /retry-stats)
  [ Runtime schemas table: schemaName, calls, avgAttempts, fallbackRate ]
  [ Compile schemas table: schemaName (with compile: prefix stripped), calls, avgAttempts, fallbackRate ]
  [ Forges summary: runs, totalAttempts, approvalRate, avgApprovedConfidence ]
```

## Testing

- `src/cli/dashboard/src/hooks/useRetryStats.test.ts` — success path returns `{ data, loading=false }`; network error returns `{ error, data=null }`; `refresh()` triggers a second fetch.
- CostBreakdownModal: manual verification against a fresh run. Tests for the modal stay at their current coverage (React Testing Library isn't wired up on the dashboard; the existing tests use Vitest for pure logic).

## Performance

- `/retry-stats` response is ~5-15 KB. Fetched once on modal open + once on completion. Negligible.
- New FORGE RELIABILITY and RECENT RUNS sections add ~400 lines of cheap React rendering.

## Risks

1. **CORS on cross-origin deploys.** Server already sends `...corsHeaders` on `/retry-stats`, so the dashboard talks to the same origin and cross-origin isn't at play. No change.
2. **Stale data between runs.** Refresh on completion handles this. User manually reopening the modal also refetches.
3. **Missing forge data on old runs.** `.retry-stats.json` v1 (bare array) lacks forges; server-side back-compat loader from sub-project C returns `forges: []` for those entries, so the rollup shows `approvalRate: 0, runsPresent: 0` until fresh v2 runs accumulate.

## Success Criteria

- After a run completes, opening the Cost modal shows current-run forge stats and last-N recent runs trends.
- Compile schemas (`compile:*`) render in a separate table from runtime schemas.
- Closing and reopening the modal refetches `/retry-stats`.
- Network error on `/retry-stats` does not crash the modal; the RECENT RUNS section shows a small error hint.
