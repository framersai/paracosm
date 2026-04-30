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

// Coastal mayor facing a hurricane. Universally relatable framing
// (every coastal/storm region knows the "evacuate / shelter / harden"
// choice tree) with concrete stakes (8,000 people, 36 hours, 14 ft
// surge) the LLM can ground a vivid scenario around. Three decision
// branches that produce measurably divergent leader fingerprints
// (cautious public-safety lead → mandatory evacuation; consensus
// political-coalition lead → voluntary; gritty resilience-engineer
// lead → harden-in-place).
const ATLAS_PROMPT = `Hurricane Cassandra is 36 hours from a coastal town of 8,000. Storm surge could top 14 feet. The mayor must order: full mandatory evacuation, voluntary evacuation with public shelters, or shelter-in-place with home-hardening grants. Highways clear in 6 hours. 22% of residents have no transport.`;
const ATLAS_DOMAIN = 'Coastal mayor crisis leadership under hurricane time pressure';

console.log(`[e2e] launching ${HEADED ? 'headed' : 'headless'} chromium`);
const browser = await chromium.launch({ headless: !HEADED });
// Recording starts when ctx is created. Anchor seg.* timestamps here
// so they land in the same time base ffmpeg trims use (absolute
// source video time). Setting recStartMs after killTour offset every
// seg value by ~3s, and segment A's aEnd ended before the typing
// finished — the typing got buried in segment B at 12× speed.
const ctxCreationMs = Date.now();
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
// start. Also wipe any prior paracosm:* localStorage so the verdict
// banner from a previous run does not bleed into the new recording.
// Earlier recordings showed a stale verdict notification at the top
// of the dashboard because App.tsx rehydrated cached events from
// localStorage on cold load.
await page.addInitScript(() => {
  try {
    // Clear every paracosm:* key so cached events / verdicts /
    // history / cost from prior sessions can't leak in.
    const toRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('paracosm')) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    sessionStorage.clear();
    // Pre-seed the tour-seen flag so the onboarding tour does not
    // auto-start (it sets activeTab='sim' 600ms after mount, which
    // clobbers the Quickstart form we want to fill).
    localStorage.setItem('paracosm:tourSeen', '1');
    const legacy = ['paracosm.tour.seen', 'tour.seen', 'tour-completed', 'paracosm.onboarding.dismissed'];
    legacy.forEach((k) => localStorage.setItem(k, 'true'));
  } catch {}
});

console.log(`[e2e] -> ${HOST}/sim?tab=quickstart`);
await page.goto(`${HOST}/sim?tab=quickstart`, { waitUntil: 'domcontentloaded', timeout: 30000 });

// Server-side state wipe: clear the SSE event buffer + the live
// gameState so the verdict banner from the prior run doesn't appear.
// /clear is unauthenticated; admin/data/wipe needs the token (we don't
// have it here). Best-effort — a 404 or 403 is fine, the localStorage
// clear above already kills the client-side rehydration path.
try {
  await page.evaluate(async () => {
    try { await fetch('/clear', { method: 'POST' }); } catch {}
  });
} catch {}

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
// Track key timestamps (ms-from-recording-start) so the hero ffmpeg pass
// below can split the source into segments and apply selective speed:
// 1× during prompt entry + results + tab tour, ~3× during the
// compile-and-run middle. Without this the loop would either be a wall
// of unreadable fast-typing OR 4 minutes of dead-air "compiling…".
// Anchor to ctxCreationMs (set above when video recording starts) so
// since() returns absolute source time — same time base ffmpeg trims
// use.
const seg = { promptDoneMs: 0, submitClickedMs: 0, resultsAppearedMs: 0 };
const since = () => Date.now() - ctxCreationMs;

