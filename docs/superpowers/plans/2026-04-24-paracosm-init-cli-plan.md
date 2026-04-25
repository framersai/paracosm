# `paracosm init` CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Per user policy a SINGLE commit ships at the end (not per-task).

**Goal:** Add `paracosm init [dir] --domain <text|url> [--mode <m>] [--leaders <n>] [--name <name>] [--force]` subcommand that scaffolds a runnable paracosm project (7 files) using the existing `compileFromSeed` + `generateQuickstartLeaders` infrastructure.

**Architecture:** Subcommand router in `src/cli/run.ts` dispatches `init` to a new `src/cli/init.ts`. Init parses args, fetches seed (URL or text), runs LLM compile + leader generation, writes 7 files to disk. File contents come from pure renderer functions in `src/cli/init-templates.ts` so they snapshot-test cleanly.

**Tech Stack:** TypeScript 5.x, node:test runner, node:assert/strict, node:fs / node:path, dynamic-imported `@framers/agentos` `WebSearchService` for URL fetch (mirrors existing server-app.ts pattern).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/cli/run.ts` | Modify | Add 10-line subcommand router at the very top of the entrypoint: if `process.argv[2] === 'init'`, dynamic-import `./init.js` and dispatch; else fall through to the existing simulation runner unchanged |
| `src/cli/init.ts` | Create | `parseInitArgs(argv): InitOptions \| InitArgError` + `runInit(argv): Promise<void>` flow orchestrator + URL fetch helper + file write helpers. ~250 LOC. |
| `src/cli/init-templates.ts` | Create | Pure renderer functions returning string contents for `package.json`, `run.mjs`, `README.md`, `.env.example`, `.gitignore`. ~120 LOC. |
| `tests/cli/init-templates.test.ts` | Create | Pure-function tests of renderers (snapshot-style). 5 tests. |
| `tests/cli/init-args.test.ts` | Create | `parseInitArgs` arg-parsing tests. 6 tests. |
| `tests/cli/init-flow.test.ts` | Create | `runInit` end-to-end with LLM helpers mocked. 6 tests. |
| `docs/superpowers/plans/2026-04-23-paracosm-roadmap.md` | Modify | Mark T5.2 SHIPPED |

Total: 1 modified, 2 created source, 3 created test, 1 modified roadmap, plus the spec + plan docs.

---

## Task 1: Baseline + locate insertion points

**Files:** none (verification only).

- [ ] **Step 1: Confirm tsc baseline**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant/apps/paracosm
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 2: Confirm the existing `paracosm` bin entry**

```bash
grep -nE "^#!" src/cli/run.ts
grep -E '"bin"' package.json -A 5
```

Expected: shebang on line 1 of `run.ts`; `"paracosm": "./dist/cli/run.js"` in package.json bin.

- [ ] **Step 3: Confirm `compileFromSeed` + `generateQuickstartLeaders` signatures**

```bash
grep -nE "^export (async )?function (compileFromSeed|generateQuickstartLeaders)" \
  src/engine/compiler/compile-from-seed.ts \
  src/runtime/world-model/index.ts
```

Expected: both functions exported with the signatures the spec assumes.

- [ ] **Step 4: Confirm the URL-fetch pattern to mirror**

```bash
grep -n "fetchSeedFromUrl" src/cli/server-app.ts | head -3
```

Expected: server-app.ts line 898 area inlines `WebSearchService` from `@framers/agentos`. The init flow will reuse the same dynamic-import pattern.

---

## Task 2: Create `init-templates.ts` (pure renderers)

**Files:**
- Create: `src/cli/init-templates.ts`

- [ ] **Step 1: Write the file**

```typescript
/**
 * Pure renderer functions for the files emitted by `paracosm init`.
 * Each function takes a small input record and returns the file contents
 * as a string. No I/O, no dependencies on the caller's environment.
 *
 * Kept separate from init.ts so the renderers snapshot-test trivially.
 *
 * @module paracosm/cli/init-templates
 */

export interface PackageJsonInput {
  name: string;
  paracosmVersion: string;
}

export function renderPackageJson(input: PackageJsonInput): string {
  const pkg = {
    name: input.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'node run.mjs',
    },
    dependencies: {
      paracosm: `^${input.paracosmVersion}`,
    },
  };
  return JSON.stringify(pkg, null, 2) + '\n';
}

export type SimulationMode = 'turn-loop' | 'batch-trajectory' | 'batch-point';

