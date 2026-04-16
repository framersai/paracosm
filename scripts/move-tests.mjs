#!/usr/bin/env node
/**
 * One-shot migration: move all *.test.ts under src/ (except dashboard)
 * into a top-level tests/ directory mirroring the src/ structure, and
 * rewrite relative imports to point at the original src/ files.
 *
 * Dashboard tests (src/cli/dashboard/src/**) stay colocated since they
 * are closely tied to React component files and live in a sub-project
 * with its own build config.
 *
 * Run once: `node scripts/move-tests.mjs`
 * Idempotent: skips files that are already moved.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, join, relative, posix } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const TESTS = join(ROOT, 'tests');

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      // Skip dashboard sub-project — its tests stay with the components
      if (full.includes(join('cli', 'dashboard'))) continue;
      out.push(...walk(full));
    } else if (entry.endsWith('.test.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Rewrite a relative import path from the old test file location to the
 * equivalent path that lands in src/ from the new tests/ location.
 *   src/runtime/agent-memory.test.ts       (old)
 *   tests/runtime/agent-memory.test.ts     (new)
 *   import './agent-memory.js'             (old)
 *   import '../../src/runtime/agent-memory.js'  (new)
 */
function rewriteImport(spec, oldFile, newFile) {
  if (!spec.startsWith('.')) return spec;
  // Resolve the absolute target relative to the old file's directory
  const oldDir = dirname(oldFile);
  const targetAbs = join(oldDir, spec);
  // Compute the new relative path from the new file's directory
  const newDir = dirname(newFile);
  let rel = relative(newDir, targetAbs);
  // posix-normalize for source files
  rel = rel.split(/[\\/]/).join('/');
  if (!rel.startsWith('.')) rel = './' + rel;
  return rel;
}

function processFile(oldFile) {
  const rel = posix.relative(SRC.split(/[\\/]/).join('/'), oldFile.split(/[\\/]/).join('/'));
  const newFile = join(TESTS, rel);

  // If the new file already exists and the old file doesn't, this run already
  // moved this test in a prior invocation. Skip to make the script idempotent.
  try {
    statSync(newFile);
    try { statSync(oldFile); } catch { return { skipped: true, oldFile, newFile }; }
  } catch {}

  const source = readFileSync(oldFile, 'utf-8');

  // Rewrite import / export specifiers. Matches both
  //   import X from './foo.js'
  //   import('./foo.js')
  //   export ... from './foo.js'
  const rewritten = source.replace(
    /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.\.?\/[^'"]+)\2/g,
    (_match, lead, quote, spec) => {
      const fixed = rewriteImport(spec, oldFile, newFile);
      return `${lead}${quote}${fixed}${quote}`;
    },
  );

  mkdirSync(dirname(newFile), { recursive: true });
  writeFileSync(newFile, rewritten, 'utf-8');
  unlinkSync(oldFile);

  // Tidy up empty directories left behind in src/
  let parent = dirname(oldFile);
  while (parent !== SRC && parent.startsWith(SRC)) {
    try {
      const remaining = readdirSync(parent);
      if (remaining.length === 0) {
        rmdirSync(parent);
        parent = dirname(parent);
      } else break;
    } catch { break; }
  }

  return { skipped: false, oldFile, newFile };
}

const files = walk(SRC);
console.log(`Found ${files.length} test file(s) under src/ (excluding dashboard).`);
let moved = 0;
let skipped = 0;
for (const f of files) {
  const r = processFile(f);
  if (r.skipped) { skipped++; continue; }
  moved++;
  console.log(`  ${posix.relative(ROOT.split(/[\\/]/).join('/'), r.oldFile.split(/[\\/]/).join('/'))} → ${posix.relative(ROOT.split(/[\\/]/).join('/'), r.newFile.split(/[\\/]/).join('/'))}`);
}
console.log(`Done: ${moved} moved, ${skipped} skipped.`);
