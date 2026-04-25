/**
 * Minimal type declarations for the generate-changelog.mjs script. Lets
 * the test file at tests/scripts/generate-changelog.test.ts import these
 * symbols without TypeScript complaining about missing declarations.
 *
 * Intentionally loose. The script itself is plain JavaScript with no
 * formal type contract; tests exercise the runtime behavior. If the
 * script grows a real type surface later, replace this with proper
 * generated declarations.
 */
export const EARLIEST_BOUNDARY_MAJOR_MINOR: string;
export const LOCKED_ENTRY_VERSIONS: string[];
export function parseCommit(input: { sha: string; subject: string; body: string; author: string }): any;
export function classifyCommit(commit: any): any;
export function extractNarratives(changelogText: string): any;
export function extractLockedEntries(changelogText: string, wantVersions: string[]): any;
export function runGit(args: string[]): string;
export function detectBoundaries(deps?: { runGit?: (args: string[]) => string }): any[];
export function sliceCommits(prevSha: string, currSha: string, deps?: { runGit?: (args: string[]) => string }): any[];
export function renderBullet(commit: any): string;
export function renderEntry(...args: any[]): string;
