# Design: HTTP `POST /simulate` one-shot endpoint (Tier 4 T4.2)

**Date:** 2026-04-24
**Status:** Approved for execution.
**Scope:** Synchronous HTTP endpoint that accepts `{ scenario, leader, options }` and returns a full `RunArtifact`. Unblocks non-SSE consumers (curl, Python integrations, third-party dashboards). Gated behind an env flag so the hosted demo's SSE-first path stays the default.

**Depends on:** nothing new. Composes the existing `compileScenario` + `runSimulation` + rate limiter + body-size cap.

**Non-breaking.** Additive route. Disabled by default. The existing `/setup` SSE path stays as-is.

---

## 1. Problem

Paracosm today exposes simulation exclusively through the SSE-driven `/setup` + `/events` pipeline. That is the right primary surface for the dashboard (live turn events, abort-on-disconnect, multi-leader pair + batch runs), but it is a wrong match for three user classes:

- **CLI consumers** (`curl`, Postman, scripted benchmarks) that want a request-response shape.
- **Python / Pydantic / LangChain integrators** wiring paracosm into pipelines via the soon-to-ship JSON schema exports. They need HTTP, not EventSource.
- **Third-party dashboards** that want to embed paracosm results without hosting their own SSE proxy.

`/setup` is also overkill for one-shot calls. It assumes two leaders (or an N-leader batch or a single-leader fork), emits verdict SSE events, expects a long-lived client connection, and streams turn-by-turn events that non-SSE clients throw away.

`POST /simulate` closes this gap with a lean request-response: one scenario, one leader, one artifact back.

## 2. Feasibility (verified)

All the primitives exist.

