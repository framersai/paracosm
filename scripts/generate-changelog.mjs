/**
 * Paracosm CHANGELOG + release-notes generator.
 *
 * Produces CHANGELOG.md (committed; grouped by major.minor) and
 * release-notes.md (ephemeral CI artifact; passed to `gh release create
 * --notes-file`). Runs offline with zero deps; only shells out to `git`.
 *
 * Spec: docs/superpowers/specs/2026-04-22-p15-automated-changelog-design.md
 *
 * @module scripts/generate-changelog
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/**
 * The earliest major.minor boundary to render in the output. Boundaries
 * below this floor (e.g. 0.3.0, 0.2.0 pre-npm-publish entries) are
 * dropped even if git history contains them. Single source of truth:
 * bump to include older history.
 */
export const EARLIEST_BOUNDARY_MAJOR_MINOR = '0.4.0';

const REPO_URL = 'https://github.com/framersai/paracosm';

/**
 * Fixed set of conventional-commit types the parser recognises as
 * structured prefixes. A subject like `dashboard: fix X` looks regex-wise
 * like `type: rest`, but `dashboard` isn't a conventional type — it's a
 * scope-only prefix. We treat it as non-conventional and keep the full
 * subject intact.
 */
const CONVENTIONAL_TYPES = new Set([
  'feat', 'fix', 'perf', 'refactor', 'style',
  'test', 'docs', 'chore', 'build', 'ci', 'revert',
  'security',
]);

// ---------------------------------------------------------------------------
// Pure parsing + classification
// ---------------------------------------------------------------------------

/**
 * Parse a raw git commit into the shape the classifier + renderer need.
 * Input fields are strings as git emitted them.
 */
export function parseCommit({ sha, subject, body, author }) {
  const match = /^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.*)$/.exec(subject);
  if (match && CONVENTIONAL_TYPES.has(match[1])) {
    const [, type, scope = null, bang, rest] = match;
    return {
      sha,
      shortSha: sha.slice(0, 7),
      type,
      scope,
      breaking: !!bang || /^BREAKING[ -]CHANGE:/m.test(body),
      subject: rest,
      fullSubject: subject,
      body,
      author,
    };
  }
  return {
    sha,
    shortSha: sha.slice(0, 7),
    type: null,
    scope: null,
    breaking: /^BREAKING[ -]CHANGE:/m.test(body),
    subject,
    fullSubject: subject,
    body,
    author,
  };
}

/**
 * Classify a parsed commit into one of five buckets. Order matters:
 * breaking check runs first so `feat!:` lands in breaking, not features.
 */
export function classifyCommit(c) {
  if (c.breaking) return 'breaking';
  if (c.type === 'feat') return 'features';
  if (c.type === 'fix') return 'bugfixes';
  if (c.type === 'perf') return 'performance';
  return 'other';
}

// ---------------------------------------------------------------------------
// Narrative preservation
// ---------------------------------------------------------------------------

/**
 * Parse an existing CHANGELOG.md string, returning a map of
 * version → narrative block. A narrative is everything between the
 * `## <version> (...)` header line and the first `###` subsection
 * (or the next `## ` entry, or end of file). Leading and trailing
 * whitespace and horizontal-rule separators are trimmed.
 *
 * Returns an empty Map if the input is empty or missing.
 */