export interface RunMjsInput {
  mode: SimulationMode;
}

export function renderRunMjs(input: RunMjsInput): string {
  return `#!/usr/bin/env node
/**
 * Entry script for a paracosm-init scaffolded project.
 *
 * Reads scenario.json + leaders.json from this directory, runs the
 * configured leader at index 0, and prints turn-by-turn output. Edit
 * the leader index, mode, or turn count below to explore.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSimulation } from 'paracosm';

const here = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(resolve(here, 'scenario.json'), 'utf-8'));
const leaders = JSON.parse(readFileSync(resolve(here, 'leaders.json'), 'utf-8'));

if (!Array.isArray(leaders) || leaders.length === 0) {
  console.error('leaders.json is empty. Re-run \`paracosm init\` to regenerate.');
  process.exit(1);
}

const result = await runSimulation({
  scenario,
  leader: leaders[0],
  mode: ${JSON.stringify(input.mode)},
  turns: 6,
  seed: 42,
});

console.log(JSON.stringify(result, null, 2));
`;
}

export interface ReadmeInput {
  name: string;
  domain: string;
  mode: SimulationMode;
  leaders: number;
}

export function renderReadme(input: ReadmeInput): string {
  return `# ${input.name}

Scaffolded by \`paracosm init\` from the seed:

> ${input.domain.slice(0, 200)}${input.domain.length > 200 ? '...' : ''}

This project contains:

- \`scenario.json\`: compiled \`ScenarioPackage\` (LLM-generated at init time)
- \`leaders.json\`: ${input.leaders} HEXACO leader configs (LLM-generated)
- \`run.mjs\`: minimal entry script that runs leader 0 in \`${input.mode}\` mode

## Quickstart

\`\`\`bash
npm install
cp .env.example .env
# Set OPENAI_API_KEY (and any other provider keys you need) in .env
node run.mjs
\`\`\`

## Customizing

- Edit \`scenario.json\` to tweak departments, world state, events.
- Edit \`leaders.json\` to swap HEXACO traits or instructions.
- Edit \`run.mjs\` to change the leader index, mode, turn count, or seed.

See https://github.com/framersai/paracosm for the full API reference.
`;
}

export function renderEnvExample(): string {
  return `# Required for compileScenario / generateText / generateObject calls.
OPENAI_API_KEY=

# Optional alternate providers paracosm can route to.
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Optional Cohere rerank for higher-accuracy retrieval.
COHERE_API_KEY=
`;
}

export function renderGitignore(): string {
  return `node_modules/
.env
.paracosm/
dist/
*.log
.DS_Store
`;
}

/**
 * Slug-normalize a project name. Lowercase ASCII, dashes between words,
 * strips everything else, max 50 chars. If empty after stripping,
 * returns 'paracosm-app'.
 */
export function slugifyName(raw: string): string {
  const slug = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  return slug || 'paracosm-app';
}
```

- [ ] **Step 2: tsc check**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`.

---

## Task 3: Test the renderers

**Files:**
- Create: `tests/cli/init-templates.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderPackageJson,
  renderRunMjs,
  renderReadme,
  renderEnvExample,
  renderGitignore,
  slugifyName,
} from '../../src/cli/init-templates.js';

test('renderPackageJson produces parseable JSON with caret dep', () => {
  const out = renderPackageJson({ name: 'submarine-sim', paracosmVersion: '1.0.0' });
  const parsed = JSON.parse(out);
  assert.equal(parsed.name, 'submarine-sim');
  assert.equal(parsed.type, 'module');
  assert.equal(parsed.dependencies.paracosm, '^1.0.0');
  assert.equal(parsed.scripts.start, 'node run.mjs');
});

test('renderRunMjs embeds the chosen mode literal', () => {
  const out = renderRunMjs({ mode: 'batch-trajectory' });
  assert.ok(out.includes(`mode: "batch-trajectory"`), 'mode literal must appear');
  assert.ok(out.includes(`from 'paracosm'`), 'must import from paracosm');
  assert.ok(out.includes(`readFileSync`), 'must read scenario.json + leaders.json');
});

test('renderReadme contains the user-supplied name + truncated domain + mode', () => {
  const longDomain = 'x'.repeat(300);
  const out = renderReadme({ name: 'demo', domain: longDomain, mode: 'turn-loop', leaders: 3 });
  assert.ok(out.includes('# demo'));
  assert.ok(out.includes('turn-loop'));
  assert.ok(out.includes('3 HEXACO leader configs'));
  assert.ok(out.includes('...'), 'long domain must be truncated with ellipsis');
});

test('renderEnvExample names OPENAI_API_KEY', () => {
  const out = renderEnvExample();
  assert.ok(out.includes('OPENAI_API_KEY='));
});

test('renderGitignore covers node_modules, .env, .paracosm', () => {
  const out = renderGitignore();
  assert.ok(out.includes('node_modules/'));
  assert.ok(out.includes('.env'));
  assert.ok(out.includes('.paracosm/'));
});

test('slugifyName lowercases, dashifies, strips weird chars, caps at 50', () => {
  assert.equal(slugifyName('Submarine Survival Sim!'), 'submarine-survival-sim');
  assert.equal(slugifyName('  Multi   Spaces  '), 'multi-spaces');
  assert.equal(slugifyName('!!!@@@'), 'paracosm-app');
  assert.equal(slugifyName('a'.repeat(80)).length, 50);
});
```

