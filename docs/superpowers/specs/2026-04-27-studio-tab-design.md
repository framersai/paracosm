# Studio Tab Design

**Status:** Approved (2026-04-27)
**Author:** session brainstorm
**Scope:** Single sub-project (Studio tab). Constellation view follow-up gets its own spec.

## Goal

Let a paracosm user drop a `RunArtifact` JSON file (single or bundle) into the dashboard and immediately see it rendered, with first-class actions to (1) **Promote** the artifact into the Library (server-stored run history) and (2) **Compare** the dropped artifact against existing Library runs. No server round-trip required to view, and the rendering reuses the same primitives the live Sim/Reports tabs already produce.

This closes the loop on three workflows that 0.8.0 doesn't support today:

1. *"Someone shipped me their `output/v3-...json` — let me look at it."*
2. *"I have a JSON exported by an older paracosm install on my laptop — get it into the Library on this server."*
3. *"Drop a third-party artifact alongside my Library bundle and see them side-by-side without first round-tripping through the server."*

## Non-goals

- Paste-from-clipboard, URL fetch — drag-drop + click-to-upload cover 90% of the use cases. Add later if traffic warrants.
- Recent-drops list, annotations, notes — separate feature.
- Editing the artifact in-flight (e.g. tweak HEXACO and re-render). Studio is read-only display + insert.
- Authoring net-new runs from Studio. That's Quickstart's job.

## Architecture

A new dashboard tab whose entire ingest path is client-side. The artifact is parsed + validated in the browser, then rendered through the already-shipped static-mode adapters that the Library tab uses for stored runs: `ReportViewAdapter` for `turn-loop` artifacts, `BatchArtifactView` for `batch-trajectory` / `batch-point`. Studio adds no new render primitives — it reuses the same mode branch `RunDetailDrawer` uses today, just with a client-supplied artifact instead of a server-fetched one.

Two server-bound actions sit alongside the renderer:

- **Promote**: client `POST /api/v1/library/import { artifact }` → server runs `enrichRunRecordFromArtifact` → `runHistoryStore.insertRun` → returns `{ runId, alreadyExisted }`. The store is `@framers/sql-storage-adapter`-backed, so this works against SQLite (default), Postgres, sql.js, or IndexedDB without code changes.
- **Compare**: extends the existing `CompareModal` to accept inline `RunArtifact` objects alongside the runIds it already fetches. The dropped artifact appears as one column; the user picks which Library bundle/runs fill the rest.

Tab placement: between **Library** and **Branches** in `App.tsx`. Library = your DB, Studio = bring-your-own, Branches = derived views.

## File structure

| Path | Purpose |
|---|---|
| `src/cli/dashboard/src/components/studio/StudioTab.tsx` | Tab root. Manages drop state (`empty \| loading \| single \| bundle \| error`). Renders DropZone or one of the two views. |
| `src/cli/dashboard/src/components/studio/StudioDropZone.tsx` | Drag-drop + click-to-upload via hidden `<input type=file accept=".json">`. Calls `parseStudioInput` on the loaded text. |
| `src/cli/dashboard/src/components/studio/StudioArtifactView.tsx` | Single-artifact render. Branches on `artifact.metadata.mode` and delegates to `ReportViewAdapter` (turn-loop) or `BatchArtifactView` (batch modes), the same pattern `RunDetailDrawer` uses. Hosts Promote + Compare buttons. |
| `src/cli/dashboard/src/components/studio/StudioBundleView.tsx` | Bundle render. Grid of artifact cards (mirrors `RunGallery` BundleCard layout). Each card opens an inline drill-in panel reusing `StudioArtifactView`. Bundle-level Promote + Compare. |
| `src/cli/dashboard/src/components/studio/parseStudioInput.ts` | Pure parser. JSON → discriminated union: `{kind:'single', artifact}` \| `{kind:'bundle', artifacts, bundleId?}` \| `{kind:'error', message, hint?}`. Uses `RunArtifactSchema` from `src/engine/schema/artifact.ts`. |
| `src/cli/dashboard/src/components/studio/StudioTab.module.scss` | Studio-specific styles. |
| `src/cli/dashboard/src/components/compare/CompareModal.tsx` | **Edit.** Add `extraArtifacts?: RunArtifact[]` prop. Render alongside fetched Library artifacts. Render `bundleId` selector when only `extraArtifacts` is supplied (ad-hoc compare). |
| `src/cli/server/library-import-route.ts` | New `POST /api/v1/library/import` handler. Validates body via `RunArtifactSchema`, runs `enrichRunRecordFromArtifact`, calls `runHistoryStore.insertRun`. Optionally copies the artifact JSON to `<APP_DIR>/output/`. |
| `src/cli/server-app.ts` | **Edit.** Wire route. Add to `serverRoutesEnabled` gate alongside `/api/v1/runs`. |
| `src/cli/dashboard/src/App.tsx` | **Edit.** Add `'studio'` to `TabId` union, add `<StudioTab>` to renderer switch, add tab in topbar between Library and Branches. |
| `src/cli/dashboard/src/components/studio/parseStudioInput.test.ts` | Unit tests for parser: valid single, valid bundle (array), valid bundle (object), invalid JSON, missing fields, v0.7 legacy detection. |
| `src/cli/dashboard/src/components/studio/StudioArtifactView.test.tsx` | Renders artifact, asserts Timeline + key fields render. |
| `src/cli/dashboard/src/components/compare/CompareModal.extraArtifacts.test.tsx` | New test pinning the `extraArtifacts` prop behavior. |
| `tests/cli/server/library-import-route.test.ts` | Integration test: POST artifact → 200 + new RunRecord in store. Re-POST same artifact → `alreadyExisted: true`. POST malformed → 400. |