export function extractNarratives(changelogText) {
  const narratives = new Map();
  if (!changelogText) return narratives;

  const entries = changelogText.split(/(?=^## \d+\.\d+\.\d+)/m);
  for (const entry of entries) {
    const versionMatch = /^## (\d+\.\d+\.\d+)/m.exec(entry);
    if (!versionMatch) continue;
    const version = versionMatch[1];

    const headerEndIdx = entry.indexOf('\n');
    if (headerEndIdx === -1) {
      narratives.set(version, '');
      continue;
    }
    const bodyAfterHeader = entry.slice(headerEndIdx + 1);

    const subsectionIdx = bodyAfterHeader.search(/^### /m);
    const ruleIdx = bodyAfterHeader.search(/^---\s*$/m);
    const ends = [subsectionIdx, ruleIdx].filter(i => i !== -1);
    const narrativeEnd = ends.length ? Math.min(...ends) : bodyAfterHeader.length;

    const narrative = bodyAfterHeader.slice(0, narrativeEnd).trim();
    narratives.set(version, narrative);
  }
  return narratives;
}

// ---------------------------------------------------------------------------
// Git seam
// ---------------------------------------------------------------------------

/**
 * Default git command runner. Takes an array of git arguments, returns
 * stdout as a trimmed string. Throws if git exits non-zero.
 *
 * Tests replace this via the `runGit` option so they never shell out.
 */
export function runGit(args) {
  // execFileSync preserves args as an array without shell interpretation,
  // which matters because flags like `--pretty=format:%H %cs` contain
  // literal spaces that a shell invocation would split on.
  const out = execFileSync('git', args, {
    encoding: 'utf-8',
    maxBuffer: 128 * 1024 * 1024,
  });
  return out.trimEnd();
}

/**
 * Compare two `M.N.P`-style version strings on major.minor only.
 * Returns true when `candidate`'s major.minor sorts at or above `floor`.
 */
function majorMinorAtLeast(candidate, floor) {
  const [ca, cb] = candidate.split('.').map(Number);
  const [fa, fb] = floor.split('.').map(Number);
  if (ca !== fa) return ca > fa;
  return cb >= fb;
}

/**
 * Compare two M.N.P version strings; returns true when they share major
 * and minor components (run-number patch differences ignored).
 */
function sameMajorMinor(a, b) {
  const [aa, ab] = a.split('.');
  const [ba, bb] = b.split('.');
  return aa === ba && ab === bb;
}

/**
 * Walk git log for commits that modified package.json. Read each
 * commit's package.json version. Filter commits where the major.minor
 * didn't change from the previous boundary (filters CI run-number
 * writes and same-version patch commits). Also filter commits whose
 * major.minor sorts below EARLIEST_BOUNDARY_MAJOR_MINOR.
 *
 * Returns boundaries newest-first, each `{ sha, date, version }`. When
 * `runGit` is provided, uses it instead of the real git seam.
 */
export function detectBoundaries({ runGit: gitFn = runGit } = {}) {
  const raw = gitFn([
    'log',
    '--diff-filter=M',
    '--pretty=format:%H %cs',
    '--',
    'package.json',
  ]);
  if (!raw) return [];

  const rows = raw.split('\n').map(line => {
    const [sha, date] = line.split(' ');
    return { sha, date };
  });

  // Walk from oldest to newest so we can compare each against the previous
  // version; only keep boundaries that changed major.minor.
  const chronological = [...rows].reverse();
  const kept = [];
  let prevMajorMinor = null;
  for (const row of chronological) {
    const pkgRaw = gitFn(['show', `${row.sha}:package.json`]);
    let version;
    try {
      version = JSON.parse(pkgRaw).version;
    } catch {
      continue;
    }
    if (!version) continue;
    if (prevMajorMinor === null || !sameMajorMinor(version, prevMajorMinor)) {
      kept.push({ sha: row.sha, date: row.date, version });
      prevMajorMinor = version;
    }
  }

  kept.reverse();

  return kept.filter(b => majorMinorAtLeast(b.version, EARLIEST_BOUNDARY_MAJOR_MINOR));
}

/**
 * Fetch and parse commits in the range `prevSha..currSha`. Output is
 * newest-first (matching git log's default). Filters bot-authored
 * commits, `chore: update CHANGELOG` subjects, and `Merge ` prefixes.
 * Uses `\x01` (SOH) as field separator and `\x02` (STX) as record
 * separator to tolerate commit bodies containing newlines.
 */
export function sliceCommits(prevSha, currSha, { runGit: gitFn = runGit } = {}) {
  const raw = gitFn([
    'log',
    '--no-merges',
    `--pretty=format:%H%x01%s%x01%an%x01%b%x02`,
    `${prevSha}..${currSha}`,
  ]);
  if (!raw) return [];

  const records = raw.split('\x02').filter(r => r.trim().length);
  const commits = [];
  for (const record of records) {
    const [sha, subject, author, body] = record.split('\x01');
    if (!sha || !subject) continue;
    if (author === 'github-actions[bot]') continue;
    if (subject === 'chore: update CHANGELOG') continue;
    if (subject.startsWith('Merge ')) continue;
    commits.push({
      sha: sha.trim(),
      subject,
      author,
      body: body ?? '',
    });
  }
  return commits;
}