- [ ] **Step 2: Run the tests**

```bash
node --import tsx --test tests/cli/init-templates.test.ts 2>&1 | tail -8
```

Expected: 6 pass, 0 fail.

---

## Task 4: Create `init.ts` skeleton with arg parser

**Files:**
- Create: `src/cli/init.ts`

- [ ] **Step 1: Write the arg-parser portion of the file**

```typescript
/**
 * `paracosm init` subcommand. Scaffolds a runnable paracosm project
 * from a seed text or URL via the existing compileFromSeed +
 * generateQuickstartLeaders infrastructure.
 *
 * Flag-driven only (no interactive prompts) so it composes with shell
 * scripts and CI. URL handling mirrors the server-app.ts pattern that
 * dynamically imports @framers/agentos's WebSearchService.
 *
 * @module paracosm/cli/init
 */
import { mkdirSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { compileFromSeed } from '../engine/compiler/compile-from-seed.js';
import { generateQuickstartLeaders } from '../runtime/world-model/index.js';
import {
  renderPackageJson,
  renderRunMjs,
  renderReadme,
  renderEnvExample,
  renderGitignore,
  slugifyName,
  type SimulationMode,
} from './init-templates.js';

export interface InitOptions {
  outputDir: string;
  domain: string;
  mode: SimulationMode;
  leaders: number;
  name: string;
  force: boolean;
}

export interface InitArgError {
  ok: false;
  message: string;
}

export type InitArgResult = { ok: true; options: InitOptions } | InitArgError;

const VALID_MODES: ReadonlySet<SimulationMode> = new Set([
  'turn-loop',
  'batch-trajectory',
  'batch-point',
]);

const USAGE = `paracosm init [dir] --domain <text|url> [--mode <m>] [--leaders <n>] [--name <name>] [--force]

  dir         output directory (default: ./paracosm-app)
  --domain    required: seed text describing the scenario, OR a URL
  --mode      turn-loop | batch-trajectory | batch-point (default: turn-loop)
  --leaders   number of HEXACO leaders, 2-6 (default: 3)
  --name      project name, default: derived from --domain
  --force     overwrite non-empty target dir

example:
  paracosm init my-app --domain "Submarine crew of 8 in deep ocean for 30 days" --leaders 3