- `compileScenario(rawJson, options)` turns a raw scenario JSON into a runnable `ScenarioPackage` ([src/engine/compiler/index.ts](../../src/engine/compiler/index.ts)).
- `runSimulation(leader, keyPersonnel, opts)` produces a Zod-validated `RunArtifact` ([src/runtime/orchestrator.ts](../../src/runtime/orchestrator.ts)).
- `readBody(req, maxBytes)` already caps request body size and throws `RequestBodyTooLargeError` ([src/cli/server-app.ts:78](../../src/cli/server-app.ts#L78)).
- `IpRateLimiter` is already wired into `/setup` and can be shared verbatim.
- `writeJsonError(res, err, fallbackStatus)` centralizes error response formatting.
- `RunArtifactSchema` Zod-validates the returned artifact, so the response body can optionally `.parse()` before emission for belt-and-suspenders.

Nothing blocks this work.

## 3. Design

### 3.1 Request shape

```typescript
// Zod schema at src/cli/simulate-route.ts
const SimulateRequestSchema = z.object({
  scenario: z.union([
    // Fully compiled ScenarioPackage (has hooks + version)
    z.object({ id: z.string(), hooks: z.record(z.unknown()) }).passthrough(),
    // Raw scenario JSON the compiler accepts (no hooks; compiled server-side)
    z.object({ id: z.string().optional(), labels: z.record(z.unknown()) }).passthrough(),
  ]),
  leader: z.object({
    name: z.string().min(1),
    archetype: z.string().min(1),
    unit: z.string().min(1),
    hexaco: z.object({
      openness: z.number().min(0).max(1),
      conscientiousness: z.number().min(0).max(1),
      extraversion: z.number().min(0).max(1),
      agreeableness: z.number().min(0).max(1),
      emotionality: z.number().min(0).max(1),
      honestyHumility: z.number().min(0).max(1),
    }),
    instructions: z.string().default(''),
  }),
  options: z.object({
    maxTurns: z.number().int().min(1).max(12).optional(),
    seed: z.number().int().optional(),
    startTime: z.number().int().optional(),
    captureSnapshots: z.boolean().optional(),
    provider: z.enum(['openai', 'anthropic']).optional(),
    costPreset: z.enum(['quality', 'economy']).optional(),
    seedText: z.string().max(50_000).optional(),
    seedUrl: z.string().url().optional(),
  }).optional(),
});
```

Optional `X-API-Key` / `X-Anthropic-Key` request headers thread user-provided LLM keys through `runOptions.apiKey` / `anthropicKey` so the server does not burn its own keys on external callers. Matches the existing `/setup` passthrough.

### 3.2 Dispatch

```typescript
// Sketch. Implementation lives in simulate-route.ts
async function handleSimulate(req, res, body, deps) {
  const parsed = SimulateRequestSchema.safeParse(body);
  if (!parsed.success) return writeJson(res, 400, { error: 'invalid request', issues: parsed.error.issues.slice(0, 5) });

  const { scenario: scenarioInput, leader, options = {} } = parsed.data;

  // Compile if needed. A ScenarioPackage has `.hooks` populated; a raw
  // draft does not.
  const scenarioPkg = 'hooks' in scenarioInput && scenarioInput.hooks
    ? scenarioInput as ScenarioPackage
    : await deps.compileScenario(scenarioInput, {
        provider: options.provider,
        seedText: options.seedText,
        seedUrl: options.seedUrl,
      });

  const startedAt = Date.now();
  const artifact = await deps.runSimulation(leader, [], {
    scenario: scenarioPkg,
    maxTurns: options.maxTurns,
    seed: options.seed,
    startTime: options.startTime,
    captureSnapshots: options.captureSnapshots ?? false,
    provider: options.provider,
    costPreset: options.costPreset,
    apiKey: deps.userApiKey,
    anthropicKey: deps.userAnthropicKey,
  });
  const durationMs = Date.now() - startedAt;

  writeJson(res, 200, { artifact, scenario: scenarioPkg, durationMs });
}
```

The handler is extracted into `src/cli/simulate-route.ts` with an injectable `deps` shape so the unit tests never boot the full HTTP server. Server-side mount lives in `server-app.ts` next to the quickstart routes.

### 3.3 Gating

Three layers. All pre-existing primitives; `POST /simulate` just composes them.

1. **Env flag:** `PARACOSM_ENABLE_SIMULATE_ENDPOINT=true`. Default false. When disabled, the route returns 404 (same-shape as any other unknown route). The demo host keeps the flag off so public traffic runs through the rate-limited `/setup` + session-replay path; self-hosted deployments flip it on.
2. **Body size:** `readBody(req, maxRequestBodyBytes)` enforces the existing 5 MiB cap. Large scenarios with embedded seedText can still fit; scenarios over 5 MB need compile-then-execute as two calls.
3. **Rate limit:** same `IpRateLimiter` bucket the `/setup` route shares. No new quota namespace; simulations are simulations.

### 3.4 Error responses

| Condition | Status | Body |
|---|---|---|
| Env flag off | 404 | `{ error: 'Unknown route' }` (route is invisible) |
| Malformed body | 400 | `{ error: 'invalid request', issues: [...] }` |
| Body too large | 413 | `{ error: 'Request body too large. Maximum N bytes.' }` (existing) |
| Rate limit exceeded | 429 | `{ error: 'Rate limit exceeded for this IP' }` (existing) |
| Compile LLM failure | 502 | `{ error: 'Scenario compile failed: <reason>' }` |
| Simulation runtime failure | 500 | `{ error: 'Simulation failed: <reason>' }` |

## 4. End-to-end data flow

1. Client POSTs to `/simulate` with `{ scenario, leader, options }`.
2. Server env-gate check: flag on? Else 404.
3. Body-size cap via `readBody`.
4. Rate-limit check via `IpRateLimiter`.
5. Zod `SimulateRequestSchema.safeParse`.
6. If `scenario.hooks` absent: `compileScenario` (LLM cost + seed-ingestion grounding if `seedText` / `seedUrl` supplied).
7. `runSimulation(leader, [], { scenario, ...options })` executes the full turn loop.
8. Response: `{ artifact: RunArtifact, scenario: ScenarioPackage, durationMs: number }`.

No SSE, no session persistence, no event buffer. Truly stateless request-response.

## 5. Out of scope

- **Async job queue** (`202 Accepted` + `GET /simulate/:jobId`). Deferred until someone hits a synchronous-timeout wall. For current 6-turn Mars / Lunar runs (~3 minutes at quality preset), sync is fine.
- **Chunked response streaming**. SSE is already `/events`; if a caller wants turn-by-turn, they use the existing SSE path.
- **N-leader batches** (`/simulate/batch`). Composed client-side via parallel `/simulate` calls. No need to build another batch endpoint.
- **Authentication beyond X-API-Key passthrough**. Self-hosted deployments that want auth put paracosm behind their own proxy.
- **CORS beyond existing `Access-Control-Allow-Origin: *`** (matches the rest of the API surface for the demo host; self-hosted deployments override via their reverse proxy).
- **Scenario cache hit/miss reporting**. `compileScenario` already caches to disk; `/simulate` does not need to surface cache state.

## 6. Tests

All tests target the extracted `handleSimulate` handler with injected deps. No HTTP server boot, no LLM calls, no real runSimulation.

1. **Happy path with pre-compiled scenario:** returns 200 + artifact + durationMs.
2. **Happy path with raw scenario JSON:** calls compileScenario, then runSimulation.
3. **Malformed body → 400 + Zod issues.**
4. **HEXACO out-of-bounds in leader → 400.**
5. **Missing leader → 400.**
6. **`compileScenario` throws → 502 with the thrown reason.**
7. **`runSimulation` throws → 500 with the thrown reason.**
8. **X-API-Key header is threaded into options.apiKey.**

Target: 8 unit tests.

**Integration smoke (optional, defer to manual):** `curl -s -X POST /simulate -d '...' | jq` round-trips a real Mars artifact. Not in the automated suite (real-LLM smokes are out of scope per paracosm's test-budget policy).

## 7. Docs

- **README:** add a "One-shot HTTP API" subsection under "Programmatic API" with a curl example.
- **package.json keywords:** add `http-api` so the endpoint is discoverable via npm search.
- **Roadmap:** move T4.2 to Shipped.

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Long-running sim (> 5 min) hits client-side HTTP timeout | Document expected duration in README; callers who need >5 min use SSE path. Env-flag default keeps this from biting hosted-demo users. |
| Large response body (artifact with snapshots) blows client buffer | `captureSnapshots` defaults to false; callers opt in. Response body rarely exceeds 500 KB without snapshots. |
| Non-HTTP scheme / malformed URL in seedUrl | Zod `z.string().url()` validates; non-http schemes rejected with 400. |
| Caller sends a huge `seedText` to burn server tokens | Zod caps seedText at 50,000 chars (matches `/api/quickstart/*`). |
| Env flag misconfigured on hosted demo and opens the endpoint | 404 response when flag is off is verified by an automated test. Deployment checklist: assert `PARACOSM_ENABLE_SIMULATE_ENDPOINT !== 'true'` in demo env. |
| `compileScenario` runs against a hostile scenario that tries to inject malicious hook code | Existing V8 sandbox (T4.1) isolates hook execution; this endpoint does not change the hook-execution threat surface. T4.1 hardening lands separately. |

## 9. Success criteria

1. `curl -s -X POST http://localhost:5188/simulate -d @body.json` with `PARACOSM_ENABLE_SIMULATE_ENDPOINT=true` returns a valid `RunArtifact` JSON.
2. Same curl with the flag unset returns 404.
3. 8 new unit tests pass. Baseline `npm test` count moves from 666 to ~674.
4. `npx tsc --noEmit -p tsconfig.build.json` stays clean.
5. Zero em-dashes in any authored file.

## 10. Execution order

Single atomic commit.

1. `src/cli/simulate-route.ts` new module with `SimulateRequestSchema` + `handleSimulate(req, res, body, deps)` + `SimulateDeps` interface.
2. `tests/cli/simulate-route.test.ts` with the 8 cases.
3. `src/cli/server-app.ts`: mount `POST /simulate` behind the env gate, wire deps, use existing `readBody` + rate limiter + `writeJsonError`.
4. `README.md`: one-shot HTTP API subsection under Programmatic API.
5. `package.json`: add `http-api` keyword.
6. `docs/superpowers/plans/2026-04-23-paracosm-roadmap.md`: move T4.2 to Shipped.
7. Verification sweep (`npm test`, `tsc --noEmit`, em-dash scan).
8. Single atomic commit + monorepo submodule pointer bump.

## 11. References

- [Spec 2A design](2026-04-24-worldmodel-fork-snapshot-api-design.md): same pattern of extracting routes into their own module for test isolation.
- [Quickstart spec](2026-04-24-quickstart-onboarding-design.md): precedent for env-gated endpoints (`/api/quickstart/*`) and rate-limit sharing.
- [fork-preconditions.ts](../../src/cli/fork-preconditions.ts): pattern for Zod-validated injectable route handlers.
- [quickstart-routes.ts](../../src/cli/quickstart-routes.ts): closest architectural sibling of this work.