console.log('[e2e] focus seed textarea + type prompt');
// Target the SeedInput's textarea explicitly via data-quickstart-seed.
// `textarea.first()` used to match this; that broke after the dt
// card moved into the Quickstart panel. The data-attribute is
// stable across both layouts.
const seedTextarea = page.locator('textarea[data-quickstart-seed]').first();
await seedTextarea.waitFor({ state: 'visible', timeout: 8000 });
await seedTextarea.click();
// keyboard.type() with 25ms delay matches the dt recorder's typing
// rhythm so the e2e top hero reads as real input being entered, not a
// pre-loaded paste. Earlier we used .fill() to dodge a Playwright
// timeout under .type — the timeout was caused by the recorder's
// default 30s action timeout when the seedText length counter
// triggered React re-renders on every char. We bump the action
// timeout below to 60s to give the typing room.
page.setDefaultTimeout(60_000);
await page.keyboard.type(ATLAS_PROMPT, { delay: 25 });
seg.promptDoneMs = since();
// Hold the typed prompt for 5 s so a viewer can read it before the
// form submits and the compile spinner takes over.
await page.waitForTimeout(5000);

console.log('[e2e] fill domain hint');
const domainHint = page.locator('#quickstart-domain-hint');
if (await domainHint.isVisible({ timeout: 1500 }).catch(() => false)) {
  await domainHint.click();
  await domainHint.fill(ATLAS_DOMAIN);
  await page.waitForTimeout(500);
}

console.log('[e2e] click "Generate + Run 3 Leaders"');
const submit = page.locator('button', { hasText: /Generate \+ Run/i }).first();
await submit.waitFor({ state: 'visible', timeout: 4000 });
await submit.click();
seg.submitClickedMs = since();

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
const RUN_TIMEOUT_MS = 900_000;            // 15 min hard cap
const compileStarted = Date.now();
let runCompleted = false;
try {
  await page.waitForSelector('[role="region"][aria-label="Quickstart results"]', {
    state: 'visible',
    timeout: RUN_TIMEOUT_MS,
  });
  runCompleted = true;
  seg.resultsAppearedMs = since();
  console.log(`[e2e] run finished after ${((Date.now() - compileStarted) / 1000).toFixed(1)}s`);
} catch {
  console.log('[e2e] run did not complete within timeout -- recording whatever is on screen');
}
// Hold the Quickstart results region with a three-stage scroll so the
// viewer sees: (1) verdict banner + first actor card at top, (2) the
// middle actor card with its HEXACO bars + delta chips, (3) the third
// actor card + Compare CTA at the bottom. Each step has a short dwell
// so the eye lands naturally before the next scroll fires.
const RESULTS_HOLD_TOP_S = 4;
const RESULTS_HOLD_MID_S = 4;
const RESULTS_HOLD_BOTTOM_S = 5;
if (runCompleted) {
  console.log(`[e2e] hold Quickstart results: ${RESULTS_HOLD_TOP_S}s top, scroll mid, ${RESULTS_HOLD_MID_S}s, scroll bottom, ${RESULTS_HOLD_BOTTOM_S}s`);
  await page.waitForTimeout(RESULTS_HOLD_TOP_S * 1000);
  // Stage 2: scroll to expose actor card 2 + the start of actor 3.
  await page.evaluate(() => window.scrollTo({ top: 360, behavior: 'smooth' }));
  await page.waitForTimeout(RESULTS_HOLD_MID_S * 1000);
  // Stage 3: scroll to fully reveal the third actor card + Compare CTA
  // + Library link. 720px lands the bottom of the page in frame on a
  // 720p viewport with the current QuickstartResults grid.
  await page.evaluate(() => window.scrollTo({ top: 720, behavior: 'smooth' }));
  await page.waitForTimeout(RESULTS_HOLD_BOTTOM_S * 1000);
  // Snap back to the top so subsequent tabs render from a known
  // baseline (some tabs hold their own scroll position).
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);
}

