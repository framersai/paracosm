#!/usr/bin/env npx tsx
/**
 * Extract every TypeScript code-block from `landing.html` and
 * type-check each against the local paracosm package.
 *
 * Catches doc/code drift before publish: if a public-facing example
 * imports from a removed subpath, calls a renamed method, or uses an
 * outdated option name, the script exits non-zero so CI blocks the push.
 *
 * @module paracosm/scripts/check-doc-examples
 */
import { readFileSync, mkdirSync, writeFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const SANDBOX = resolve('/tmp/paracosm-doc-check');

mkdirSync(SANDBOX, { recursive: true });
mkdirSync(`${SANDBOX}/wrapped`, { recursive: true });

// ── Step 1: pull every code-body from landing.html ────────────────────
const landingHtml = readFileSync(`${REPO_ROOT}/src/cli/dashboard/landing.html`, 'utf8');
const landingRe = /<div[^>]*class="code-body"[^>]*id="([a-z0-9-]+-code)"[^>]*>([\s\S]*?)<\/div>/g;
const blocks: { id: string; text: string }[] = [];
let m: RegExpExecArray | null;
while ((m = landingRe.exec(landingHtml)) !== null) {
  const id = m[1];
  const text = m[2]
    .replace(/<span[^>]*>/g, '').replace(/<\/span>/g, '')
    .replace(/<button[\s\S]*?<\/button>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  blocks.push({ id, text: text.trim() });
}

// ── Step 2: filter to TypeScript blocks (skip shell, JSON, etc.) ───────
const tsBlocks = blocks.filter((b) =>
  /\bimport\b|\basync\b|\bawait\b|\bexport\b|=>|\bWorldModel\b|\brunMany\b/.test(b.text)
);

// Step 3: stubs for placeholder identifiers used in docs
const STUBS = `
declare const worldJson: any;
declare const leader: any;
declare const actor: any;
declare const altActor: any;
declare const altLeader: any;
declare const reyes: any;
declare const okafor: any;
declare const scenario: any;
declare const baseline: any;
declare const wm: any;
declare const myLeader: any;
declare const seedText: string;
declare const subject: any;
declare const intervention: any;
`;

for (const b of tsBlocks) {
  const lines = b.text.split('\n');
  const imports = lines
    .filter((l) => l.trim().startsWith('import '))
    .filter((l) => !l.includes(`with { type: 'json' }`));
  const body = lines.filter((l) => !l.trim().startsWith('import ')).join('\n');
  const wrapped = [
    `// Auto-wrapped from landing.html#${b.id}`,
    ...imports,
    STUBS,
    '',
    '(async () => {',
    body,
    '})();',
  ].join('\n');
  writeFileSync(`${SANDBOX}/wrapped/${b.id}.ts`, wrapped);
}

// ── Step 4: typecheck each ─────────────────────────────────────────────
let failed = 0;
const summary: { id: string; ok: boolean; err?: string }[] = [];
for (const f of readdirSync(`${SANDBOX}/wrapped`)) {
  if (!f.endsWith('.ts')) continue;
  process.stdout.write(`  ${f.padEnd(36)} ... `);
  try {
    execSync(
      `cd "${REPO_ROOT}" && npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck --resolveJsonModule "${SANDBOX}/wrapped/${f}"`,
      { stdio: 'pipe' },
    );
    process.stdout.write('OK\n');
    summary.push({ id: f, ok: true });
  } catch (err) {
    failed += 1;
    process.stdout.write('FAIL\n');
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    process.stdout.write(stderr.split('\n').slice(0, 8).map((l) => `    ${l}`).join('\n'));
    process.stdout.write('\n');
    summary.push({ id: f, ok: false, err: stderr });
  }
}

if (failed > 0) {
  process.stderr.write(`\n${failed} doc example(s) failed to type-check\n`);
  process.exit(1);
}
process.stdout.write(`\nAll ${tsBlocks.length} doc examples type-check\n`);