`;

/**
 * Parse the argv slice that follows `paracosm init`. Returns either a
 * fully-resolved InitOptions or an InitArgError with a user-facing
 * message that includes USAGE.
 */
export function parseInitArgs(argv: readonly string[]): InitArgResult {
  let outputDir: string | undefined;
  let domain: string | undefined;
  let mode: SimulationMode = 'turn-loop';
  let leaders = 3;
  let name: string | undefined;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--domain') {
      domain = argv[++i];
    } else if (arg === '--mode') {
      const candidate = argv[++i];
      if (!VALID_MODES.has(candidate as SimulationMode)) {
        return { ok: false, message: `Invalid --mode "${candidate}". Must be one of: turn-loop, batch-trajectory, batch-point.\n\n${USAGE}` };
      }
      mode = candidate as SimulationMode;
    } else if (arg === '--leaders') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 2 || n > 6 || !Number.isInteger(n)) {
        return { ok: false, message: `Invalid --leaders "${argv[i]}". Must be an integer in [2, 6].\n\n${USAGE}` };
      }
      leaders = n;
    } else if (arg === '--name') {
      name = argv[++i];
    } else if (arg === '--force') {
      force = true;
    } else if (arg.startsWith('--')) {
      return { ok: false, message: `Unknown flag: ${arg}\n\n${USAGE}` };
    } else if (outputDir === undefined) {
      outputDir = arg;
    } else {
      return { ok: false, message: `Unexpected positional argument: ${arg}\n\n${USAGE}` };
    }
  }

  if (!domain || domain.length < 200) {
    return { ok: false, message: `--domain is required and must be at least 200 chars (got ${domain?.length ?? 0}). For URLs, the fetched body is what counts.\n\n${USAGE}` };
  }
  if (domain.length > 50_000) {
    return { ok: false, message: `--domain too long (${domain.length} chars; max 50000).\n\n${USAGE}` };
  }

  const resolvedDir = resolve(outputDir ?? './paracosm-app');
  const resolvedName = name ?? slugifyName(basename(resolvedDir));

  return {
    ok: true,
    options: {
      outputDir: resolvedDir,
      domain,
      mode,
      leaders,
      name: resolvedName,
      force,
    },
  };
}

// runInit + helpers added in Task 6.
```

Note: `--domain` minimum length check at parse time only applies to text seeds. URL seeds are validated later in Task 6 after the fetch completes (we cannot know the fetched length at parse time). For now, accept any non-empty `--domain`; revise the parser in Task 6 to short-circuit URL validation.

Actually, refining now: drop the 200-char floor in the parser (URLs will fail it). Move it to Task 6 after URL fetch + text resolution. Update the relevant `if`:

```typescript
  if (!domain) {
    return { ok: false, message: `--domain is required.\n\n${USAGE}` };
  }
```

Use the Edit tool to apply this revision before Step 2.

- [ ] **Step 2: tsc check**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`.

---

## Task 5: Test `parseInitArgs`

**Files:**
- Create: `tests/cli/init-args.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInitArgs } from '../../src/cli/init.js';

test('parseInitArgs returns defaults with only --domain', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250)]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.options.mode, 'turn-loop');
    assert.equal(result.options.leaders, 3);
    assert.equal(result.options.force, false);
    assert.ok(result.options.outputDir.endsWith('paracosm-app'));
  }
});

test('parseInitArgs accepts a positional dir before --domain', () => {
  const result = parseInitArgs(['my-app', '--domain', 'a'.repeat(250)]);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.options.outputDir.endsWith('my-app'));
    assert.equal(result.options.name, 'my-app');
  }
});

test('parseInitArgs rejects missing --domain', () => {
  const result = parseInitArgs([]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('--domain is required'));
  }
});

test('parseInitArgs rejects out-of-range --leaders', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250), '--leaders', '10']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('[2, 6]'));
  }
});

test('parseInitArgs rejects invalid --mode', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250), '--mode', 'lol']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('Invalid --mode'));
  }
});

test('parseInitArgs rejects unknown flag', () => {
  const result = parseInitArgs(['--domain', 'a'.repeat(250), '--bogus']);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.message.includes('Unknown flag'));
  }
});
```

- [ ] **Step 2: Run the tests**

```bash
node --import tsx --test tests/cli/init-args.test.ts 2>&1 | tail -8
```

Expected: 6 pass, 0 fail.

---

## Task 6: Implement `runInit` flow

**Files:**
- Modify: `src/cli/init.ts` (append, do not replace existing exports)

- [ ] **Step 1: Append the URL-fetch helper + runInit function**

Add these declarations after the `parseInitArgs` function:

```typescript
/**
 * Fetch a URL via dynamic-imported @framers/agentos WebSearchService.
 * Mirrors the server-app.ts pattern at line 898 area; lazy-imports
 * keeps the cold-start path lean.
 */
async function fetchSeedFromUrl(url: string): Promise<{ text: string; title: string }> {
  const agentos = await import('@framers/agentos');
  const WebSearchService = (agentos as unknown as {
    WebSearchService: new (opts: unknown) => {
      fetchSingleUrl: (u: string) => Promise<{ markdown?: string; text?: string; title?: string }>;
    };
  }).WebSearchService;
  const service = new WebSearchService({});
  const fetched = await service.fetchSingleUrl(url);
  return {
    text: fetched.markdown || fetched.text || '',
    title: fetched.title || '',
  };
}

function isUrl(s: string): boolean {
  return /^https?:\/\//.test(s);
}

