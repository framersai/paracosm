# P1.5 — Automated CHANGELOG + GitHub Release Notes

**Status:** design, awaiting approval
**Date:** 2026-04-22
**Scope:** second phase in the multi-phase generalization effort. P1 shipped the domain-agnostic schema rename as `0.5.0`. P1.5 adds release-notes hygiene so every subsequent phase (P2 multi-agent, P3 scoring, P4 adapters, P5 interventions, plus verticals) gets automatic entries. P1.5 does NOT touch runtime code; it is purely docs + CI.

---

## Motivation

Paracosm ships a new npm version on every library-change push to master. CI auto-versions as `${MAJOR}.${MINOR}.${github.run_number}` from `package.json` (see `.github/workflows/deploy.yml:255-266`). The current release flow uses GitHub's `gh release create --generate-notes`, which produces a bare commit-list body with no grouping, no narrative, no scope, no link cleanup. There is no `CHANGELOG.md` at the repo root. Consumers reading the npm page or the GitHub Releases page have no curated signal for what changed between versions.

This spec replaces `--generate-notes` with an in-repo generator that groups commits by conventional-commit type, preserves hand-written narrative summaries across regenerations, emits both a rolling `CHANGELOG.md` (committed) and a per-publish `release-notes.md` (ephemeral CI artifact passed to `gh release create --notes-file`), and backfills entries for `0.4.0` and `0.5.0` so the existing npm history gets documented.

Every subsequent phase (P2+) inherits this automation. Landing P1.5 before P2 means the P2 CHANGELOG entry writes itself on the publish that ships the multi-agent API.

---

## Architecture

**Two output files, one generator pass.**

```
scripts/generate-changelog.mjs    # ~100 lines, plain Node ESM, zero deps
CHANGELOG.md                      # committed; rolling; grouped by major.minor
release-notes.md                  # ephemeral CI artifact; .gitignored
.github/workflows/deploy.yml      # 3 edits (fetch-depth, new steps, --notes-file)
package.json                      # + "changelog" script for local runs
.gitignore                        # + release-notes.md
```

**Boundary model.** The `CHANGELOG.md` groups entries by `major.minor`. Every `0.5.<run_number>` publish (0.5.0, 0.5.1, 0.5.47) rolls into the single `## 0.5.0` entry. When a human bumps `package.json` from `0.5.0` to `0.6.0`, the `## 0.5.0` entry freezes and a new `## 0.6.0` entry starts. The boundary detection walks `git log --follow -p -- package.json` and yields the commits that actually changed the major.minor (filtering out CI run-number writes, which per `deploy.yml:263-264` never commit back to the repo).

**Rationale for major.minor vs per-run-number**: paracosm publishes dozens of `0.M.<N>` versions between human bumps. Per-run-number `CHANGELOG.md` entries would be unreadable. `release-notes.md` is the per-run-number view; it lives on each GitHub Release body. `CHANGELOG.md` is the slow-motion milestone view.

**Narrative preservation.** Each `## <version>` block in `CHANGELOG.md` may contain a hand-written narrative paragraph between the header line and the first `###` subsection. The generator reads the existing file before rewriting, extracts every narrative block by version, and splices it back into the regenerated output. Humans edit the narrative; CI preserves it.

**Idempotency.** Every CI run regenerates `CHANGELOG.md` + `release-notes.md` from full git history. If `CHANGELOG.md` is byte-identical to the pre-run version, the commit-back step is skipped (`git diff --quiet` gate). No infinite loop.

---

## Rollout sequence (single atomic commit per step)

1. **Add the generator script + tests.** `scripts/generate-changelog.mjs` + `tests/scripts/generate-changelog.test.ts`. Committed alone so it can be iterated against without touching CI.
2. **Add package.json script entry.** `"changelog": "node scripts/generate-changelog.mjs"`.
3. **Generate + hand-edit the backfill.** Run `npm run changelog` locally. The generator emits entries for every major.minor boundary it detects (0.2.0, 0.3.0, 0.4.0, 0.5.0). Delete the 0.3.0 and 0.2.0 entries (pre-npm-publish era). Hand-write narrative blocks on 0.4.0 and 0.5.0. Hand-recategorize scope-only commits (e.g., `dashboard:`, `landing:`, `topbar:`, `runtime:`) that landed in `Other` but belong in `Features` or `Bug Fixes`. Commit as `docs: seed CHANGELOG with 0.5.0 + 0.4.0 entries`.
4. **Add `.gitignore` entry for `release-notes.md`.**
5. **Wire into deploy.yml.** Three edits: `fetch-depth: 0`, new "Generate CHANGELOG and release notes" + "Commit CHANGELOG if changed" steps, swap `--generate-notes` for `--notes-file release-notes.md`.
6. **Verify on next CI run.** The first post-wiring master push that touches library code produces a real `gh release` with our formatted body plus auto-commits a CHANGELOG update.

