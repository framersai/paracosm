---
date: 2026-04-24
status: design
related:
  - paracosm T5.2 (`paracosm init` CLI scaffolding wizard)
  - paracosm T5.3 (Quickstart dashboard onboarding, shipped earlier today)
---

# `paracosm init` CLI Scaffolding

## Problem

A new adopter who runs `npm install paracosm` today has no on-ramp. They get a library with a `paracosm` bin that runs Mars Genesis specifically. To start their own scenario, they must read source, compose a `ScenarioPackage` literal, write `LeaderConfig[]`, wire up `runSimulation`, and only then see output.

The dashboard's Quickstart flow already solves this for browser users. T5.2 ports the same flow to a CLI: `paracosm init --domain "submarine survival sim"` scaffolds a runnable project in seconds.

## Decision (per user, 2026-04-24)

Scope A from brainstorming: subcommand router under the existing `paracosm` bin (matches roadmap text exactly). Scaffold is a 7-file project with a `run.mjs` entry point. LLM runs at `init` time via the existing `compileFromSeed` + `generateQuickstartLeaders` infrastructure. No interactive prompts; flag-driven only.

## CLI surface

```
paracosm init [dir] --domain <text|url> [--mode <m>] [--leaders <n>] [--name <name>] [--force]
```

| Flag | Required | Default | Notes |
|---|---|---|---|
| `dir` (positional) | no | `./paracosm-app` | Output directory |
| `--domain` | yes | n/a | Seed text (200-50000 chars) OR an `https?://` URL |
| `--mode` | no | `turn-loop` | One of `turn-loop` / `batch-trajectory` / `batch-point` |
| `--leaders` | no | `3` | HEXACO leader count, range `2-6` (matches Quickstart) |
| `--name` | no | derived from `--domain` | Project name (slug-cased) |
| `--force` | no | `false` | Overwrite non-empty target dir |

## Architecture

Four files. No new architecture; pure orchestration of existing primitives.

```
src/cli/run.ts (modify)
  ├─ if argv[2] === 'init' → import('./init.js').then(m => m.runInit(argv.slice(3)))
  └─ else → existing simulation runner (unchanged)

src/cli/init.ts (create)
  ├─ parseInitArgs(argv) → InitOptions | InitArgError
  ├─ runInit(argv): main flow
  │  ├─ validate domain length / URL shape
  │  ├─ resolve seed text (URL fetch or pass-through)
  │  ├─ compileFromSeed(seedText, { domainHint }) → ScenarioPackage
  │  ├─ generateQuickstartLeaders(scenario, leaders) → LeaderConfig[]
  │  ├─ check output dir empty (or --force)
  │  ├─ write 7 files via init-templates.ts helpers
  │  └─ print final "cd <dir> && npm install && node run.mjs"
  └─ exits non-zero on any user-facing error with a clear message

src/cli/init-templates.ts (create)
  ├─ renderPackageJson({ name, paracosmVersion }): string
  ├─ renderRunMjs({ mode }): string
  ├─ renderReadme({ name, domain, mode, leaders }): string
  ├─ renderEnvExample(): string
  └─ renderGitignore(): string
```

## Files written into `dir/`

| File | Purpose |
|---|---|
| `package.json` | `{ "name": "<name>", "type": "module", "dependencies": { "paracosm": "^<currentVersion>" }, "scripts": { "start": "node run.mjs" } }` |
| `scenario.json` | Compiled `ScenarioPackage` JSON (LLM-generated) |
| `leaders.json` | `LeaderConfig[]` JSON (LLM-generated) |
| `run.mjs` | Entry script: imports `paracosm`, reads scenario.json + leaders.json, calls `runSimulation`, prints turn output |
| `README.md` | Quickstart: install + run; describes scenario + leaders + mode |
| `.env.example` | `OPENAI_API_KEY=` (and any other provider keys paracosm reads) |
| `.gitignore` | `node_modules`, `.env`, `.paracosm/`, `dist/` |