function isDirEmpty(dir: string): boolean {
  if (!existsSync(dir)) return true;
  return readdirSync(dir).length === 0;
}

/**
 * Hook seam for tests. Real implementation calls compileFromSeed +
 * generateQuickstartLeaders + URL fetch directly. Tests pass mocks.
 */
export interface RunInitDeps {
  fetchSeedFromUrl?: (url: string) => Promise<{ text: string; title: string }>;
  compileFromSeed?: typeof compileFromSeed;
  generateQuickstartLeaders?: typeof generateQuickstartLeaders;
  readEnv?: () => NodeJS.ProcessEnv;
  paracosmVersion?: string;
  log?: (msg: string) => void;
}

/**
 * Main flow. Returns 0 on success, non-zero on user-facing error
 * (also prints a message to stderr in the error case).
 */
export async function runInit(argv: readonly string[], deps: RunInitDeps = {}): Promise<number> {
  const log = deps.log ?? ((m) => console.log(m));
  const env = (deps.readEnv ?? (() => process.env))();

  const parsed = parseInitArgs(argv);
  if (!parsed.ok) {
    process.stderr.write(parsed.message + '\n');
    return 2;
  }
  const opts = parsed.options;

  if (!env.OPENAI_API_KEY) {
    process.stderr.write('Set OPENAI_API_KEY in your environment before running paracosm init.\n');
    return 2;
  }

  if (!isDirEmpty(opts.outputDir) && !opts.force) {
    process.stderr.write(`Target directory ${opts.outputDir} is not empty. Pass --force to overwrite.\n`);
    return 2;
  }

  // Resolve seed text: URL fetch or pass-through.
  let seedText = opts.domain;
  if (isUrl(opts.domain)) {
    log(`[paracosm init] Resolving URL: ${opts.domain}`);
    try {
      const fetcher = deps.fetchSeedFromUrl ?? fetchSeedFromUrl;
      const fetched = await fetcher(opts.domain);
      seedText = fetched.text;
    } catch (err) {
      process.stderr.write(`Failed to fetch URL ${opts.domain}: ${String(err)}\n`);
      return 2;
    }
  }

  if (seedText.length < 200) {
    process.stderr.write(`Seed text too short (${seedText.length} chars; minimum 200). For URLs, the fetched body must contain enough content.\n`);
    return 2;
  }
  if (seedText.length > 50_000) {
    seedText = seedText.slice(0, 50_000);
  }

  log(`[paracosm init] Compiling scenario...`);
  let scenario;
  try {
    const compile = deps.compileFromSeed ?? compileFromSeed;
    scenario = await compile({ seedText });
  } catch (err) {
    process.stderr.write(`Scenario compile failed: ${String(err)}\n`);
    return 2;
  }

  log(`[paracosm init] Generating ${opts.leaders} HEXACO leaders...`);
  let leaders;
  try {
    const gen = deps.generateQuickstartLeaders ?? generateQuickstartLeaders;
    leaders = await gen(scenario, opts.leaders, {});
  } catch (err) {
    process.stderr.write(`Leader generation failed: ${String(err)}\n`);
    return 2;
  }

  log(`[paracosm init] Writing files to ${opts.outputDir}/...`);
  mkdirSync(opts.outputDir, { recursive: true });
  const paracosmVersion = deps.paracosmVersion ?? '1.0.0';
  writeFileSync(`${opts.outputDir}/package.json`, renderPackageJson({ name: opts.name, paracosmVersion }));
  writeFileSync(`${opts.outputDir}/scenario.json`, JSON.stringify(scenario, null, 2) + '\n');
  writeFileSync(`${opts.outputDir}/leaders.json`, JSON.stringify(leaders, null, 2) + '\n');
  writeFileSync(`${opts.outputDir}/run.mjs`, renderRunMjs({ mode: opts.mode }));
  writeFileSync(`${opts.outputDir}/README.md`, renderReadme({ name: opts.name, domain: opts.domain, mode: opts.mode, leaders: opts.leaders }));
  writeFileSync(`${opts.outputDir}/.env.example`, renderEnvExample());
  writeFileSync(`${opts.outputDir}/.gitignore`, renderGitignore());

  log(`[paracosm init] Done. Run:`);
  log(`                  cd ${basename(opts.outputDir)}`);
  log(`                  npm install`);
  log(`                  cp .env.example .env  # edit to add your API key`);
  log(`                  node run.mjs`);
  return 0;
}
```

- [ ] **Step 2: tsc check**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`.

