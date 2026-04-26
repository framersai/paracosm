---
title: Paracosm Cookbook + Landing Revamp
date: 2026-04-25
status: in-progress
---

# Paracosm Cookbook + Landing Revamp

## Goal

1. Verify the public API works end to end on a creative scenario, capture every input + output JSON, and surface those in a new `docs/cookbook.md` so consumers see the exact wire-level shapes they'll get back.
2. Streamline the landing page: remove placeholder sections, fix banned formatting (em-dashes), update verified numbers, lift SEO schemas, link the cookbook.

Engine, runtime, schemas, and existing typedoc output are not changed.

## Cookbook scope

Single creative scenario: **AI Lab Director** (a paracosm running an AI alignment / model-release decision). On-mission for paracosm's AI-agent positioning, distinct from existing Mars / Lunar / Submarine / Corporate examples.

End-to-end script at `scripts/cookbook-e2e.ts` exercises the public API in this order, persisting captured JSON under `output/cookbook/`:

| Step | Surface | Captured JSON |
|------|---------|---------------|
| 1 | `WorldModel.fromPrompt({ seedText, domainHint })` | compiled `ScenarioPackage` minus hooks |
| 2 | `wm.quickstart({ leaderCount: 3 })` | leaders[] + 3 `RunArtifact` summaries |
| 3 | `wm.forkFromArtifact(trunk, atTurn=2).simulate(altLeader)` | branch artifact summary, `forkedFrom`, metric deltas |
| 4 | `wm.replay(trunk)` | `{ matches, divergence }` |
| 5 | `POST /simulate` (curl against local server) | request body, response body |
| 6 | `DigitalTwin.simulateIntervention(subject, intervention, leader)` | artifact.subject + artifact.intervention |
| 7 | `runBatch({ scenarios, leaders, turns, seed })` | `BatchManifest` |

Cost ceiling: $5 (economy preset, 4-turn runs, claude-haiku-4-5 reactions). Cookbook embeds excerpted JSON inline (full files committed for readers who want everything).

## Landing-page surgical edits

`src/cli/dashboard/landing.html` (796 lines) and `assets/landing.css` (890 lines).

**Remove**:

- Pricing section ("Pro TBD / Enterprise TBD / Platform TBD" placeholder banner)
- Two of three "About" cards (vision-fluff and roadmap-fluff); keep one tight "Built by" paragraph
- Em-dashes (`&mdash;` and `—`) → period / colon / parenthesis throughout
- Marketing fluff phrases ("Run your first simulation", "every organization should be able to") → concrete verbs

**Update**:

- Verified numbers in the architecture section: `71 engine files / 43 runtime files / 30 CLI server files / 6 scenario hooks` (was `71 / 18 / 45 / 8`)
- Meta description ≤ 155 chars (current is 320, gets truncated by Google)
- Replace the fake-bar Visionary/Engineer divergence mockup with a 3-card block sourced from real cookbook fingerprints + metric deltas captured by the e2e script

**Add**:

- 9th feature-grid card linking the cookbook with a copy-paste curl
- `FAQPage` JSON-LD schema (existing FAQ is `<details>` only)
- `Article` + `BreadcrumbList` JSON-LD schemas
- Cookbook anchor (`#cookbook`) with three live curl commands

**Verify**:

- Build the dashboard from inside `apps/paracosm`
- Open `landing.html` via the served route, confirm hero / positioning / features / cookbook / FAQ render at desktop + mobile
- Run targeted tests (`tests/cli/server`, `tests/runtime/world-model`); no engine code touched

## Scope discipline

- No engine, runtime, schema, kernel, or orchestrator changes.
- No new dependencies.
- No typedoc layout changes (`docs/api/` left alone).
- No dashboard React component edits.
- No README rewrite (cookbook gets a single new link at the top).

## Verification gate

Before commit:

1. `scripts/cookbook-e2e.ts` runs cleanly, writes 7 JSON files to `output/cookbook/`, prints fingerprints + cost summary
2. `npm run typecheck:dashboard`
3. Targeted tests for any test files near touched code
4. Visual smoke: open landing page, confirm no broken anchors, no console errors, mobile breakpoint OK
5. Spell-check em-dash absence: `grep -nE "&mdash;|—" src/cli/dashboard/landing.html` returns empty