// ── 3a. SIM TAB + CONSTELLATION VIEW ──────────────────────────────────
// Show the Sim tab in side-by-side layout briefly, then flip into the
// Constellation layout (radial graph of all actors with edges colored
// by HEXACO fingerprint similarity) so the demo highlights the new
// multi-actor visualization. The Constellation toggle button carries
// data-layout="constellation"; clicking it is a pure client-side state
// flip, no URL change.
const SIM_SIDE_HOLD_S = 5;
const SIM_CONSTELLATION_HOLD_S = 7;
// VIZ tour: cycle through 4 of the 5 grid modes (skipping ecology
// since the lighter glyph treatment isn't as visually distinct on
// short clips), holding ~3s on each so the difference between modes
// reads. Pre-cycle hold lets the LIVING default settle first.
const VIZ_INTRO_HOLD_S = 4;
const VIZ_MODE_HOLD_S = 3;
const VIZ_MODES = ['mood', 'forge', 'divergence', 'living']; // end back on LIVING for handoff
const REPORTS_HOLD_TOP_S = 5;
const REPORTS_HOLD_MID_S = 5;
const REPORTS_HOLD_BOTTOM_S = 5;
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

console.log(`[e2e] -> SIM tab (${SIM_SIDE_HOLD_S}s side-by-side, ${SIM_CONSTELLATION_HOLD_S}s constellation)`);
await clickTab('sim');
await page.waitForTimeout(SIM_SIDE_HOLD_S * 1000);
// Flip to Constellation layout. The toggle is rendered by SimLayoutToggle
// and exposes data-layout="constellation". Auto-enables when actorCount
// >= 3, but the user can toggle manually too. We click regardless so the
// recording deterministically lands on the constellation regardless of
// whether the auto-enable already fired for this run size.
const switched = await page.evaluate(() => {
  const btn = document.querySelector('button[data-layout="constellation"]');
  if (btn instanceof HTMLElement) { btn.click(); return true; }
  return false;
});
if (!switched) console.log('[e2e] constellation toggle not found (single actor or layout API moved)');
await page.waitForTimeout(SIM_CONSTELLATION_HOLD_S * 1000);

// ── 3b. VIZ TAB MODE TOUR ─────────────────────────────────────────────
// VIZ has 5 grid modes (LIVING / MOOD / FORGE / ECOLOGY / DIVERGENCE)
// each surfacing a different layer of simulation state. A static hold
// only shows one mode and feels stale; here we cycle through 4 modes
// with a brief dwell on each so the demo demonstrates that the panel
// is interactive and reveals different facets of the same run.
console.log(`[e2e] -> VIZ tab (${VIZ_INTRO_HOLD_S}s LIVING intro, then cycle ${VIZ_MODES.join(' -> ')} @ ${VIZ_MODE_HOLD_S}s each)`);
await clickTab('viz');
await page.waitForTimeout(VIZ_INTRO_HOLD_S * 1000);
for (const mode of VIZ_MODES) {
  // The mode pills carry data-grid-mode={key}; we click the first one
  // (left actor's pills) since lifted state means clicking either one
  // toggles both. Falls back silently if the panel layout has changed.
  const ok = await page.evaluate((m) => {
    const btn = document.querySelector(`button[data-grid-mode="${m}"]`);
    if (btn instanceof HTMLElement) { btn.click(); return true; }
    return false;
  }, mode);
  if (!ok) {
    console.log(`[e2e] viz mode pill data-grid-mode="${mode}" not found`);
    continue;
  }
  await page.waitForTimeout(VIZ_MODE_HOLD_S * 1000);
}

// ── 3c. REPORTS TAB SECTION TOUR ──────────────────────────────────────
// Reports has multiple stacked sections (verdict, fingerprint diff,
// decision-tree diff, per-turn rationale). Three-stage scroll sweeps
// through them so the viewer sees the depth of the breakdown, not
// just the verdict header.
console.log(`[e2e] -> REPORTS tab (${REPORTS_HOLD_TOP_S}s top, scroll mid, ${REPORTS_HOLD_MID_S}s, scroll bottom, ${REPORTS_HOLD_BOTTOM_S}s)`);
await clickTab('reports');
await page.waitForTimeout(REPORTS_HOLD_TOP_S * 1000);
const scrollReports = (top) =>
  page.evaluate((t) => {
    const content = document.querySelector('.reports-content, [class*="reports-content"]');
    if (content instanceof HTMLElement) content.scrollTo({ top: t, behavior: 'smooth' });
    else window.scrollTo({ top: t, behavior: 'smooth' });
  }, top);