~700 LOC total estimate.

## Data flow

### Single artifact

1. User drops `mars-genesis-1234.json` (or clicks the upload button)
2. `StudioDropZone` reads file as text, calls `parseStudioInput(text)`
3. Parser:
   - `JSON.parse(text)` — if throws, returns `{kind:'error', message:'File is not valid JSON', hint: parseError.message}`
   - Detect bundle shape: array → bundle, `{bundleId, artifacts}` → bundle, otherwise → single
   - Run `RunArtifactSchema.safeParse(input)` (single) or `.safeParse(item)` for each (bundle)
   - On Zod failure with raw JSON containing `"leader"` keys but not `"actor"`: return `{kind:'error', message:'This artifact was exported from paracosm v0.7. Studio requires v0.8+. Re-run on the latest paracosm to convert leader→actor fields.'}`
   - Otherwise: return `{kind:'single', artifact}` or `{kind:'bundle', artifacts, bundleId?}`
4. `StudioTab` switches to `StudioArtifactView` (or `StudioBundleView`)
5. `StudioArtifactView` reads `artifact.metadata.mode` and delegates: `turn-loop` → `<ReportViewAdapter artifact={artifact} />`; otherwise → `<BatchArtifactView artifact={artifact} metricSpecs={metricSpecs} />`
6. `metricSpecs` is built from `artifact.trajectory.timepoints[0].worldSnapshot.metrics` keys with default range `[0, 1]` (mirrors `RunDetailDrawer.tsx:69-83`)
7. Promote button → `POST /api/v1/library/import { artifact }` → toast "Added to Library", optional "Open in Library" link that switches tabs and scrolls to the new card
8. Compare button → opens `CompareModal` with `extraArtifacts: [artifact]` and a Library bundle/run picker

### Bundle

Same as above, but `StudioBundleView` renders a grid of `BundleCard`-style cards (one per artifact). Clicking a card opens an inline drill-in (`StudioArtifactView` for that single artifact). Bundle-level actions:

- **Promote bundle**: server inserts all N artifacts under a single fresh `bundleId` (overrides any `bundleId` in the input — Library bundleIds are server-owned). Server route accepts `{ artifacts: RunArtifact[] }` shape too.
- **Compare bundle**: opens `CompareModal` with `extraArtifacts: artifacts` (all of them).

## Component contracts

### `parseStudioInput(text: string): StudioInput`

```ts
export type StudioInput =
  | { kind: 'single'; artifact: RunArtifact }
  | { kind: 'bundle'; artifacts: RunArtifact[]; bundleId?: string }
  | { kind: 'error'; message: string; hint?: string };

export function parseStudioInput(text: string): StudioInput;
```

Pure. No I/O. Wrap `JSON.parse` in try/catch. Validate via `RunArtifactSchema`. Detect bundle shape: `Array.isArray(parsed)` OR `(typeof parsed === 'object' && Array.isArray(parsed.artifacts))`.

### `StudioArtifactView`

```ts
interface StudioArtifactViewProps {
  artifact: RunArtifact;
  /** When set, the card is rendered inline inside a bundle drill-in
   *  panel rather than as the tab root. Suppresses the Promote button
   *  in the inline view because Promote is bundle-level there. */
  inline?: boolean;
  onPromote?: (runId: string) => void;
  onCompare?: () => void;
}
```

### `CompareModal` extension

Add `extraArtifacts?: RunArtifact[]` to existing props. Internal logic:

- If `extraArtifacts` supplied and `bundleId` not: render a "Pick Library bundle to compare against" picker as the modal's first state. Once user picks, fetch that bundle's artifacts and render alongside `extraArtifacts`.
- If both supplied: render `extraArtifacts` + bundle artifacts together immediately.
- If only `bundleId`: existing behavior, no change.

The `extraArtifacts` columns are visually marked `(uploaded)` in the column header so users can tell which came from where.

### `POST /api/v1/library/import`

**Request:**

```json
{ "artifact": <RunArtifact> }
// OR for bundles:
{ "artifacts": [<RunArtifact>, ...] }
```

**Response (201):**

```json
{ "runId": "run_abc", "alreadyExisted": false }
// bundle:
{ "bundleId": "bundle_xyz", "runIds": ["run_a", "run_b"], "alreadyExisted": [false, false] }
```

**Errors:**

- `400 { error: 'Invalid artifact', issues: ZodIssue[] }` on schema failure
- `400 { error: 'Body too large' }` on >5 MB single (existing limit)
- `503 { error: 'Run-history store disabled' }` when `PARACOSM_DISABLE_RUN_HISTORY=1`