---

## Generator algorithm (`scripts/generate-changelog.mjs`)

**Inputs**: the git log, the current `CHANGELOG.md` (if present), the current `package.json` version.

**Outputs**: `CHANGELOG.md` (overwritten) and `release-notes.md` (overwritten). Script always exits 0 on success.

**Algorithm**:

1. **Detect boundaries**: `git log --reverse --pretty=format:"%H" --diff-filter=M -- package.json`. For each commit, read the version at that commit via `git show <sha>:package.json` → JSON parse → `.version`. Keep only commits where the major.minor (first two segments) changed from the previous boundary. Prepend the initial commit as the first boundary (so pre-0.2.0 commits have a range start). Result: chronological array of `{ sha, date, version }` boundary records.

2. **Load existing narratives**: if `CHANGELOG.md` exists, parse each `## <version>` block with a regex. For each, capture everything between the `##` header line and the first `###` subsection (or end of block). Store as `narratives[version] = string` (may be empty / whitespace only).

3. **For each boundary** (newest first): slice commits with `git log --no-merges --pretty=format:"%H%x01%s%x01%b%x02" <prev_boundary_sha>..<this_boundary_sha>`. Parse each record (using `%x01` ASCII-SOH as field separator, `%x02` STX as record separator to tolerate commit bodies with newlines). For each commit:
   - **Skip if**: author is `github-actions[bot]`, OR subject equals `chore: update CHANGELOG` (self-references), OR subject starts with `Merge ` (belt-and-suspenders against `--no-merges` fallthrough).
   - **Classify**:
     - Subject matches `/^(\w+)(\([^)]+\))?!:/` → `breaking`
     - OR commit body contains the line `BREAKING CHANGE:` (conventional commit trailer) → `breaking`
     - Subject matches `/^feat(\([^)]+\))?:/` → `features`
     - Subject matches `/^fix(\([^)]+\))?:/` → `bugfixes`
     - Subject matches `/^perf(\([^)]+\))?:/` → `performance`
     - Otherwise → `other`
   - **Render bullet**: strip the `type(scope):` / `type!:` / `type:` prefix for all except `other` (for `other`, keep the full subject so scope-only commits like `dashboard: X` read naturally). Format: `- <cleaned-subject> ([<shortsha>](https://github.com/framersai/paracosm/commit/<fullsha>))`.

4. **Emit CHANGELOG.md**:
   ```markdown
   # Changelog

   <standard header paragraph about format + linking>

   ## <version> (<YYYY-MM-DD>)

   <narrative block, or blank>

   ### Breaking Changes
   - ...

   ### Features
   - ...

   ### Bug Fixes
   - ...

   ### Performance
   - ...

   <details>
   <summary>Other</summary>

   - ...
   </details>

   ---

   ## <next version entry>
   ...
   ```
   Omit empty subsections. Omit `<details>` when `other` bucket is empty. Order: newest version first.