await scrollReports(500);
await page.waitForTimeout(REPORTS_HOLD_MID_S * 1000);
await scrollReports(1100);
await page.waitForTimeout(REPORTS_HOLD_BOTTOM_S * 1000);
// Snap back so library/compare see a known scroll baseline.
await page.evaluate(() => {
  const content = document.querySelector('.reports-content, [class*="reports-content"]');
  if (content instanceof HTMLElement) content.scrollTo({ top: 0, behavior: 'instant' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
});
await page.waitForTimeout(300);

console.log(`[e2e] -> LIBRARY tab (${LIBRARY_HOLD_S}s)`);
await clickTab('library');
await page.waitForTimeout(LIBRARY_HOLD_S * 1000);

// ── 5a. COMPARE MODAL ──────────────────────────────────────────────────
// Open the most-recent bundle card (the just-finished bundle). The
// LIBRARY now collapses bundle members into a single BundleCard
// (data-bundle-card). Click opens the CompareModal with aggregate
// strip + small-multiples grid + (when cells are pinned) the
// PinnedDiffPanel showing the four diff dimensions.
const COMPARE_HOLD_S = 6;
const COMPARE_PIN_HOLD_S = 5;
console.log(`[e2e] open Compare modal for the most-recent bundle (~${COMPARE_HOLD_S + COMPARE_PIN_HOLD_S}s total)`);
const firstBundle = page.locator('[data-bundle-card]').first();
if (await firstBundle.isVisible({ timeout: 2000 }).catch(() => false)) {
  await firstBundle.click();
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { state: 'visible', timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(COMPARE_HOLD_S * 1000); // hold on aggregate + grid
  // Pin two cells so PinnedDiffPanel renders.
  const pinCheckboxes = page.locator('[role="dialog"] input[type="checkbox"]');
  const pinCount = await pinCheckboxes.count();
  if (pinCount >= 2) {
    await pinCheckboxes.nth(0).check().catch(() => {});
    await page.waitForTimeout(1500);
    await pinCheckboxes.nth(1).check().catch(() => {});
    await page.waitForTimeout(COMPARE_PIN_HOLD_S * 1000);
  } else {
    await page.waitForTimeout(COMPARE_PIN_HOLD_S * 1000);
  }
  // Close modal with Esc to return to LIBRARY.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
} else {
  console.log('[e2e] no bundle cards visible (run may not have completed or count=1)');
}

// ── 5b. RUN DRAWER ──────────────────────────────────────────────────────
// Click the first run card (latest solo run, if any). RunCard renders
// [data-run-card] articles. After the bundle card pass above, the
// drawer shows a single artifact's full detail.
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

// ── 6a. FULL REFERENCE TRANSCODE ───────────────────────────────────────
const mp4Out = path.resolve(ASSETS_DIR, `${OUT_NAME}.mp4`);
console.log('[e2e] ffmpeg -> full mp4:', mp4Out);
execFileSync('ffmpeg', [
  '-y',
  '-i', webmPath,
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  // +faststart relocates the moov atom to the front of the file so
  // browsers can scrub through the timeline without first downloading
  // the whole mp4. Without it the landing-page <video controls> bar
  // shows the scrubber but seeking is disabled until full buffer.
  '-movflags', '+faststart',
  '-an',
  mp4Out,
], { stdio: ['ignore', 'inherit', 'inherit'] });

// ── 6b. HERO LOOP CUT (selective speed + caption) ──────────────────────
// Three segments stitched into one mp4:
//
//   A: 0 .. (submitClicked + 1.0 s)           1× speed, no caption
//      (prompt typing + 2.5 s read pause + the click landing)
//   B: (submitClicked + 1.0 s) .. (results - 0.5 s)
//                                             10× speed, "sped up" caption
//      (compile + ground + leader gen + 3 sims to Turn 6)
//   C: (results - 0.5 s) .. end of recording  1× speed, no caption
//      (results region + VIZ + REPORTS + LIBRARY + drawer)
//
// Falls back to a uniform 10× speed-up if `runCompleted` is false (the
// run hit the 10-min cap and we never got a results timestamp).
//
// SPEED_B was 3 originally; users said the compile window dragged on
// the landing page, so the middle segment now collapses ~5 minutes of
// real-time work into ~30 seconds. Captions stay legible at 10× for
// dashboard text the size we render.
const heroOut = path.resolve(ASSETS_DIR, `${OUT_NAME}-hero.mp4`);
// Skip the first 0.5s of the recording. Playwright's video capture
// records from context creation, but Chromium's first paint happens a
// few hundred ms after navigation lands — those leading frames are a
// white default-body-color flash that reads as a glitch on the landing
// page. 0.5s is empirically clean across multiple recordings and never
// crosses into the prompt-typing phase (which starts ~2s in).
const A_START_S = 0.5;
const aEnd = ((seg.submitClickedMs || 8000) + 1000) / 1000;
const bEnd = runCompleted
  ? Math.max(aEnd + 5, (seg.resultsAppearedMs - 500) / 1000)
  : null;
const SPEED_B = 12.0;
console.log(`[e2e] ffmpeg -> hero mp4: ${heroOut}`);
console.log(`  segments: A ${A_START_S.toFixed(1)}..${aEnd.toFixed(1)}s 1×, B ${aEnd.toFixed(1)}..${bEnd?.toFixed(1) ?? '∞'}s ${SPEED_B}×, C ${bEnd?.toFixed(1) ?? '?'}s..end 1×`);
// drawtext caption stays inside the B trim window so it does not bleed
// into A or C frames after the concat. Amber-on-black to match the
// digital-twin demo's caption styling — both heroes now read as a
// matched pair on the landing page instead of one white / one yellow.
const caption = `Compile + 3 parallel sims · ${SPEED_B}× speed`;
const drawtext = (
  `drawtext=` +
  `text='${caption}'` +
  `:fontcolor=#ffd970` +
  `:fontsize=20` +
  `:font='Helvetica-Bold'` +
  `:shadowcolor=black:shadowx=0:shadowy=2` +
  `:x=(w-tw)/2` +
  `:y=h-72` +
  `:box=1:boxcolor=black@0.95:boxborderw=22`
);
// Segment C: results + tab tour. Played at 2.5× so 200+ seconds of
// recorded scrolls and tab clicks compress to ~35s. Captioned as plain
// "Results · Sim · Viz · Reports · Library" — the earlier "· 2.5× speed"
// suffix advertised acceleration that doesn't add value (the content
// is just tab navigation, not LLM activity worth signposting).
//
// Hard-cap the segment at 86s of source content so the final hero
// caps near 1:34 wall time and fades out, instead of running on for
// another minute of dead-air after the Library card hover.
const SPEED_C = 2.5;
const C_MAX_SOURCE_SECONDS = 86;
const captionC = 'Results · Sim · Viz · Reports · Library';
const drawtextC = (
  `drawtext=` +
  `text='${captionC}'` +
  `:fontcolor=#ffd970` +
  `:fontsize=20` +
  `:font='Helvetica-Bold'` +
  `:shadowcolor=black:shadowx=0:shadowy=2` +
  `:x=(w-tw)/2` +
  `:y=h-72` +
  `:box=1:boxcolor=black@0.95:boxborderw=22`
);
// Hero duration heuristic for the fade-out: A at 1×, B at SPEED_B,
// C at SPEED_C capped at C_MAX_SOURCE_SECONDS. Subtract 1s so the
// fade actually lands inside the trimmed clip instead of past its end.
const heroDurationS = bEnd
  ? (aEnd - A_START_S) + (bEnd - aEnd) / SPEED_B + C_MAX_SOURCE_SECONDS / SPEED_C
  : (aEnd - A_START_S) + 30; // fallback: just a soft tail
const fadeStart = Math.max(0, heroDurationS - 1).toFixed(3);
const cEndSrc = bEnd ? (bEnd + C_MAX_SOURCE_SECONDS).toFixed(3) : null;
const filterGraph = bEnd && cEndSrc
  ? (
    `[0:v]trim=start=${A_START_S.toFixed(3)}:end=${aEnd.toFixed(3)},setpts=PTS-STARTPTS[a];` +
    `[0:v]trim=start=${aEnd.toFixed(3)}:end=${bEnd.toFixed(3)},setpts=(PTS-STARTPTS)/${SPEED_B},${drawtext}[b];` +
    `[0:v]trim=start=${bEnd.toFixed(3)}:end=${cEndSrc},setpts=(PTS-STARTPTS)/${SPEED_C},${drawtextC}[c];` +
    `[a][b][c]concat=n=3:v=1[concat];[concat]fade=t=out:st=${fadeStart}:d=1[out]`
  )
  : (
    // Fallback (run did not finish in time). Preserve segment A at 1×
    // so the typing + click are still readable; speed up everything
    // after click at SPEED_B with the segment-B caption. The earlier
    // "uniform 12× over the whole thing" version buried the typing
    // phase too — viewers lost the input moment.
    `[0:v]trim=start=${A_START_S.toFixed(3)}:end=${aEnd.toFixed(3)},setpts=PTS-STARTPTS[a];` +
    `[0:v]trim=start=${aEnd.toFixed(3)},setpts=(PTS-STARTPTS)/${SPEED_B},${drawtext}[b];` +
    `[a][b]concat=n=2:v=1[out]`
  );
execFileSync('ffmpeg', [
  '-y',
  '-i', webmPath,
  '-filter_complex', filterGraph,
  '-map', '[out]',
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  // +faststart relocates the moov atom to the front of the file so
  // browsers can scrub through the timeline without first downloading
  // the whole mp4. Without it the landing-page <video controls> bar
  // shows the scrubber but seeking is disabled until full buffer.
  '-movflags', '+faststart',
  '-an',
  heroOut,
], { stdio: ['ignore', 'inherit', 'inherit'] });

// ── 6c. POSTER FROM RESULTS FRAME ──────────────────────────────────────
// Pull a still from inside the results-region hold so first-paint shows
// "what you'll get" instead of an empty Quickstart input.
if (runCompleted) {
  const posterOut = path.resolve(ASSETS_DIR, `${OUT_NAME}-poster.jpg`);
  const posterAt = Math.max(0, (seg.resultsAppearedMs / 1000) + 4); // 4 s into results
  console.log(`[e2e] ffmpeg -> poster jpg @ ${posterAt.toFixed(1)}s: ${posterOut}`);
  execFileSync('ffmpeg', [
    '-y',
    '-ss', String(posterAt),
    '-i', webmPath,
    '-frames:v', '1',
    '-q:v', '4',
    '-update', '1',
    posterOut,
  ], { stdio: ['ignore', 'inherit', 'inherit'] });
}

if (KEEP_WEBM) {
  const keptWebm = path.resolve(OUT_DIR, `${OUT_NAME}.webm`);
  copyFileSync(webmPath, keptWebm);
  console.log('[e2e] kept raw webm at:', keptWebm);
}
try { unlinkSync(webmPath); } catch {}

console.log('[e2e] done.');
console.log(`  full:   ${mp4Out}`);
console.log(`  hero:   ${heroOut}`);
console.log(`  segments: { promptDoneMs: ${seg.promptDoneMs}, submitClickedMs: ${seg.submitClickedMs}, resultsAppearedMs: ${seg.resultsAppearedMs} }`);