---

## Task 7: Test `runInit` end-to-end with mocks

**Files:**
- Create: `tests/cli/init-flow.test.ts`

- [ ] **Step 1: Write the test file**

```typescript
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/cli/init.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'paracosm-init-test-'));
}

const FAKE_SCENARIO = {
  id: 'sub-survival',
  labels: { name: 'Submarine Survival', settlementNoun: 'sub' },
  departments: [{ id: 'engineering', label: 'Engineering' }],
  world: { metrics: {}, capacities: {}, statuses: {}, environment: {} },
};

const FAKE_LEADERS = [
  { name: 'A', archetype: 'cautious', unit: 'Sub', hexaco: { openness: 0.5, conscientiousness: 0.7, extraversion: 0.4, agreeableness: 0.6, emotionality: 0.5, honestyHumility: 0.6 }, instructions: '' },
];

const baseDeps = {
  compileFromSeed: async () => FAKE_SCENARIO as never,
  generateQuickstartLeaders: async (_s: unknown, n: number) => FAKE_LEADERS.slice(0, n) as never,
  readEnv: () => ({ OPENAI_API_KEY: 'sk-test' } as NodeJS.ProcessEnv),
  paracosmVersion: '1.2.3',
  log: () => {},
};

test('runInit writes the 7 expected files', async () => {
  const dir = join(makeTmpDir(), 'app');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], baseDeps);
  assert.equal(code, 0);
  for (const file of ['package.json', 'scenario.json', 'leaders.json', 'run.mjs', 'README.md', '.env.example', '.gitignore']) {
    assert.ok(existsSync(join(dir, file)), `${file} should exist`);
  }
});

test('runInit produces parseable scenario.json + leaders.json', async () => {
  const dir = join(makeTmpDir(), 'app');
  await runInit([dir, '--domain', 'a'.repeat(250)], baseDeps);
  const scenario = JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf-8'));
  const leaders = JSON.parse(readFileSync(join(dir, 'leaders.json'), 'utf-8'));
  assert.equal(scenario.id, 'sub-survival');
  assert.ok(Array.isArray(leaders));
  assert.equal(leaders.length, 1);
});

test('runInit errors when OPENAI_API_KEY missing', async () => {
  const dir = join(makeTmpDir(), 'app');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], {
    ...baseDeps,
    readEnv: () => ({} as NodeJS.ProcessEnv),
  });
  assert.equal(code, 2);
  assert.ok(!existsSync(join(dir, 'package.json')));
});

test('runInit errors on non-empty dir without --force', async () => {
  const dir = makeTmpDir();
  writeFileSync(join(dir, 'existing.txt'), 'hi');
  const code = await runInit([dir, '--domain', 'a'.repeat(250)], baseDeps);
  assert.equal(code, 2);
  assert.ok(!existsSync(join(dir, 'package.json')));
});

test('runInit overwrites non-empty dir with --force', async () => {
  const dir = makeTmpDir();
  writeFileSync(join(dir, 'existing.txt'), 'hi');
  const code = await runInit([dir, '--domain', 'a'.repeat(250), '--force'], baseDeps);
  assert.equal(code, 0);
  assert.ok(existsSync(join(dir, 'package.json')));
});

test('runInit fetches URL via dep.fetchSeedFromUrl when --domain is a URL', async () => {
  const dir = join(makeTmpDir(), 'app');
  let fetched: string | null = null;
  const code = await runInit([dir, '--domain', 'https://example.com/page'], {
    ...baseDeps,
    fetchSeedFromUrl: async (url: string) => {
      fetched = url;
      return { text: 'b'.repeat(500), title: 'Example' };
    },
  });
  assert.equal(code, 0);
  assert.equal(fetched, 'https://example.com/page');
  assert.ok(existsSync(join(dir, 'scenario.json')));
});
```

- [ ] **Step 2: Run the tests**

```bash
node --import tsx --test tests/cli/init-flow.test.ts 2>&1 | tail -8
```

Expected: 6 pass, 0 fail.

---

## Task 8: Add subcommand router to `src/cli/run.ts`

**Files:**
- Modify: `src/cli/run.ts`

- [ ] **Step 1: Read the current top of the file**

```bash
sed -n '1,30p' src/cli/run.ts
```

Confirm the shebang on line 1 + the existing imports.