## URL handling

If `--domain` matches `^https?://`, fetch the page via the same logic as the existing `POST /api/quickstart/fetch-seed` route (extract main text + title via the existing helper). Else treat the value as raw seed text.

For the URL fetch path, reuse the existing extraction helper (likely in `src/cli/quickstart-routes.ts` or a sibling, to be located in implementation). No new HTTP client.

## Behavior + error paths

- **Missing API key**: print `Set OPENAI_API_KEY in your environment before running paracosm init.` and exit code 2 BEFORE any LLM work.
- **Missing `--domain`**: print usage + a one-line example + exit code 2.
- **`--domain` length out of bounds**: name the constraint (200-50000 chars) and exit code 2.
- **URL fetch failure**: print the underlying error + the URL + exit code 2.
- **`compileFromSeed` failure**: print the LLM error + exit code 2.
- **Target dir non-empty + no `--force`**: print `Target directory <dir> is not empty. Pass --force to overwrite.` and exit code 2.
- **File write failure**: surface the underlying `EACCES` / `ENOSPC` and exit code 2.

Progress logs to stdout:
```
[paracosm init] Resolving seed (URL or text)...
[paracosm init] Compiling scenario...
[paracosm init] Generating 3 HEXACO leaders...
[paracosm init] Writing files to /path/to/paracosm-app/...
[paracosm init] Done. Run:
                  cd paracosm-app
                  npm install
                  node run.mjs
```

## Testing

No live LLM tests. Mocks at the `compileFromSeed` + `generateQuickstartLeaders` boundary so tests run instantly. One manual smoke before commit.

| Test | What it covers |
|---|---|
| `parseInitArgs returns defaults` | Required flags only, optional defaults applied |
| `parseInitArgs rejects missing --domain` | Returns InitArgError with usage message |
| `parseInitArgs rejects out-of-range --leaders` | Returns InitArgError naming the [2, 6] bound |
| `parseInitArgs accepts URL --domain` | URL detection branch |
| `runInit writes 7 files into target dir` | Mocks LLM helpers; verifies file shape on disk |
| `runInit errors on non-empty dir without --force` | Pre-flight check |
| `runInit overwrites non-empty dir with --force` | Pre-flight check inverse |
| `runInit errors when OPENAI_API_KEY missing` | Pre-flight check |
| `renderPackageJson produces valid JSON with correct deps` | Template snapshot |
| `renderRunMjs produces parseable JS` | Template snapshot |
| `renderReadme contains the user-supplied name + mode` | Template snapshot |
| Subcommand router dispatches `init` correctly | Tests `src/cli/run.ts` argv-0 branch |
| Subcommand router falls through for unknown subcmd | Default sim runner still invoked |

Manual smoke (one-time, before commit):

```bash
mkdir -p /tmp/paracosm-init-smoke && cd /tmp/paracosm-init-smoke
node ../../path/to/paracosm/dist/cli/run.js init test-app \
  --domain "Submarine crew of 8 surviving in deep ocean for 30 days. Resource pressure: oxygen, food, sanity." \
  --mode turn-loop --leaders 3
ls test-app/
# expect: package.json scenario.json leaders.json run.mjs README.md .env.example .gitignore
```

## Out of scope

- Interactive stdin prompts for any flag (flag-driven only per roadmap)
- Multiple scenarios per project (`paracosm init` produces one scenario)
- Multi-provider LLM flag overrides (env-driven; user sets `OPENAI_API_KEY` etc. before running init)
- Wiring up a dashboard UI from CLI (separate `paracosm-dashboard` bin already exists)
- Templates for non-default modes beyond what `runSimulation` already accepts
- Project name validation beyond slug normalization
- Re-running `paracosm init` on an existing project to refresh just one file (a future `paracosm init --regen=scenario` could exist; out of scope here)

## Migration

None. Single-commit ship in the paracosm submodule plus a monorepo pointer bump.

## Roadmap update

T5.2 row marked SHIPPED in the same commit.