5. **Emit release-notes.md**: same grouping, but the range is `<latest v*-tag>..HEAD` (detect with `git describe --tags --abbrev=0 --match 'v*' 2>/dev/null`, fall back to the newest boundary's sha if no tag exists). No narrative block. No `<details>` collapse. No `# Changelog` header. Just the entry body for the upcoming publish. When no commits are in the range, write a one-line body: `Maintenance release; no user-facing changes.`

6. **Exit 0**. Always. If nothing changed, the files get overwritten with identical bytes and the CI's `git diff --quiet CHANGELOG.md` gate skips the commit step.

**What the script does NOT do**:
- Parse PR metadata (no API calls, works offline).
- Dedupe commits that appear in both the CHANGELOG entry and release-notes.md (they intentionally overlap; readers see each from a different vantage).
- Validate that commit messages follow conventional format (scope-only / prefixless commits silently land in `Other`).
- Emit entries for boundaries below a configured floor. The script has a constant `const EARLIEST_BOUNDARY_MAJOR_MINOR = '0.4.0'` near the top. Boundaries whose major.minor sorts lower are skipped. This matches the backfill-scope choice (0.5.0 + 0.4.0 only) and prevents the script from regenerating 0.3.0 / 0.2.0 entries the human deleted once. If the project later decides to include older history, the constant is the single place to change.

**Script structure**: `generate-changelog.mjs` exports its pure functions (`parseCommit`, `classifyCommit`, `extractNarratives`, `renderEntry`, `detectBoundaries`) as named exports, and executes a `main()` function only when invoked directly (the `import.meta.url === pathToFileURL(process.argv[1]).href` guard). Tests import the named exports without side effects.

**Error handling**: any unexpected failure (git command returns non-zero, JSON parse on `package.json` throws, file write fails) bubbles up as an unhandled rejection or thrown error, which Node reports and exits non-zero. CI surfaces the failure; we do not swallow errors to keep the publish flow "robust" because a silent changelog failure that looks like success is worse than a loud failure that blocks the publish.

---

## CI wiring precision (`.github/workflows/deploy.yml` edits)

**Edit 1** — `publish` job checkout (current lines 209-213):

```yaml
# before
- uses: actions/checkout@v4
  with:
    fetch-depth: 2

# after
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
```

The full history is needed so the boundary detection can walk every `package.json` change back to the first boundary.

**Edit 2** — insert two new steps AFTER the existing "Auto-version from run number" step (currently line 255-266), BEFORE "Publish to npm":

```yaml
- name: Generate CHANGELOG and release notes
  if: steps.changes.outputs.library_changed == 'true'
  run: node scripts/generate-changelog.mjs

- name: Commit CHANGELOG if changed
  if: steps.changes.outputs.library_changed == 'true'
  run: |
    if ! git diff --quiet CHANGELOG.md; then
      git config user.name "github-actions[bot]"
      git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
      git add CHANGELOG.md
      git commit -m "chore: update CHANGELOG"
      git push origin HEAD:master
    fi
```

Placement matters: the version-bump step writes `package.json` in-place but does NOT commit. The CHANGELOG generator runs AFTER the bump so the new run-number version is visible in the working tree, but the generator's boundary detection reads commit history (not working-tree contents) so the uncommitted bump doesn't pollute boundaries.

The commit-back uses the default `GITHUB_TOKEN` (no PAT). The bot-authored commit has author `github-actions[bot]`, which the generator's skip filter recognizes on subsequent runs. The default token's commits do NOT retrigger workflows by design, eliminating infinite-loop risk.

**Edit 3** — swap `--generate-notes` for `--notes-file` in the Create GitHub Release step (currently line 274-282):

```yaml
# before
- name: Create GitHub Release
  if: steps.changes.outputs.library_changed == 'true'
  run: |
    gh release create "v${{ steps.version.outputs.version }}" \
      --title "v${{ steps.version.outputs.version }}" \
      --generate-notes \
      --latest
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

# after
- name: Create GitHub Release
  if: steps.changes.outputs.library_changed == 'true'
  run: |
    gh release create "v${{ steps.version.outputs.version }}" \
      --title "v${{ steps.version.outputs.version }}" \
      --notes-file release-notes.md \
      --latest
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Backfill procedure

Run once, locally, before wiring CI:

1. `cd apps/paracosm && node scripts/generate-changelog.mjs` with `EARLIEST_BOUNDARY_MAJOR_MINOR = '0.4.0'` in place. This emits two auto-generated entries: `## 0.5.0 (2026-04-21)` and `## 0.4.0 (<date>)`. Full commit coverage, every commit in each range classified into one of the five groups.

2. **Hand-write narrative for 0.5.0** at top of that entry:

   > Domain-agnostic schema rename. `LeaderConfig.colony` renamed to `.unit`, `SimulationState.colony` renamed to `.systems`, every `SimEvent` payload field renamed in lockstep, the `'colony_snapshot'` event type renamed to `'systems_snapshot'`, public types `ColonyPatch` and `applyColonyDeltas` renamed to `SystemsPatch` and `applySystemDeltas`, CLI flag `--colony` renamed to `--unit`. Saved-run migration helper aliases legacy field names on read so pre-0.5 output JSON and stored sessions still load cleanly. Cache busted via `COMPILE_SCHEMA_VERSION` bump, forcing regeneration of every pre-0.5 compiled scenario hook on next run.

3. **Hand-write narrative for 0.4.0**:

   > First npm-published release series. Multi-event turns, Event Director with cross-turn planning, Zod schema validation on every structured LLM call, session-aware `sendAndValidate` wrapper preserving conversation memory across validation retries, cost tracking with per-call-site rollup, stored sessions with replay, seed enrichment and citation provenance, `costPreset` economy mode for cheap iteration, universal `e.data.summary` on every event, `createParacosmClient` factory with `PARACOSM_*` env-var config, discriminated `SimEvent` union with per-type payload narrowing.

4. **Hand-recategorize scope-only commits** where misplaced. Scan the `Other` section of each entry for commits like `dashboard: fix contrast on gradient rows` (actually a Bug Fix) and `topbar: unify REPLAY + RUN + LOAD into a single dropdown` (actually a Feature). Move each to its correct section, prefixing with the scope to keep context: `- dashboard: fix contrast on gradient rows ([6a9e0d8](...))`. This is a one-shot manual pass; future commits will use conventional prefixes.

5. Commit: `docs: seed CHANGELOG with 0.5.0 + 0.4.0 entries`.

Post-backfill, every CI run regenerates mechanically. Future phases (P2+) write their CHANGELOG entries automatically from conventional-commit prefixes; only narrative blocks need human input, added via a short editing session after the first publish of each new major.minor.

---

## Risks + edge cases

**Risks**

1. **Narrative preservation fails silently.** If the narrative parser's regex mistakes a section marker, a human-written summary could be lost on regeneration. Mitigation: the test suite includes a case that regenerates against an existing CHANGELOG with a known narrative and asserts byte-identical narrative content in the output. CI never deletes work that the parser round-trips.

2. **Scope-only commits keep landing in `Other` forever.** Post-backfill, commits like `dashboard: X` will keep landing in `Other` unless contributors adopt `feat(dashboard): X`. Mitigation: add a one-line note to `README.md` or `CONTRIBUTING.md` naming the conventional prefixes the generator recognizes. Out-of-scope: enforcing it via a commit-message hook.

3. **Force-push to master corrupts boundary detection.** If a boundary commit gets rewritten or force-removed, the generator's chronology breaks. Mitigation: the user's standing rule bans force-push to master. No additional code needed.

4. **`gh release create` with `--notes-file` fails on empty file.** If the range produced no commits (e.g. a library-change push that was only README edits), the generator writes the one-line `Maintenance release; no user-facing changes.` body so `gh release create` always has non-empty input.

5. **The auto-version step writes `package.json` with run-number before the CHANGELOG runs.** This is a non-issue for the generator because boundary detection reads history via `git show <sha>:package.json`, never the working-tree file. The uncommitted bump is invisible to boundary logic. There is no "current unreleased version" concept in the output: the topmost entry is always the most recent committed major.minor boundary.

**Edge cases handled explicitly**

- **Empty initial range**: if the earliest boundary's `prev_sha` resolves to a root commit (no parents), slice `<root_sha>..<boundary_sha>` works natively with git.
- **Commit subjects with backticks, angle brackets, or other markdown-sensitive chars**: left as-is. Markdown renders them safely inside list items. Code blocks with triple-backticks inside commit subjects are extremely rare; if one occurs and breaks rendering, we fix that commit's output by hand.
- **Very long commit subjects**: no truncation. GitHub's Release page and CHANGELOG.md both wrap naturally.
- **Commits authored via `Co-Authored-By` trailers**: the generator ignores co-authors entirely; only the primary author is used for the `github-actions[bot]` skip filter.
- **A boundary commit classified as breaking vs feature**: if `9d00630 feat!: rename ...` is the 0.5.0 boundary itself, it appears in the 0.5.0 entry's Breaking Changes section. That's correct; it's the commit that DEFINES the 0.5.0 bump.
- **`BREAKING CHANGE:` trailer on a non-`!:` subject**: the body scan catches it. Both paths route to the `breaking` bucket.

---

## Testing plan

**Unit tests** — `tests/scripts/generate-changelog.test.ts`:

- Parser cases:
  - `feat(runtime): X` → `features` bucket, bullet renders as `- runtime: X`
  - `fix: Y` → `bugfixes` bucket, bullet renders as `- Y`
  - `feat!: Z` → `breaking` bucket
  - `refactor: A\n\nBREAKING CHANGE: does something` → `breaking` bucket via body scan
  - `dashboard: hotfix contrast` (scope-only) → `other` bucket, bullet renders as `- dashboard: hotfix contrast`
  - `chore: bump dep` → `other`
  - `perf: tighten hot loop` → `performance`
  - Subject starting with `Merge ` → skipped even if `--no-merges` missed it
  - Author `github-actions[bot]` → skipped
  - Subject `chore: update CHANGELOG` → skipped regardless of author

- Narrative preservation:
  - Input CHANGELOG with a narrative block under `## 0.5.0` → regenerated output contains the same narrative bytes (test asserts string equality on the extracted block).
  - Input CHANGELOG with no narrative under `## 0.5.0` → regenerated output has blank narrative placeholder (not a garbled one).
  - Input CHANGELOG with narrative under `## 0.5.0` AND a new boundary `## 0.6.0` in git history (no narrative yet) → both narratives preserved where present, blank where absent.

- Boundary detection:
  - `package.json` unchanged across N commits → single boundary
  - Multiple major.minor bumps → multiple boundaries, chronologically ordered
  - Patch-only version changes (`0.5.0` → `0.5.1`) ignored (but this case can't happen in practice since CI never commits back the patch bump)

- Output shape:
  - Every non-empty subsection rendered; empty subsections omitted.
  - `other` bucket always wrapped in `<details>` when non-empty (CHANGELOG.md only; release-notes.md renders flat since GitHub Release UI handles details poorly).
  - Short-sha link format matches `[<7chars>](https://github.com/framersai/paracosm/commit/<40chars>)`.

**Integration tests** — none at the CI level. The script runs against real git state during the CI publish job; the first post-wiring push is the integration test. If it produces a broken `CHANGELOG.md`, the commit-back fails and master stays unchanged; we fix the script and retry.

**Manual verification pre-commit** (part of the execution plan):

- `npm run changelog` locally produces the backfill file with 0.5.0 and 0.4.0 entries.
- Hand-review: every `Features`, `Bug Fixes`, `Performance` subsection reads naturally; no misclassified commits (the hand-recategorize step).
- `release-notes.md` generated in the same run contains only the 5 post-0.5.0 commits (since no `v*` tag exists yet, fallback to the last boundary).

**Post-deploy verification** (one-shot, after the CI wiring commit lands):

- First library-change push to master triggers a real CI run.
- CI's publish job: `library_changed=true` → CHANGELOG regenerated → diff against committed version → if different, auto-commit + push.
- `gh release create v0.5.<N>` uses `--notes-file release-notes.md` → Release page at `github.com/framersai/paracosm/releases/tag/v0.5.<N>` shows the formatted body.
- Subsequent library-change pushes: CHANGELOG stays stable (no diff) → no commit-back fires.

---

## Acceptance criteria

- `scripts/generate-changelog.mjs` exists; `node scripts/generate-changelog.mjs` runs offline with no deps.
- Running the generator against current master produces `CHANGELOG.md` with `## 0.5.0` + `## 0.4.0` entries and `release-notes.md` with post-0.5.0 commits.
- Unit test suite (`tests/scripts/generate-changelog.test.ts`) passes all cases above.
- `.gitignore` contains `release-notes.md`.
- `package.json` has `"changelog": "node scripts/generate-changelog.mjs"`.
- `.github/workflows/deploy.yml` has `fetch-depth: 0`, the two new steps, and `--notes-file release-notes.md` in the Create GitHub Release step.
- After CI wiring commit lands, the next library-change push produces a GitHub Release with our formatted body AND an auto-committed CHANGELOG update.
- `CHANGELOG.md` at commit time contains hand-written narratives for 0.5.0 and 0.4.0 entries.

---

## Out of scope

- Automating narrative generation (LLM summaries of commit ranges). Nice-to-have for P1.5.1 or later.
- Per-run-number entries in `CHANGELOG.md`.
- Backfilling 0.3.0 / 0.2.0 / 0.1.0 entries. Pre-npm-publish history not consumer-facing.
- Retroactive GitHub Release body rewrites for already-published versions.
- Slack / Discord release announcements.
- Enforcing conventional-commit prefixes via a commit-message hook or CI check.
- Per-scope subsection grouping inside a single entry (e.g. `### Features - runtime` and `### Features - dashboard`). Flat list per bucket reads fine.
- Handling submodules, reverts, or amended commits specially. Treated as regular commits.

---

## Follow-ups (deferred to later specs)

- **P1.5.1 (optional)**: LLM-generated narrative summary per entry, gated behind a manual opt-in so API cost is opt-in and the human review gate stays.
- **P1.5.2 (optional)**: add a `CONTRIBUTING.md` section naming the conventional commit prefixes this repo uses (`feat:`, `fix:`, `perf:`, `feat!:` for breaking). Small, independent of P1.5 but improves generator output quality over time.
- **P2**: Multi-agent / peer mode (`runArena`). The first phase that will actually exercise the new CHANGELOG machinery end-to-end.
- **P3 / P4 / P5 / verticals**: all inherit P1.5's automation with zero additional work.