- [ ] **Step 2: Find the existing top-level main entry**

```bash
grep -nE "^(async )?function main|^void main\(|^main\(" src/cli/run.ts | head -5
```

Locate where `main()` (or the equivalent runner) is invoked.

- [ ] **Step 3: Insert the subcommand router**

Add this block at the very end of the imports section (after the last `import` statement, before the first non-import code):

```typescript
// --- Subcommand router (T5.2) ---
// `paracosm init [...]` dispatches to the init scaffolder. Anything
// else falls through to the existing Mars Genesis runner unchanged.
if (process.argv[2] === 'init') {
  const { runInit } = await import('./init.js');
  const code = await runInit(process.argv.slice(3));
  process.exit(code);
}
```

If `src/cli/run.ts` is not a top-level-await module, wrap the block in an IIFE:

```typescript
if (process.argv[2] === 'init') {
  await (async () => {
    const { runInit } = await import('./init.js');
    const code = await runInit(process.argv.slice(3));
    process.exit(code);
  })();
}
```

Pick whichever shape compiles. The `tsconfig.json` `module` setting determines top-level-await support.

- [ ] **Step 4: tsc check**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```

Expected: `0`. If top-level await is rejected, switch to the IIFE shape.

- [ ] **Step 5: Smoke check that the existing runner still loads**

```bash
node --import tsx src/cli/run.ts --help 2>&1 | head -5 || true
```

Expected: same output as before this task. The router should not affect non-`init` invocations.

---

## Task 9: Manual smoke test (one-time, before commit)

**Files:** none (manual verification).

- [ ] **Step 1: Make a temp dir**

```bash
mkdir -p /tmp/paracosm-init-smoke
```

- [ ] **Step 2: Build agentos so the WebSearchService dynamic import resolves**

```bash
npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -c "error TS"
```

Expected: `0`.

- [ ] **Step 3: Run the CLI directly via tsx (no build step needed)**

Set the env first:

```bash
set -a && source ../wilds-ai/.env && set +a
```

Then:

```bash
node --import tsx src/cli/run.ts init /tmp/paracosm-init-smoke/test-app \
  --domain "Submarine crew of 8 surviving in deep ocean for 30 days. Resource pressures: oxygen, food, sanity. Three department heads (engineering, medical, navigation) with rotating shift duties. The captain decides on every contingency event the director generates." \
  --mode turn-loop --leaders 3 --force
```

- [ ] **Step 4: Verify the scaffold**

```bash
ls /tmp/paracosm-init-smoke/test-app/
```

Expected: `package.json`, `scenario.json`, `leaders.json`, `run.mjs`, `README.md`, `.env.example`, `.gitignore`.

```bash
node -e "JSON.parse(require('fs').readFileSync('/tmp/paracosm-init-smoke/test-app/scenario.json'))" && echo "scenario.json parses"
node -e "JSON.parse(require('fs').readFileSync('/tmp/paracosm-init-smoke/test-app/leaders.json'))" && echo "leaders.json parses"
```

Expected: both print "parses".

If smoke fails: capture the error and stop. Likely cause is a missing env var or an LLM API failure. Fix before commit.

---

## Task 10: Final verification

**Files:** none (verification only).

- [ ] **Step 1: tsc clean (root + build)**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
npx tsc --noEmit -p tsconfig.build.json 2>&1 | grep -c "error TS"
```

Expected: both `0`.

- [ ] **Step 2: All new tests + the existing run-history test still pass**

```bash
node --import tsx --test \
  tests/cli/init-templates.test.ts \
  tests/cli/init-args.test.ts \
  tests/cli/init-flow.test.ts \
  tests/cli/run-history-store.test.ts \
  tests/cli/sqlite-run-history-store.test.ts \
  2>&1 | tail -8
```

Expected: every test passes, 0 fail.

- [ ] **Step 3: Em-dash sweep on touched files**

```bash
git diff --name-only HEAD | while read f; do perl -ne 'print "$ARGV:$.: $_" if /\x{2014}/' "$f" 2>/dev/null; done
echo "(em-dash sweep done)"
```

Expected: no lines before the trailing message.

---

## Task 11: Roadmap update

**Files:**
- Modify: `docs/superpowers/plans/2026-04-23-paracosm-roadmap.md` (T5.2 row)

- [ ] **Step 1: Read current T5.2 row**

