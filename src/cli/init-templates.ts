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
