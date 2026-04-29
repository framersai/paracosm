/**
 * Digital Twin demo recorder.
 *
 * Drives the InterventionDemoCard end-to-end against prod:
 *
 *   1. /sim?tab=quickstart -- scroll to InterventionDemoCard
 *   2. Click "Run intervention demo" (posts to
 *      /api/quickstart/simulate-intervention with prefilled Atlas Lab
 *      + 90-day delay payload)
 *   3. Wait for the SIM tab to swap in with DigitalTwinPanel rendered
 *      (subject + intervention cards, final-state metrics with delta,
 *      trajectory chart, fingerprint chips)
 *   4. Hold + scroll through the result so the trajectory chart and
 *      fingerprint band are both in frame.
 *
 * Records into a single webm, post-processes with ffmpeg into a hero
 * mp4 with selective speed (1× setup + result, ~3× during the LLM-call
 * wait window) plus an amber caption explaining each phase, matching
 * the rest of the landing-page demos.
 *
 * Usage:
 *   node record-digital-twin.mjs [output-name] [host]
 *
 * Defaults:
 *   output-name      digital-twin-atlas-lab
 *   host             https://paracosm.agentos.sh
 *
 * Environment:
 *   E2E_HEADED=1     run headed (debugging)
 *   E2E_KEEP_WEBM=1  keep the raw webm next to the mp4
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, copyFileSync, unlinkSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const OUT_NAME = process.argv[2] || 'digital-twin-maria';
const HOST = process.argv[3] || 'https://paracosm.agentos.sh';
const HEADED = process.env.E2E_HEADED === '1';
const KEEP_WEBM = process.env.E2E_KEEP_WEBM === '1';

const VIEW = { width: 1280, height: 720 };
const OUT_DIR = path.resolve(__dirname, 'output');
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'demo');
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

console.log(`[dt] launching ${HEADED ? 'headed' : 'headless'} chromium`);
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

await page.addInitScript(() => {
  try {
    localStorage.setItem('paracosm:tourSeen', '1');
    const legacy = ['paracosm.tour.seen', 'tour.seen', 'tour-completed', 'paracosm.onboarding.dismissed'];
    legacy.forEach(k => localStorage.setItem(k, 'true'));
  } catch {}
});

console.log(`[dt] -> ${HOST}/sim?tab=quickstart`);
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

// Track key timestamps so the hero ffmpeg pass can split + accelerate.
const recStartMs = Date.now();
const seg = { introHoldMs: 0, clickedMs: 0, resultRenderedMs: 0 };
const since = () => Date.now() - recStartMs;

// ── 1. SCROLL DIRECTLY TO INTERVENTION DEMO CARD ───────────────────────
// The recorder skips the empty SeedInput intro entirely. After scroll
// the InterventionDemoCard kicks off a typewriter animation (subject
// fields type in, then intervention fields). Hold 6s so the full
// type-in completes BEFORE the click — that's the "input being
// entered" moment the dt demo needs to convey.
//
// Typewriter timing (set in InterventionDemoCard.tsx via
// IntersectionObserver + startDelayMs):
//   Subject:     starts 300ms after card enters viewport,  ~3s to type
//   Intervention: starts 1700ms after viewport entry,      ~3s to type
//   Both done at: ~4.7s
console.log('[dt] scroll directly to InterventionDemoCard (skipping empty-seed framing)');
const card = page.locator('text=Or test an intervention').first();
await card.waitFor({ state: 'visible', timeout: 15000 });
await card.scrollIntoViewIfNeeded();
seg.introHoldMs = since();
await page.waitForTimeout(9000);

// ── 3. CLICK "Run intervention demo" ───────────────────────────────────
console.log('[dt] click Run intervention demo button');
const runBtn = page.locator('button', { hasText: /Run intervention demo/i }).first();
await runBtn.waitFor({ state: 'visible', timeout: 5000 });
await runBtn.click();
seg.clickedMs = since();

// ── 4. WAIT FOR DIGITAL TWIN PANEL ─────────────────────────────────────
// On click, POST /api/quickstart/simulate-intervention runs the
// pre-warmed WorldModel against Atlas Lab + 90-day delay and returns
// an artifact. App.tsx parks it in interventionArtifact, switches the
// active tab to 'sim', and SimView short-circuits to DigitalTwinPanel
// which renders an h2 with "Digital Twin · Intervention Result".
//
// The :has-text matcher is substring, so we have to disambiguate from
// DigitalTwinProgress's "Digital Twin · Running" header (rendered the
// instant the user clicks). Anchoring to "Intervention Result" is the
// surest hit on the completed panel.
console.log('[dt] waiting for DigitalTwinPanel (up to 120s)');
const RUN_TIMEOUT_MS = 120_000;
const runStart = Date.now();
let resultRendered = false;
try {
  await page.waitForSelector('h2:has-text("Intervention Result")', {
    state: 'visible',
    timeout: RUN_TIMEOUT_MS,
  });
  resultRendered = true;
  seg.resultRenderedMs = since();
  console.log(`[dt] result rendered after ${((Date.now() - runStart) / 1000).toFixed(1)}s`);
} catch {
  console.log('[dt] result did not render within timeout; recording whatever is on screen');
}

// ── 5. HOLD + SCROLL THROUGH PANEL ─────────────────────────────────────
const RESULT_HOLD_TOP_S = 5;
const RESULT_HOLD_MID_S = 5;
const RESULT_HOLD_BOTTOM_S = 6;
if (resultRendered) {
  console.log(`[dt] hold panel: ${RESULT_HOLD_TOP_S}s top, scroll mid, ${RESULT_HOLD_MID_S}s, scroll bottom, ${RESULT_HOLD_BOTTOM_S}s`);
  await page.waitForTimeout(RESULT_HOLD_TOP_S * 1000);
  // Scroll to expose the trajectory chart + final-state grid.
  await page.evaluate(() => window.scrollTo({ top: 320, behavior: 'smooth' }));
  await page.waitForTimeout(RESULT_HOLD_MID_S * 1000);
  // Scroll to fingerprint chips at the bottom.
  await page.evaluate(() => window.scrollTo({ top: 700, behavior: 'smooth' }));
  await page.waitForTimeout(RESULT_HOLD_BOTTOM_S * 1000);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);
} else {
  await page.waitForTimeout(8000);
}

// ── 6. FINISH + FFMPEG ────────────────────────────────────────────────
const videoHandle = page.video();
console.log('[dt] closing context to flush video');
await ctx.close();
await browser.close();

const webmPath = await videoHandle?.path();
if (!webmPath) {
  console.error('[dt] no video path returned');
  process.exit(1);
}
console.log('[dt] webm written:', webmPath);

const mp4Out = path.resolve(ASSETS_DIR, `${OUT_NAME}.mp4`);
console.log('[dt] ffmpeg -> full mp4:', mp4Out);
execFileSync('ffmpeg', [
  '-y',
  '-i', webmPath,
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-an',
  mp4Out,
], { stdio: ['ignore', 'inherit', 'inherit'] });

// Hero cut: A (intro + scroll + click) at 1×, B (LLM wait) at 4× with
// caption, C (DigitalTwinPanel hold) at 1× with caption. Total target
// ~25-35s.
const heroOut = path.resolve(ASSETS_DIR, `${OUT_NAME}-hero.mp4`);
// Trim 2s off the front. Recorder waits ~2s for hydration + killTour
// before scrolling, so cutting the first 2s of source removes most of
// the empty-Quickstart phase. Source 2s onward shows the scroll
// landing on the dt card and the typewriter animation running through
// subject + intervention fields.
const A_START_S = 2.0;
const aEnd = ((seg.clickedMs || 8000) + 800) / 1000;
const bEnd = resultRendered
  ? Math.max(aEnd + 4, (seg.resultRenderedMs - 500) / 1000)
  : null;
const SPEED_B = 4.0;

console.log(`[dt] ffmpeg -> hero mp4: ${heroOut}`);
console.log(`  segments: A ${A_START_S.toFixed(1)}..${aEnd.toFixed(1)}s 1×, B ${aEnd.toFixed(1)}..${bEnd?.toFixed(1) ?? '∞'}s ${SPEED_B}×, C ${bEnd?.toFixed(1) ?? '?'}s..end 1×`);

// drawtext rejects unescaped colons in `text=...`, and escaping them is
// brittle. Use · or commas instead so the captions stay readable.
//
// Caption arc tracks the digital-twin pattern: question (what happens?)
// -> the API call answering it -> the typed result with the metrics
// that actually moved. Names a real patient (Maria Chen) and a real
// clinical intervention so the demo reads as concrete rather than
// aspirational.
const captionA = 'What happens to Maria on a 12-week semaglutide + lifestyle protocol?';
const captionB = `twin.simulateIntervention runs against the live scenario · ${SPEED_B}× speed`;
// Cost figure stays generic ("under 1 USD") since per-run cost varies
// with maxTurns. At maxTurns=2 a typical run hits $0.20-$0.30.
const captionC = 'Answer · HbA1c, weight, exercise, QoL, mortality risk · under $1';

const drawCaption = (text, color = '#ffd970') => (
  `drawtext=text='${text.replace(/'/g, "\\\\'")}':enable='gte(t,0)':fontsize=20:font='Helvetica-Bold':fontcolor=${color}:shadowcolor=black:shadowx=0:shadowy=2:x=(w-tw)/2:y=h-72:box=1:boxcolor=black@0.95:boxborderw=22`
);

const filterGraph = bEnd
  ? (
    `[0:v]trim=start=${A_START_S.toFixed(3)}:end=${aEnd.toFixed(3)},setpts=PTS-STARTPTS,${drawCaption(captionA)}[a];` +
    `[0:v]trim=start=${aEnd.toFixed(3)}:end=${bEnd.toFixed(3)},setpts=(PTS-STARTPTS)/${SPEED_B},${drawCaption(captionB)}[b];` +
    `[0:v]trim=start=${bEnd.toFixed(3)},setpts=PTS-STARTPTS,${drawCaption(captionC)}[c];` +
    `[a][b][c]concat=n=3:v=1[out]`
  )
  : (
    `[0:v]trim=start=${A_START_S.toFixed(3)},setpts=(PTS-STARTPTS)/${SPEED_B},${drawCaption(captionB)}[out]`
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
  '-movflags', '+faststart',
  '-an',
  heroOut,
], { stdio: ['ignore', 'inherit', 'inherit'] });

console.log(`[dt] hero mp4 -> ${heroOut}`);

if (KEEP_WEBM) {
  const keepPath = path.resolve(OUT_DIR, `${OUT_NAME}.webm`);
  copyFileSync(webmPath, keepPath);
  console.log(`[dt] kept webm at ${keepPath}`);
} else {
  try { unlinkSync(webmPath); } catch {}
}

console.log('[dt] done');