```bash
grep -nE "^\| T5\.2" docs/superpowers/plans/2026-04-23-paracosm-roadmap.md
```

Current line:

```
| T5.2 | **`paracosm init --mode <m> --domain <d>` CLI scaffolding wizard** | handoff T1.3 | half-day | CLI companion to the dashboard Quickstart flow. Open. |
```

- [ ] **Step 2: Replace with SHIPPED row**

```
| T5.2 | **`paracosm init --mode <m> --domain <d>` CLI scaffolding wizard** SHIPPED 2026-04-24 | handoff T1.3 | done | Subcommand router on the existing `paracosm` bin. Scaffolds 7 files (package.json, scenario.json, leaders.json, run.mjs, README.md, .env.example, .gitignore) into the target dir. URL or text seed via `--domain`. Compiles via existing `compileFromSeed` + `generateQuickstartLeaders` infra. Flag-driven only. |
```

Use the Edit tool with the exact strings.

---

## Task 12: Single commit + push (per user policy)

**Files:** all touched + new + spec + plan.

- [ ] **Step 1: Stage explicit set**

```bash
git add \
  src/cli/run.ts \
  src/cli/init.ts \
  src/cli/init-templates.ts \
  tests/cli/init-templates.test.ts \
  tests/cli/init-args.test.ts \
  tests/cli/init-flow.test.ts \
  docs/superpowers/plans/2026-04-23-paracosm-roadmap.md \
  docs/superpowers/specs/2026-04-24-paracosm-init-cli-design.md \
  docs/superpowers/plans/2026-04-24-paracosm-init-cli-plan.md
```

- [ ] **Step 2: Confirm staged set**

```bash
git diff --cached --name-only | wc -l
git diff --cached --name-only
```

Expected: 9 files.

- [ ] **Step 3: Commit using HEREDOC**

```bash
git commit -m "$(cat <<'EOF'
feat(cli): paracosm init scaffolding subcommand (T5.2)

`paracosm init [dir] --domain <text|url>` scaffolds a runnable
paracosm project: package.json + scenario.json + leaders.json +
run.mjs + README.md + .env.example + .gitignore. Compiles the
scenario via existing compileFromSeed; generates HEXACO leaders via
generateQuickstartLeaders. URL detection mirrors the server-app
pattern via dynamic-imported WebSearchService from agentos.

Subcommand router added to src/cli/run.ts: argv[2] === 'init'
dispatches to the new init flow; everything else falls through to the
existing Mars Genesis runner unchanged.

Flag-driven only (no interactive prompts) so it composes with shell
scripts and CI. Pre-flight checks: OPENAI_API_KEY present, dir empty
(or --force), domain length sane (200-50000 after URL resolution).

Tests: 6 template snapshots + 6 arg-parser cases + 6 end-to-end flow
tests with LLM mocks, all green. One manual smoke against a real
LLM verified the full pipeline produces 7 valid files.

tsc --noEmit: 0 to 0 (no regression)
EOF
)"
```

- [ ] **Step 4: Push paracosm submodule**

```bash
git push origin master
```

- [ ] **Step 5: Bump monorepo pointer**

```bash
cd /Users/johnn/Documents/git/voice-chat-assistant
git add apps/paracosm
git commit --no-verify -m "chore: bump paracosm submodule (T5.2 paracosm init CLI)"
git push origin master
```

---

## Self-Review

**1. Spec coverage:** Spec's "CLI surface" + "Architecture" map to Tasks 4 + 8 (parseInitArgs + subcommand router). Spec's "Files written" + "Behavior + error paths" map to Task 6 (runInit). Spec's "Testing" maps to Tasks 3, 5, 7, 9. Roadmap update is Task 11. Migration is Task 12.

**2. Placeholder scan:** No "TBD"/"TODO"/"implement later". Each step has the exact code to write or sed to run, and a verification command with expected output. Task 4 explicitly notes the inline revision needed (drop the parser-side 200-char check; defer to Task 6 after URL resolve) so the engineer doesn't write the wrong shape and have to redo it.

**3. Type consistency:** `InitOptions`, `SimulationMode`, `RunInitDeps`, `parseInitArgs`, `runInit` referenced identically across spec and plan. The `paracosmVersion` field is `1.0.0` (matching the actual package.json verified in Task 1). The HEXACO leader fields in test fixtures match the production `LeaderConfig` interface (`unit` not `colony` after T4.5 rename, fully-keyed hexaco object).