**Server logic:**

1. Validate body via `RunArtifactSchema` (single) or `z.array(RunArtifactSchema).min(1).max(50)` (bundle)
2. For each artifact: call `enrichRunRecordFromArtifact(baseRecord, artifact)` to derive `actorName`/`actorArchetype`/`mode`/`costUSD`/`durationMs` etc.
3. `runHistoryStore.insertRun(record)` — `INSERT OR IGNORE` makes re-imports a no-op. Set `alreadyExisted` by reading `affected.changes` from the StorageRunResult: `0` ⇒ row already present (ignored), `1` ⇒ inserted. This is race-free; `getRun-before-insert` is not
4. Optional: write `artifact` JSON to `<APP_DIR>/output/v3-imported-<runId>.json` for the existing `?run=runId` reload path. Skip when `APP_DIR` unset.

**Auth gate:** behind `paracosmRoutesEnabled` env switch alongside the other `/api/v1/*` routes.

## Validation + error UX

Errors are surfaced in the drop zone area as a banner with a clear message:

| Trigger | User-facing message |
|---|---|
| `JSON.parse` throws | "File is not valid JSON" + hint with line/col |
| Zod fails, no `actor` field but has `leader` | "Exported from paracosm v0.7. Studio requires v0.8+. Re-run on latest paracosm to convert." |
| Zod fails, generic | "Not a paracosm RunArtifact: missing field `<path>`" with first 3 issues |
| Bundle has 0 artifacts | "Bundle is empty" |
| Bundle has >50 artifacts | "Bundle exceeds the 50-artifact cap" |
| File >10 MB | "File is too large (max 10 MB)" — checked via `File.size` before reading |

The Promote/Compare buttons are disabled until a valid artifact is loaded.

## Schema version handling

Today's `RunArtifact` has no `paracosmVersion` field. Adding one is out of scope for this spec. Studio relies on Zod schema mismatch as the primary signal that the artifact was generated by an incompatible version, and uses a heuristic for the v0.7-specific case (presence of `leader` keys in the JSON before validation) to give a friendly hint.

Forward-compat: a v0.9 artifact with extra fields validates fine because Zod is structural — extra fields are stripped, not rejected. Studio always shows what it can render.

## Tab placement + UX details

- **Tab order:** Sim, Quickstart, Reports, Library, **Studio**, Branches, Counterfactuals, Viz, Chat, Log, About
- **Empty state:** centered drop zone, large dashed border, label "Drop a paracosm RunArtifact JSON here, or click to browse". Below: a one-line link "What's a RunArtifact?" → docs anchor
- **Loaded state:** drop zone collapses to a slim header bar showing `filename · <single|bundle of N>`. "Drop a different file" affordance. Promote + Compare buttons in the header bar.
- **Bundle drill-in:** click a card → inline panel below the grid, scroll-into-view, "Back to bundle" close button
- **Toast on Promote:** "Added to Library" with "Open" link that switches tab + highlights the new card

## Testing strategy

- **`parseStudioInput.test.ts`** — pure unit tests:
  - valid single artifact → `kind:'single'`
  - valid bundle (array) → `kind:'bundle'`
  - valid bundle (object with artifacts) → `kind:'bundle'`
  - bare object missing `events` → `kind:'error'`
  - JSON with `leader` keys → `kind:'error'` with v0.7 hint
  - non-JSON text → `kind:'error'` with parse hint
  - empty bundle → `kind:'error'`
  - bundle of 51 → `kind:'error'`

- **`StudioArtifactView.test.tsx`** — render-level:
  - feed in a turn-loop fixture artifact; assert it renders the `ReportViewAdapter`-rendered turn list
  - feed in a batch-trajectory fixture; assert it renders `BatchArtifactView`
  - assert Promote button click invokes `onPromote`
  - inline mode hides Promote

- **`CompareModal.extraArtifacts.test.tsx`** — render-level:
  - mode 1: `extraArtifacts` only → renders bundle picker
  - mode 2: `extraArtifacts` + `bundleId` → renders both columns
  - mode 3: `bundleId` only → existing behavior (regression)

- **`tests/cli/server/library-import-route.test.ts`** — integration:
  - POST single artifact → 201, runId returned, store contains record
  - POST same artifact twice → second `alreadyExisted: true`
  - POST malformed → 400 with Zod issues
  - POST bundle of 3 → 201, all 3 inserted under shared bundleId
  - POST bundle of 51 → 400

- **Fixture files:** add `tests/fixtures/runArtifact-v0.8-single.json` and `tests/fixtures/runArtifact-v0.8-bundle.json` so tests don't synth giant inline objects

## Open questions

None blocking. Two minor follow-ups noted for after v1:

- Add `paracosmVersion` to `RunArtifact` schema so version detection becomes reliable (rather than the current "no `actor` field → assume v0.7" heuristic). Future work.
- Bundle Promote idempotency: when 2/3 artifacts already exist, what's the response shape? Spec answers with `alreadyExisted: [true, true, false]`; revisit if real workflows expect a stronger guarantee.
