---
date: 2026-04-24
status: design
related:
  - paracosm T4.4 (originally framed as "Zod-v4 migration finish"; reality is test-fixture drift, not Zod)
---

# Test Fixture Type-Drift Cleanup

## Problem

The roadmap entry T4.4 (`Zod-v4 migration finish`) is stale. paracosm already pins `zod@^4.3.6` and the installed version IS `4.3.6`. There are no deprecated Zod-v3 patterns in `src/`. `npx tsc --noEmit -p tsconfig.build.json` (build config) returns 0 errors.

The "pre-existing tsc warnings" the prior session referenced were actually 38 errors that surface when running `npx tsc --noEmit` against the root tsconfig (which includes test files). They split into 6 categories of test-fixture drift behind production type renames that test code never followed.

## Verified error categories

| # | Pattern | Count | Files |
|---|---|---:|---|
| 1 | `colony` field renamed to `unit` on `LeaderConfig` (universal vocab change for non-Mars scenarios) | 19 | `src/cli/sim-config.test.ts`, `tests/cli/sim-config.test.ts`, `tests/runtime/batch.test.ts` |
| 2 | `year` field renamed to `time` on `HexacoSnapshot` (same universal-vocab change) | 6 | `src/runtime/hexaco-cues/trajectory.test.ts` |
| 3 | `BatchConfig.maxConcurrency` became required, test literal omits it | 1 | `tests/runtime/batch.test.ts` |
| 4 | `capturedRun!.economicsProfile / sourceMode` resolves to `never` after a runner-type contract change | 2 | `tests/cli/server-app.test.ts` |
| 5 | `GenerateTextFn` signature changed (now requires `system` arg); test mocks still use the legacy `(args: { prompt: string })` shape | 3 | `tests/engine/compiler/retry-feedback.test.ts` |
| 6 | Legacy fixture + `.mjs` import without declaration file (implicit any) | 4 | `tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0/progression.ts`, `tests/scripts/generate-changelog.test.ts` |

Total: 38 errors. Categories 1, 2, 3 are mechanical (28 errors). Categories 4, 5, 6 need bespoke fixes (10 errors).

## Architecture

None. Production types are the source of truth and stay unchanged. The renames (`colony` to `unit`, `year` to `time`) were intentional moves toward universal vocab so paracosm supports submarines, medieval kingdoms, and any other scenario family beyond Mars colonies. Test fixtures and the legacy 0.4-cache fixture just never got updated when those renames landed.

This is pure test-fixture maintenance. Zero behavior changes in `src/`. Zero schema changes. Zero new tests. Success is measured by tsc going from 38 errors to 0.

## Implementation order

1. **Mechanical sweep** sed `colony:` to `unit:` in 3 files; sed `year:` to `time:` in 1 file. Run tsc, expect 28 errors gone.
2. **`tests/runtime/batch.test.ts:29`** add `maxConcurrency: <small int>` to the BatchConfig test literal.
3. **`tests/cli/server-app.test.ts:235-236`** read `capturedRun` declaration, see whether the new runner-result type still has `economicsProfile / sourceMode` or whether they moved. If moved, update the assertions; if removed, drop them; if test was wrong from the start, fix the assertion to match the actual contract.
4. **`tests/engine/compiler/retry-feedback.test.ts`** read `GenerateTextFn` definition, update the 3 mock callbacks to match the current signature.
5. **`tests/fixtures/legacy-0.4-cache/test-scenario-v1.0.0/progression.ts:1`** add explicit `(ctx: any)` annotation. The fixture is a frozen 0.4-era artifact, do not modernize it; just satisfy the type checker.
6. **`tests/scripts/generate-changelog.test.ts`** add a one-line `.d.mts` declaration file for the `generate-changelog.mjs` import (or use `// @ts-expect-error import-from-mjs`); add explicit `any` annotations for the two parameters flagged as implicit any.

After each step, run `npx tsc --noEmit` and verify the error count drops as expected.

## Verification

```bash
cd apps/paracosm
npx tsc --noEmit
# Expected: 0 errors

npm test
# Expected: same pass count as before (no behavior change)

# Em-dash sweep on every file touched (the unicode em-dash codepoint, not regex `.`)
git diff --name-only HEAD | xargs perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' || echo clean
```

Plus the targeted-tests rule: only run the test files that map to the changed fixtures, not the full suite.

## Out of scope

- **Adding a CI gate** to enforce `tsc --noEmit` clean on the root config (separate workflow change; deferred until this baseline lands)
- **Renaming or modernizing the `legacy-0.4-cache` fixture** (frozen test artifact representing the 0.4-era cache format; only fixing the implicit-any so the type checker stops complaining)
- **Investigating WHY the renames left tests behind** (probably the renames predate the rigorous root-tsconfig tsc gate; not actionable now)

## Migration

None. No npm publish, no submodule pointer changes outside paracosm, no consumer-side updates. Single-commit ship in the paracosm submodule plus a monorepo pointer bump.

## Roadmap update

The roadmap entry for T4.4 in `docs/superpowers/plans/2026-04-23-paracosm-roadmap.md` gets a copy update in the same commit:

> **T4.4** | **Test fixture type-drift cleanup** SHIPPED 2026-04-24 | audit track | done | Cleared 38 root-tsconfig tsc errors that piled up behind universal-vocab renames (`colony` to `unit`, `year` to `time`) plus a few signature changes. Production types unchanged.
