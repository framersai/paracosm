# Design: Quickstart onboarding flow (prompt or URL or PDF to 3 leaders to fork to export)

**Date:** 2026-04-24
**Status:** Approved for execution (Q1 C, Q2 A, Q3 A + preset library, Q4 C).
**Scope:** New `Quickstart` tab in the dashboard plus the programmatic API behind it. User supplies a seed (paste text, URL, or PDF), paracosm compiles a scenario, generates 3 contextual HEXACO leaders, runs them in parallel, and lands the user in a 3-column result view with download, share, and fork actions. Repositions paracosm from "scenario JSON in hand" to "prompt in hand".

**Depends on:** Tier 2 Spec 2A + 2B (shipped in [`161f1e4d`](#), [`50df9625`](#)). Fork modal, Branches tab, `WorldModel.fork`, `captureSnapshots`, SSE artifact bridge, and `/setup` body-size cap all already live in master.

**Non-breaking.** Additive dashboard tab, additive API methods, additive server endpoints. The existing scenario-JSON flow keeps working identically.

---

## 1. Problem

Paracosm today gates adoption on the user having a scenario JSON or the patience to hand-author one. The README charter added on 2026-04-24 says the opposite: "JSON is the contract, not the product boundary. The next API layer should be a one-call prompt/document wrapper that asks an LLM to propose that same JSON contract, validates it, then compiles and runs it."

The competitive landscape reinforces this. [MiroFish](https://github.com/666ghj/MiroFish) (57K stars) and its upstream [OASIS](https://openreview.net/forum?id=JBzTculaVV) onboarded viral traffic by accepting a news article or document upload and returning a trajectory in minutes. Paracosm's stronger wedge is audited decision simulation (typed JSON, deterministic kernel, fork/resume, HEXACO, citations, forgeable tools), but the onboarding friction is higher. A user visiting `paracosm.agentos.sh` today has to either run the pre-baked Mars demo or author JSON before getting any paracosm-specific value.

Quickstart closes that gap. A visitor pastes a brief or drops a PDF and is watching three different HEXACO leaders diverge against the same scenario within 60 seconds.

## 2. Feasibility (verified)

Every piece except the seed-to-scenario LLM call already exists.

- `compileScenario` already accepts a `scenario` JSON plus optional `seedText` / `seedUrl` for research grounding ([src/engine/compiler/index.ts](../../src/engine/compiler/index.ts)).
- AgentOS `WebSearchService` (Firecrawl, Tavily, Serper) already powers paracosm's seed-ingestion pipeline ([src/engine/compiler/seed-ingestion.ts](../../src/engine/compiler/seed-ingestion.ts)).
- `runBatch` already runs N leaders in parallel ([src/runtime/batch.ts](../../src/runtime/batch.ts)).
- SSE artifact bridge from Spec 2B lands the full `RunArtifact` on the dashboard per leader via `useSSE.results[i].artifact`.
- Fork modal, Branches tab, and `WorldModel.forkFromArtifact` are shipped.
- Session-replay URLs (`/sim?replay=<sessionId>`) already exist and are read by `App.tsx` via `useReplaySessionId`.
- Dashboard tab routing is open-list and tolerates a new entry. `TabBar.tsx` has its own `Tab` union plus `TABS` array that need a one-line addition each.

The one new LLM-driven step is "propose a paracosm world JSON from a seed". This is a structured-output call against a Zod schema that mirrors the compile-input shape (id, labels, setup, departments, metrics). It is new work but bounded.

## 3. Design

### 3.1 Programmatic API: `WorldModel.fromPrompt` + `wm.quickstart`

Two new methods on the existing `WorldModel` façade ([src/runtime/world-model/index.ts](../../src/runtime/world-model/index.ts)).

```typescript
import { WorldModel } from 'paracosm/world-model';

// Compile a world model from a seed.
const wm = await WorldModel.fromPrompt({
  seedText: '...',            // one of seedText / seedUrl / seedPdf
  domainHint: 'clinical trial decision-making',
}, compileOptions);           // standard CompileOptions (provider, model, etc.)

// Run three contextually-generated leaders in parallel.
const result = await wm.quickstart({
  leaderCount: 3,
  seed: 42,
  maxTurns: 6,
  captureSnapshots: true,
});
// result: { scenario: ScenarioPackage, leaders: LeaderConfig[], artifacts: RunArtifact[] }
```

`fromPrompt`:
1. Resolves `seedUrl` to text via `WebSearchService` when supplied. Extracts PDF text client-side in the dashboard path; the API accepts extracted text only.
2. Calls an LLM with a Zod-validated output schema that matches `compileScenario`'s input shape: `{ id, labels: { populationNoun, settlementNoun, timeUnitNoun, name, currency }, setup: { defaultTurns, defaultPopulation, defaultStartTime, defaultSeed }, departments: [...], metrics: [...], theme? }`.
3. Routes the validated draft into the existing `compileScenario` pipeline with `seedText` wired through so the research-grounding stage still pulls citations.
4. Returns a `WorldModel` instance wrapping the compiled scenario.

`quickstart`:
1. Calls an LLM with a Zod-validated schema to generate `leaderCount` `LeaderConfig` entries. Each entry has a contextually-fitting name, archetype, HEXACO profile, and `unit` label. Archetypes are designed to diverge: extreme `openness` vs conscientiousness, prosocial vs self-interested, etc.
2. Calls `runBatch({ scenarios: [this.scenario], leaders, turns: maxTurns, seed, captureSnapshots })`.
3. Returns `{ scenario, leaders, artifacts }` with one artifact per leader.

`fromPrompt` delegates all validation to the compile-input Zod schema. A hallucinated world JSON that fails Zod parse is retried once against the LLM with the error report in the prompt; a second failure surfaces as an exception.

### 3.2 New compiler entry point: `compileFromSeed`

`src/engine/compiler/compile-from-seed.ts`:

```typescript
export async function compileFromSeed(
  seed: { text: string; domainHint?: string; sourceUrl?: string },
  options: CompileOptions & { draftModel?: string } = {},
): Promise<ScenarioPackage>;
```

Structure:
- Calls `generateValidatedObject` against `DraftScenarioSchema` (a new Zod schema matching the subset of compileScenario's input that the LLM needs to propose).
- Populates deterministic fields server-side: generates a short slug id, fills `setup.defaultSeed` from `options.seed || Math.floor(Math.random() * 10000)`, copies `seed.sourceUrl` into `labels.sourceUrl` for attribution.
- Calls `compileScenario(draft, { ...options, seedText: seed.text, seedUrl: seed.sourceUrl })`.
- Returns the compiled `ScenarioPackage`.

The compile-input schema matches what Mars / Lunar already ship. No scenario-shape divergence.

### 3.3 Preset leader library: `src/engine/leader-presets.ts`

A curated library of archetypal leaders with HEXACO profiles. Structure:

```typescript
export interface LeaderPreset {
  id: string;
  name: string;
  archetype: string;
  description: string;
  hexaco: HexacoProfile;
}

export const LEADER_PRESETS: Readonly<Record<string, LeaderPreset>>;
export function getPresetById(id: string): LeaderPreset | undefined;
export function listPresetsByTrait(trait: keyof HexacoProfile, high: boolean): LeaderPreset[];
```

Exposed via new subpath `paracosm/leader-presets` (added to `package.json` `exports`). Initial library covers 10 archetypes:

| id | archetype | high | low |
|---|---|---|---|
| `visionary` | The Visionary | openness, extraversion | conscientiousness, emotionality |
| `pragmatist` | The Pragmatist | conscientiousness, honestyHumility | openness |
| `innovator` | The Innovator | openness | conscientiousness, agreeableness |
| `stabilizer` | The Stabilizer | conscientiousness, agreeableness | openness |
| `crisis-manager` | The Crisis Manager | extraversion, conscientiousness | emotionality |
| `growth-optimist` | The Growth Optimist | extraversion, openness | honestyHumility |
| `protocol-builder` | The Protocol Builder | conscientiousness, honestyHumility | extraversion |
| `social-architect` | The Social Architect | agreeableness, extraversion | openness |
| `cost-cutter` | The Cost Cutter | conscientiousness | agreeableness, emotionality |
| `compliance-hawk` | The Compliance Hawk | honestyHumility, conscientiousness | openness |

The library is dual-use:
- Dashboard ForkModal + Quickstart "Swap leader" control read from it.
- External API consumers pull it via `import { LEADER_PRESETS } from 'paracosm/leader-presets'` for programmatic `runBatch` sweeps.

### 3.4 New server endpoints

All three are additive, thin wrappers over existing runtime calls. Same rate-limit bucket as `/setup`.

**`POST /api/quickstart/fetch-seed`**: `{ url }` → `{ text, title, sourceUrl }`.
- Validates URL shape (http/https only, max length).
- Calls `WebSearchService.fetchSingleUrl(url)`.
- Returns main article text (max 50 KB) + title + normalized URL.
- 400 on invalid URL; 502 on fetch failure; 413 if extracted text exceeds 50 KB (truncates and flags in response).

**`POST /api/quickstart/compile-from-seed`**: `{ seedText, domainHint?, sourceUrl? }` → `{ scenario, scenarioId }`.
- Validates `seedText.length` is between 200 and 50 000 chars.
- Calls `compileFromSeed`.
- Inserts the compiled scenario into the server's in-memory scenario catalog as the active scenario for this session.
- Returns the compiled `ScenarioPackage` + its generated id.

**`POST /api/quickstart/generate-leaders`**: `{ scenarioId, count = 3 }` → `{ leaders: LeaderConfig[] }`.
- Resolves `scenarioId` against the server's scenario catalog (must match the current active scenario).
- Calls the leader-generation LLM with the scenario's labels and departments as context.
- Validates `leaders` against Zod; each HEXACO trait must be in [0, 1].
- Returns `{ leaders }` of length `count`.

**Extend `POST /setup`**: no new endpoint, one relaxation:
- Today enforces `leaders.length === 2` inside `normalizeSimulationConfig` (single-leader is allowed only when `forkFrom` is present per Spec 2B).
- Relax to `leaders.length >= 1`; when `length === 2` dispatch to `runPairSimulations` (existing); when `length >= 3` dispatch to new `runBatchSimulations` (see 3.5); single-leader path when `forkFrom` present stays as-is.

### 3.5 New pair-runner entry point: `runBatchSimulations`

Generalization of `runPairSimulations` for N >= 2 leaders. Same SSE contract per-leader (broadcast `result` with per-leader summary + `artifact` when `captureSnapshots: true`), no verdict generation (verdicts are pairwise and would be ambiguous across 3+ leaders; Quickstart surfaces group-median deltas instead). Reuses the existing `Promise.allSettled` + per-leader abort-on-disconnect pattern.

Public signature:

```typescript
export async function runBatchSimulations(
  simConfig: NormalizedSimulationConfig,
  broadcast: BroadcastFn,
  signal?: AbortSignal,
  scenario: ScenarioPackage = marsScenario,
): Promise<void>;
```

### 3.6 Dashboard UI: QuickstartView

**New first-position tab.** Inserted at the head of `DASHBOARD_TABS`: `['quickstart', 'sim', 'viz', 'settings', 'reports', 'branches', 'chat', 'log', 'about']`. Default tab for fresh loads changes from `'sim'` to `'quickstart'`. `?tab=sim` override keeps working.

**Three phases with a single React state machine.**

**Phase 1: Input.** `SeedInput` component with three tabs.
- **Paste:** `textarea` with a 200-50 000 char counter. Auto-expands. Disabled submit while short.
- **URL:** `input[type=url]` with a live normalization preview. Submit fetches via `/api/quickstart/fetch-seed` and flips to the Paste tab with the fetched text pre-filled so the user can review before compile.
- **PDF:** file-drop zone plus file-picker. PDF parsed client-side via lazy-loaded `pdfjs-dist`. Extracted text flows into the Paste tab, same review step as URL. Max 10 MB file, max 50 KB extracted text, size warnings inline.

Below the input: an optional one-word "Domain hint" field (for example, `clinical trial` or `startup growth`) that passes through to `compileFromSeed` as `domainHint`. The seed text is already enough; the hint just sharpens the LLM-generated nouns and metrics when the seed is genre-ambiguous.

CTA: `Generate + Run 3 Leaders`.

**Phase 2: Progress.** `QuickstartProgress` component. Four stages with independent status icons: (1) Compile scenario, (2) Ground with research citations, (3) Generate 3 leaders, (4) Run 3 simulations in parallel with per-leader turn counters. Stage 4 surfaces live SSE `turn_done` counts for each leader tag. "Cancel" button aborts the active simulation via the existing abort signal.

**Phase 3: Results.** `QuickstartResults` component. Three-column grid at desktop, stacked at mobile.

Each leader card carries:
- Leader name + archetype.
- Compact HEXACO bar chart (six bars, 0-1 scale).
- Fingerprint string (`metadata.fingerprint`).
- Top 4 metric deltas vs group median (new `computeMedianDeltas` helper; same `BranchDelta` shape as Spec 2B, different comparison anchor).
- **Download JSON** button (triggers `a[download]` with the full `RunArtifact`).
- **Copy share link** button (copies `${origin}/sim?replay=${sessionId}&view=quickstart`).
- **Fork this leader at turn N** control with a turn-number dropdown. Click dispatches `SET_PARENT` on `BranchesContext` with this leader's artifact, then navigates to `branches` tab with `forkModalAtTurn` preset. The existing Spec 2B fork flow runs from there.
- **Swap leader** link on the card header. Opens `LeaderPresetPicker` modal (reads `LEADER_PRESETS`), lets the user replace this leader with a preset and re-run just that one leader (single-leader POST to `/setup` with the current scenario, same seed). Minimal MVP variant: re-run the whole trio, not just one leader. Swap is opt-out via a setting so power users can iterate on a single slot.

**Share-link replay handling.** When the dashboard loads `?replay=<id>&view=quickstart`, the existing replay machinery pulls the stored events; a new effect in `QuickstartView` detects `view=quickstart` and (once the events settle) bypasses the Input phase, reconstructs the 3 artifacts from `useSSE.results[i].artifact`, and lands on Phase 3 directly. Replay IS read-only: no Fork action from a replay, per the Spec 2B precedent.

**Fork propagation via `SET_PARENT`.** Extend `BranchesContext` with one new action:
```typescript
| { type: 'SET_PARENT'; artifact: RunArtifact }
```
Reducer behavior: `{ ...state, parent: action.artifact, branches: [] }` (resets branch stack when promoting a new parent). Distinct from `PARENT_COMPLETE` because it's explicitly user-initiated; reduces confusion about which leader is the current fork root.

### 3.7 Pure helpers (unit-testable)

`src/cli/dashboard/src/components/quickstart/QuickstartView.helpers.ts`:
- `extractPdfText(file: File, maxBytes: number): Promise<{ text: string; truncated: boolean; pages: number }>`.
- `validateSeedUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string }`.
- `validateSeedText(raw: string, minChars: number, maxChars: number): { ok: true } | { ok: false; reason: 'too-short' | 'too-long' }`.
- `computeMedianDeltas(artifact: RunArtifact, peers: RunArtifact[]): BranchDelta[]`: same `BranchDelta` shape as Spec 2B, compares each artifact's `finalState` bags against the peer-group median value.
- `buildQuickstartShareUrl(origin: string, sessionId: string): string`.
- `downloadArtifactJson(artifact: RunArtifact, filename: string): void`: wraps the browser `a[download]` pattern.

All six are pure except `downloadArtifactJson` (DOM side effect) and `extractPdfText` (async I/O). Unit tests cover the pure five plus a mocked-pdfjs wrapper test.

## 4. End-to-end data flow

1. User lands on `paracosm.agentos.sh/sim`. Default tab is `quickstart`.
2. User pastes a seed, drops a PDF, or enters a URL.
3. If URL: client POSTs to `/api/quickstart/fetch-seed`, receives `text + title + sourceUrl`, flips to Paste tab with pre-filled text.
4. If PDF: client lazily imports `pdfjs-dist`, extracts text, flips to Paste tab with pre-filled text.
5. User clicks `Generate + Run 3 Leaders`.
6. Client POSTs to `/api/quickstart/compile-from-seed` with `{ seedText, domainHint? }`. Server runs `compileFromSeed`, installs the compiled scenario in its catalog, returns `{ scenario, scenarioId }`.
7. Client POSTs to `/api/quickstart/generate-leaders` with `{ scenarioId, count: 3 }`. Server returns `{ leaders: LeaderConfig[] }`.
8. Client POSTs to `/setup` with `{ leaders, scenarioId, turns, seed, captureSnapshots: true, quickstart: { scenarioId } }`. Server dispatches to `runBatchSimulations`.
9. SSE emits per-leader turn events. `QuickstartProgress` renders three live counters.
10. On completion, each leader's `result` event carries `artifact: RunArtifact` (Spec 2B bridge). `QuickstartView` assembles the three artifacts from `useSSE.results`.
11. Phase flips to Results. Three cards render with HEXACO bars, median deltas, Download + Copy-share + Fork-at-N + Swap controls.
12. User clicks `Fork this leader at turn 3` on Leader B. `SET_PARENT` dispatched with Leader B's artifact, navigate to Branches tab, `ForkModal` opens pre-filled at turn 3. Spec 2B flow from there.
13. User clicks `Download JSON` on Leader A. Browser downloads `paracosm-quickstart-leader-<archetype>.json`.
14. User clicks `Copy share link`. Clipboard gets `${origin}/sim?replay=<sessionId>&view=quickstart`. Anyone opening the link sees the full 3-leader result without re-running.

## 5. What's deliberately out of scope

- **Landing page hero embed.** Q1 = C. The dashboard Quickstart proves the flow first; landing embed is v1.1 once we have metrics on Quickstart conversion.
- **Persistent Quickstart-run history beyond session-store.** The existing save/load machinery handles individual artifacts; multi-leader session persistence is a Tier 4 SQLite-adapter concern.
- **Per-leader HEXACO editing inside Quickstart.** The preset library + Swap control cover the 80% case. Full HEXACO authoring stays in Settings.
- **PDF OCR.** Scanned-image PDFs show "No text extracted". Text-based PDFs only in v1.
- **Rich share-link unfurls.** Share URLs are plain `?replay=<id>`. OpenGraph thumbnails are a v1.1 polish, not blocking virality.
- **Quickstart in Chat / Log tabs.** Quickstart is standalone. Users can still open Chat / Log after to inspect agent threads.
- **Authenticated save / slug-based URLs (`/@user/slug`).** No auth layer in paracosm MVP. Slug routing becomes relevant when accounts land.
- **Multi-parent Branches tab.** `SET_PARENT` replaces the single parent; users pick one of the 3 Quickstart leaders to fork from. Multi-parent support lands if user behavior demands it (deferred to Tier 5).

## 6. Tests

### 6.1 Runtime / engine
- `WorldModel.fromPrompt`: returns a compiled WorldModel, invokes `compileFromSeed` with right args, surfaces Zod validation errors. 3 tests.
- `wm.quickstart`: returns 3 artifacts with matching scenario, passes `captureSnapshots: true` through to `runBatch`. 2 tests.
- `compileFromSeed`: happy path + Zod retry on invalid LLM output + terminal failure. 3 tests.
- `LEADER_PRESETS`: 10 entries present, each HEXACO profile in [0, 1], unique ids, `getPresetById` round-trip. 2 tests.

### 6.2 Server routes
- `/api/quickstart/fetch-seed`: valid URL, invalid URL (400), non-http scheme (400), fetch failure (502), oversized response (413/truncated). 5 tests.
- `/api/quickstart/compile-from-seed`: happy path, too-short seed (400), too-long seed (400), unknown scenario id in response (guard). 4 tests.
- `/api/quickstart/generate-leaders`: happy path, scenario-not-found (404), count validation (400), HEXACO out-of-bounds triggers Zod retry. 4 tests.
- `/setup` extended: `leaders.length === 3` dispatches to `runBatchSimulations` (spy-verified), `length === 1 + forkFrom` still works (regression). 2 tests.

### 6.3 Dashboard helpers
- `validateSeedUrl`: http/https accept, ftp/file reject, whitespace trim, length cap. 4 tests.
- `validateSeedText`: too-short, too-long, whitespace trim. 3 tests.
- `computeMedianDeltas`: 3-artifact group median, single-peer degenerate, missing-bag skip, non-numeric bags route through `direction: 'changed'`. 4 tests.
- `buildQuickstartShareUrl`: origin + session id, query escaping. 2 tests.
- `extractPdfText`: mocked pdfjs pipeline happy path + truncation flag. 2 tests.

### 6.4 Context + integration
- `BranchesContext`: `SET_PARENT` action replaces parent + clears branches. 1 test.
- Integration (optional for MVP; defer to smoke): full `fromPrompt → quickstart → fork` flow with mocked LLM. 1 test.

**Target:** ~36 new tests. Baseline 640 → ~676.

## 7. Docs

- `README.md`: add a top-level Quickstart section showing `WorldModel.fromPrompt({ seedText }).quickstart({ leaderCount: 3 })`. README already primed with the charter paragraph on 2026-04-24.
- `docs/positioning/world-model-mapping.md`: add one paragraph on "prompt-to-world-model" as the onboarding surface for the structured-world-model category.
- `packages/agentos/docs/PARACOSM.md`: mirror the API update.
- Blog post (separate ship): "Turning any prompt into a paracosm world: inside Quickstart."

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| LLM-generated scenario JSON fails Zod parse | One automatic retry with the error report appended to the prompt; second failure surfaces as a user-visible error with the extracted issues. |
| Scenario LLM hallucinates domains that break downstream departments | Departments must have at least one entry; department prompts validated against the existing compile schema before `compileScenario` runs. |
| Leader-generation LLM produces identical HEXACO trios | Prompt includes an explicit "maximize cross-leader divergence on openness, conscientiousness, and agreeableness" instruction; output-schema test checks for trait variance > 0.2 across the trio, retries once if flat. |
| `pdfjs-dist` bundle bloat | Lazy-imported only when the user opens Quickstart and selects the PDF tab. No impact on initial dashboard bundle. |
| URL fetch returns unrelated content (SPA JS-only pages) | `WebSearchService` already falls through to Firecrawl which handles SPA pages; user can always paste text as fallback. |
| Large PDF blows memory | Hard file-size cap (10 MB) + extracted-text cap (50 KB). Browser rejects the upload before parsing. |
| Cross-scenario fork from a Quickstart leader to a different Quickstart session | `SET_PARENT` clears branches; the existing scenario-id match check in `fork-preconditions.ts` fires if a stale fork attempt reaches `/setup`. |
| Cost spike from quickstart traffic on hosted demo | Three endpoints are rate-limited on the same bucket as `/setup`; demo caps still apply. Quickstart emits a cost-estimate before the Run CTA is clickable (~3x single-run baseline). |
| Share-link replay leaks scenario content to anyone with the URL | Scenarios compiled from a Quickstart seed are stored only in session-store; share URLs include the sessionId as an unguessable token. No PII capture in v1. |

## 9. Success criteria

1. **End-to-end works on hosted demo.** Paste a 1000-char brief, receive 3 streaming leaders, each with a forkable result, within 60 seconds of first click.
2. **Tests pass.** 640 → ~676 targeted pass / 0 fail / 1 skip.
3. **`tsc --noEmit` clean.** Only pre-existing Zod-v4 warnings.
4. **`npm run build` exit 0.** All new files emit cleanly.
5. **No em-dashes** in any newly authored file.
6. **`pdfjs-dist` not in the initial bundle.** Verified by checking `dist/cli/dashboard/assets/*` bundle manifest.
7. **Programmatic API works in `tsx` / `node --import tsx`.** A standalone script doing `WorldModel.fromPrompt` + `quickstart` with a mocked LLM returns a 3-artifact manifest.

## 10. Execution order

Single atomic commit at the end (user preference: one push = one CI publish).

1. **Runtime foundation:**
   1. `src/engine/leader-presets.ts` + unit tests + subpath export.
   2. `src/engine/compiler/compile-from-seed.ts` + `DraftScenarioSchema` + unit tests.
   3. `src/runtime/world-model/index.ts`: add `fromPrompt` and `quickstart`.
2. **Server foundation:**
   4. `src/cli/pair-runner.ts`: add `runBatchSimulations`.
   5. `src/cli/sim-config.ts`: relax leader-count guard, add `quickstart` passthrough.
   6. `src/cli/server-app.ts`: add the three `/api/quickstart/*` endpoints + route N-leader `/setup` to `runBatchSimulations`.
   7. Server tests for the three endpoints and the relaxed `/setup`.
3. **Dashboard foundation:**
   8. `src/cli/dashboard/src/components/branches/BranchesContext.tsx`: add `SET_PARENT` action + test.
   9. `src/cli/dashboard/src/components/quickstart/QuickstartView.helpers.ts` + tests.
10. **Dashboard components:**
    10. `SeedInput.tsx` + `.module.scss` + lazy `pdfjs-dist` wrapper.
    11. `QuickstartProgress.tsx` + `.module.scss`.
    12. `QuickstartResults.tsx` + `.module.scss`.
    13. `LeaderPresetPicker.tsx` + `.module.scss`.
    14. `QuickstartView.tsx` + `.module.scss` (orchestrates the three phases).
11. **Routing + wiring:**
    15. `tab-routing.ts`: add `quickstart` first.
    16. `TabBar.tsx`: add quickstart tab with lightning-bolt icon.
    17. `App.tsx`: mount `<QuickstartView />` on `activeTab === 'quickstart'`; flip default tab for fresh loads; detect `?view=quickstart` replay path.
12. **Dependencies + docs:**
    18. `package.json`: add `pdfjs-dist` to dashboard deps, add `./leader-presets` subpath export.
    19. `README.md`: Quickstart section in the API docs.
    20. `docs/positioning/world-model-mapping.md`: one paragraph on prompt-to-world-model.
    21. Roadmap move: Tier 5 T5.2 (paracosm init wizard) + T5.3 (scenario author wizard web) partial ship; Tier 4 T4.2 (/simulate endpoint) still open.
13. **Verification + ship:**
    22. `npm test` full; `tsc --noEmit`; em-dash scan; bundle-manifest check.
    23. Single atomic commit.
    24. Monorepo submodule pointer bump.

## 11. References

- Charter paragraph in [`README.md`](../../README.md) (2026-04-24): "JSON is the contract, not the product boundary. The next API layer should be a one-call prompt/document wrapper..."
- Spec 2B design: [`2026-04-24-branches-tab-fork-ux-design.md`](2026-04-24-branches-tab-fork-ux-design.md).
- Spec 2A design: [`2026-04-24-worldmodel-fork-snapshot-api-design.md`](2026-04-24-worldmodel-fork-snapshot-api-design.md).
- Positioning map: [`../positioning/world-model-mapping.md`](../../positioning/world-model-mapping.md).
- Paracosm roadmap: [`../plans/2026-04-23-paracosm-roadmap.md`](../plans/2026-04-23-paracosm-roadmap.md).
- MiroFish: [github.com/666ghj/MiroFish](https://github.com/666ghj/MiroFish). Direct competitor onboarding reference.
- OASIS (CAMEL-AI): [OpenReview](https://openreview.net/forum?id=JBzTculaVV).
- Xing 2025, "Critiques of World Models": [arXiv 2507.05169](https://arxiv.org/abs/2507.05169).
- Yang et al, 2026, LLM-world-model benchmarks: [OpenReview XmYCERErcD](https://openreview.net/forum?id=XmYCERErcD). Anchor for the "safe product version of the LLM-world-model idea" framing in the README.
- AgentOS `WebSearchService`: [`packages/agentos/src/services/web-search`](../../../packages/agentos/src/services/web-search).
- `compileScenario`: [`src/engine/compiler/index.ts`](../../src/engine/compiler/index.ts).
- `runBatch`: [`src/runtime/batch.ts`](../../src/runtime/batch.ts).
- Existing `/setup` endpoint: [`src/cli/server-app.ts`](../../src/cli/server-app.ts).
- Fork preconditions (Spec 2B): [`src/cli/fork-preconditions.ts`](../../src/cli/fork-preconditions.ts).
- Dashboard tab routing: [`src/cli/dashboard/src/tab-routing.ts`](../../src/cli/dashboard/src/tab-routing.ts).
- TabBar pattern: [`src/cli/dashboard/src/components/layout/TabBar.tsx`](../../src/cli/dashboard/src/components/layout/TabBar.tsx).
