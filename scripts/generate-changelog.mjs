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

import { execSync } from 'node:child_process';
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
