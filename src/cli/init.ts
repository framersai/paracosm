/**
 * `paracosm init` subcommand. Scaffolds a runnable paracosm project
 * from a seed text or URL via the existing compileFromSeed +
 * generateQuickstartActors infrastructure.
 *
 * Flag-driven only (no interactive prompts) so it composes with shell
 * scripts and CI. URL handling mirrors the server-app.ts pattern that
 * dynamically imports AgentOS WebSearchService from the web-search subpath.
 *
 * @module paracosm/cli/init
 */
import { mkdirSync, readdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromSeed } from '../engine/compiler/compile-from-seed.js';
import { generateQuickstartActors } from '../runtime/world-model/index.js';
import { fetchSeedFromUrl as fetchSeedFromUrlViaAgentOS } from './fetch-seed-url.js';
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
  actors: number;
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

const USAGE = `paracosm init [dir] --domain <text|url> [--mode <m>] [--actors <n>] [--name <name>] [--force]

  dir         output directory (default: ./paracosm-app)
  --domain    required: seed text describing the scenario, OR a URL
  --mode      turn-loop | batch-trajectory | batch-point (default: turn-loop)
  --actors   number of HEXACO actors, 2-6 (default: 3)
  --name      project name, default: derived from --domain
  --force     overwrite non-empty target dir

example:
  paracosm init my-app --domain "Submarine crew of 8 in deep ocean for 30 days" --actors 3
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
  let actors = 3;
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
    } else if (arg === '--actors') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n) || n < 2 || n > 6 || !Number.isInteger(n)) {
        return { ok: false, message: `Invalid --actors "${argv[i]}". Must be an integer in [2, 6].\n\n${USAGE}` };
      }
      actors = n;
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

  if (!domain) {
    return { ok: false, message: `--domain is required.\n\n${USAGE}` };
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
      actors,
      name: resolvedName,
      force,
    },
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
 * Read the paracosm package.json sitting two directories up from this
 * module file. Works from both the tsx (src/cli/init.ts) and built
 * (dist/cli/init.js) layouts because both mirror src/.
 *
 * @returns The semver version string from paracosm's package.json.
 * @throws Error when the package.json is unreadable or missing a version.
 */
function readOwnVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const pkgPath = resolve(here, '../../package.json');
  const raw = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };
  if (typeof raw.version !== 'string' || raw.version.length === 0) {
    throw new Error('paracosm package.json is missing a version field');
  }
  return raw.version;
}

/**
 * Hook seam for tests. Real implementation calls compileFromSeed +
 * generateQuickstartActors + URL fetch directly. Tests pass mocks.
 */
export interface RunInitDeps {
  fetchSeedFromUrl?: (url: string) => Promise<{ text: string; title: string }>;
  compileFromSeed?: typeof compileFromSeed;
  generateQuickstartActors?: typeof generateQuickstartActors;
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
      const fetcher = deps.fetchSeedFromUrl ?? fetchSeedFromUrlViaAgentOS;
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

  log(`[paracosm init] Generating ${opts.actors} HEXACO actors...`);
  let actors;
  try {
    const gen = deps.generateQuickstartActors ?? generateQuickstartActors;
    actors = await gen(scenario, opts.actors, {});
  } catch (err) {
    process.stderr.write(`Actor generation failed: ${String(err)}\n`);
    return 2;
  }

  log(`[paracosm init] Writing files to ${opts.outputDir}/...`);
  mkdirSync(opts.outputDir, { recursive: true });
  const paracosmVersion = deps.paracosmVersion ?? readOwnVersion();
  writeFileSync(`${opts.outputDir}/package.json`, renderPackageJson({ name: opts.name, paracosmVersion }));
  writeFileSync(`${opts.outputDir}/scenario.json`, JSON.stringify(scenario, null, 2) + '\n');
  writeFileSync(`${opts.outputDir}/actors.json`, JSON.stringify(actors, null, 2) + '\n');
  writeFileSync(`${opts.outputDir}/run.mjs`, renderRunMjs());
  writeFileSync(`${opts.outputDir}/README.md`, renderReadme({ name: opts.name, domain: opts.domain, mode: opts.mode, actors: opts.actors }));
  writeFileSync(`${opts.outputDir}/.env.example`, renderEnvExample());
  writeFileSync(`${opts.outputDir}/.gitignore`, renderGitignore());

  log(`[paracosm init] Done. Run:`);
  log(`                  cd ${basename(opts.outputDir)}`);
  log(`                  npm install`);
  log(`                  cp .env.example .env  # edit to add your API key`);
  log(`                  node run.mjs`);
  return 0;
}
