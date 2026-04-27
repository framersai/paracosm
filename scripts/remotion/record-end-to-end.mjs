/**
 * End-to-end demo recorder.
 *
 * Walks one prompt across every public visualization in the dashboard:
 *
 *   1. /sim?tab=quickstart -- type a prompt, click "Generate + Run 3 Leaders"
 *   2. compile completes -- /sim?tab=sim takes over (real LLM activity)
 *   3. SIM tab -- live commander/department turns
 *   4. VIZ tab -- visualizations (HEXACO drift, trajectory)
 *   5. REPORTS tab -- fingerprint summary
 *   6. LIBRARY tab -- artifact list
 *   7. RunDetailDrawer -- artifact drilldown
 *
 * Records continuously into a single webm, then post-processes with
 * ffmpeg to speed up the slow compile-wait window so the final mp4 is
 * watchable end-to-end without dead air.
 *
 * Usage:
 *   node record-end-to-end.mjs [output-name] [host] [duration-seconds]
 *
 * Defaults:
 *   output-name      e2e-atlas-7
 *   host             https://paracosm.agentos.sh
 *   duration         210 (seconds; covers compile + sim + tab tour)
 *
 * Environment:
 *   E2E_HEADED=1     run headed instead of headless (debugging)
 *   E2E_KEEP_WEBM=1  keep the raw webm next to the mp4 (debugging)
 *
 * Output:
 *   ../../assets/demo/<output-name>.mp4         (final, post-processed)
 *   ./output/<output-name>.webm                 (raw, when E2E_KEEP_WEBM=1)
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_NAME = process.argv[2] || 'e2e-atlas-7';
const HOST = process.argv[3] || 'https://paracosm.agentos.sh';
// `DURATION_SECONDS` is now informational only -- the recorder runs
// until the Quickstart results region appears, plus a fixed 35s tab
// tour. Kept on the CLI for back-compat with prior callers; ignored
// internally.
const DURATION_SECONDS = parseInt(process.argv[4] || '420', 10);
void DURATION_SECONDS;
const HEADED = process.env.E2E_HEADED === '1';
const KEEP_WEBM = process.env.E2E_KEEP_WEBM === '1';

const VIEW = { width: 1280, height: 720 };
const OUT_DIR = path.resolve(__dirname, 'output');
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'demo');
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

// Atlas-7 release director. The freshest scenario in the repo and the
// one wired into the landing page's Trait Models tab. ai-agent leader
// profile is intentionally adversarial -- the simulation surfaces a
// risky_failure outcome class which is visually distinct from the
// conservative-success outcome a balanced leader would produce.
const ATLAS_PROMPT = `Q4 2026 board brief: Atlas Labs is preparing to release Atlas-7, their next-generation general-purpose AI system. The release director must choose between (a) accepting the safety team's red-team report and delaying 6 weeks, (b) shipping on time with caveats, or (c) overriding the safety team and shipping early to beat a competitor announcement. Production traffic, $40M quarterly revenue at stake, 3 prior incidents of jailbreak escalation unresolved.`;
const ATLAS_DOMAIN = 'AI safety lab leadership decision under release pressure';

console.log(`[e2e] launching ${HEADED ? 'headed' : 'headless'} chromium`);
const browser = await chromium.launch({ headless: !HEADED });
const ctx = await browser.newContext({
  viewport: VIEW,
  recordVideo: { dir: OUT_DIR, size: VIEW },
});
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[error]') || m.type() === 'error') console.log(`  [browser ${m.type()}]`, t.slice(0, 240));
});

// Pre-seed the tour-seen flag so the onboarding tour does not auto-
// start. Without this, App.tsx fires `setActiveTab('sim')` 600ms
// after mount on the quickstart tab, clobbering the form we want to
// fill. The exact key is `paracosm:tourSeen=1` (App.tsx:309); the
// other keys are belt-and-suspenders for older builds and
// dev-only test harnesses.
await page.addInitScript(() => {
  try {
    localStorage.setItem('paracosm:tourSeen', '1');
    const legacy = ['paracosm.tour.seen', 'tour.seen', 'tour-completed', 'paracosm.onboarding.dismissed'];
    legacy.forEach(k => localStorage.setItem(k, 'true'));
  } catch {}
});

console.log(`[e2e] -> ${HOST}/sim?tab=quickstart`);
await page.goto(`${HOST}/sim?tab=quickstart`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(2000);

async function killTour() {
  await page.evaluate(() => {
    const sel = '[data-tour-overlay], [data-tour], [data-tour-step], .tour-overlay, .tour-step, .tour-popover, .tour-callout';
    document.querySelectorAll(sel).forEach(el => el.remove());
    document.querySelectorAll('*').forEach(el => {
      for (const attr of el.attributes ?? []) {
        if (attr.name.startsWith('data-') && attr.name.toLowerCase().includes('tour')) {
          el.remove();
          break;
        }
      }
    });
  });
}
await killTour();
for (const text of ['Got it', 'Skip', 'Dismiss', 'Skip tour', 'Close']) {
  const btn = page.locator('button', { hasText: text }).first();
  if (await btn.isVisible({ timeout: 600 }).catch(() => false)) {
    await btn.click().catch(() => {});
    await page.waitForTimeout(250);
  }
}
await killTour();

// ── 1. PROMPT ENTRY ─────────────────────────────────────────────────────
console.log('[e2e] focus seed textarea + type prompt');
const seedTextarea = page.locator('textarea').first();
await seedTextarea.waitFor({ state: 'visible', timeout: 8000 });
await seedTextarea.click();
await seedTextarea.type(ATLAS_PROMPT, { delay: 8 });
await page.waitForTimeout(400);

console.log('[e2e] fill domain hint');
const domainHint = page.locator('#quickstart-domain-hint');
if (await domainHint.isVisible({ timeout: 1500 }).catch(() => false)) {
  await domainHint.click();
  await domainHint.type(ATLAS_DOMAIN, { delay: 12 });
  await page.waitForTimeout(300);
}

console.log('[e2e] click "Generate + Run 3 Leaders"');
const submit = page.locator('button', { hasText: /Generate \+ Run/i }).first();
await submit.waitFor({ state: 'visible', timeout: 4000 });
await submit.click();

// ── 2. COMPILE + RUN WAIT ──────────────────────────────────────────────
// Quickstart runs the compile + ground-with-citations + leader generation
// + 3 parallel sims inside the QuickstartView -- it never redirects the
// URL to ?tab=sim. The progress UI walks 4 steps to checkmark, then
// flips to a results region (`<div role="region" aria-label="Quickstart
// results">`) when all artifacts have arrived (QuickstartView.tsx:106).
//
// We wait for that results region to appear so the tab tour below
// shows the just-completed Atlas-7 run instead of a stale cached run.
// Total wait covers compile (~60s) + grounding + leader gen + 3 sims
// of N turns; ~5-7 min on default 6-turn scenarios with gpt-5.4-mini.
console.log('[e2e] waiting for Quickstart results region (full run done)');
const RUN_TIMEOUT_MS = 600_000;            // 10 min hard cap
const compileStarted = Date.now();
let runCompleted = false;
try {
  await page.waitForSelector('[role="region"][aria-label="Quickstart results"]', {
    state: 'visible',
    timeout: RUN_TIMEOUT_MS,
  });
  runCompleted = true;
  console.log(`[e2e] run finished after ${((Date.now() - compileStarted) / 1000).toFixed(1)}s`);
} catch {
  console.log('[e2e] run did not complete within timeout -- recording whatever is on screen');
}
// Hold the results card briefly so the verdict + leader fingerprint are
// visible in the recording before we tab-tour onto extras.
const RESULTS_HOLD_S = runCompleted ? 8 : 0;
if (RESULTS_HOLD_S > 0) {
  console.log(`[e2e] hold Quickstart results for ${RESULTS_HOLD_S}s`);
  await page.waitForTimeout(RESULTS_HOLD_S * 1000);
}

// ── 3-4. VIZ / REPORTS / LIBRARY TAB TOUR ─────────────────────────────
// With the Atlas-7 run installed in the runs database (the results
// region appearing implies artifacts in `sse.results` and a backing
// RunRecord), tab-switching now shows real Atlas-7 state instead of
// whatever cached run was last on screen.
const VIZ_HOLD_S = 10;
const REPORTS_HOLD_S = 10;
const LIBRARY_HOLD_S = 6;
const DRAWER_HOLD_S = 8;

async function clickTab(id) {
  const ok = await page.evaluate((tid) => {
    const el = document.getElementById(`tab-${tid}`);
    if (el) { el.click(); return true; }
    return false;
  }, id);
  if (!ok) console.log(`[e2e] tab #tab-${id} not found`);
  return ok;
}

console.log(`[e2e] -> VIZ tab (${VIZ_HOLD_S}s)`);
await clickTab('viz');
await page.waitForTimeout(VIZ_HOLD_S * 1000);

console.log(`[e2e] -> REPORTS tab (${REPORTS_HOLD_S}s)`);
await clickTab('reports');
await page.waitForTimeout(REPORTS_HOLD_S * 1000);

console.log(`[e2e] -> LIBRARY tab (${LIBRARY_HOLD_S}s)`);
await clickTab('library');
await page.waitForTimeout(LIBRARY_HOLD_S * 1000);

// ── 5. LIBRARY DRAWER ───────────────────────────────────────────────────
// Click the first run card (latest run = the one we just produced).
// RunCard.tsx renders [data-run-card] articles; first-of-type targets
// the most recent because RunGallery sorts createdAt-desc.
console.log(`[e2e] open most-recent run drawer (${DRAWER_HOLD_S}s)`);
const firstCard = page.locator('[data-run-card]').first();
if (await firstCard.isVisible({ timeout: 2000 }).catch(() => false)) {
  await firstCard.click();
  await page.waitForTimeout(DRAWER_HOLD_S * 1000);
} else {
  console.log('[e2e] no run cards visible (run may not have completed yet)');
  await page.waitForTimeout(DRAWER_HOLD_S * 1000);
}

// ── 6. FINISH + FFMPEG ──────────────────────────────────────────────────
const videoHandle = page.video();
console.log('[e2e] closing context to flush video');
await ctx.close();
await browser.close();

const webmPath = await videoHandle?.path();
if (!webmPath) {
  console.error('[e2e] no video path returned');
  process.exit(1);
}
console.log('[e2e] webm written:', webmPath);

const mp4Out = path.resolve(ASSETS_DIR, `${OUT_NAME}.mp4`);
console.log('[e2e] ffmpeg -> mp4:', mp4Out);
// Plain transcode (no speed manipulation in v1). The compile-wait
// portion will be visible at real time. Future: split-and-concat with
// setpts on the compile window for a tighter cut.
execFileSync('ffmpeg', [
  '-y',
  '-i', webmPath,
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  '-an',
  mp4Out,
], { stdio: ['ignore', 'inherit', 'inherit'] });

if (KEEP_WEBM) {
  const keptWebm = path.resolve(OUT_DIR, `${OUT_NAME}.webm`);
  copyFileSync(webmPath, keptWebm);
  console.log('[e2e] kept raw webm at:', keptWebm);
}
try { unlinkSync(webmPath); } catch {}

console.log('[e2e] done. Output:', mp4Out);
