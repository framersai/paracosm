/**
 * Records a real run on https://paracosm.agentos.sh.
 *
 * Flow:
 *   1. open /sim
 *   2. switch to SIM tab
 *   3. click RUN
 *   4. wait until SSE events start streaming (commander turn, department reports)
 *   5. record ~12s of real LLM-driven activity
 *   6. close → playwright writes the webm
 *   7. ffmpeg → mp4 + crop + 8s trim
 *
 * Usage: node record-sim.mjs <output-name>
 *   e.g. node record-sim.mjs sim-real
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, renameSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROD = 'https://paracosm.agentos.sh';
const VIEW = { width: 1280, height: 720 };
const OUT_DIR = path.resolve(__dirname, 'output');
const ASSETS_DIR = path.resolve(__dirname, '..', '..', 'assets', 'demo');

const outName = process.argv[2] || 'sim-real';
const RECORD_SECONDS = parseInt(process.argv[3] || '24', 10);
const TRIM_START = parseInt(process.argv[4] || '4', 10);
const TRIM_SECONDS = parseInt(process.argv[5] || '18', 10);

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(ASSETS_DIR, { recursive: true });

console.log(`[record] launching headed chromium`);
const browser = await chromium.launch({ headless: false });
const ctx = await browser.newContext({
  viewport: VIEW,
  recordVideo: { dir: OUT_DIR, size: VIEW },
});
const page = await ctx.newPage();
page.on('console', (m) => {
  const t = m.text();
  if (t.includes('[error]') || m.type() === 'error') console.log(`  [browser ${m.type()}]`, t.slice(0, 200));
});

console.log('[record] preseed localStorage to dismiss tour/onboarding');
await page.addInitScript(() => {
  // common tour-state keys; setting both is harmless if only one is real
  try {
    const keys = ['paracosm.tour.seen', 'tour.seen', 'tour-completed', 'paracosm.onboarding.dismissed'];
    keys.forEach(k => localStorage.setItem(k, 'true'));
  } catch {}
});

console.log('[record] -> /sim?tab=sim');
await page.goto(`${PROD}/sim?tab=sim`, { waitUntil: 'domcontentloaded', timeout: 30000 });
await page.waitForTimeout(3500);

console.log('[record] aggressively remove any tour DOM');
async function killTour() {
  await page.evaluate(() => {
    // Remove every element whose attribute or class hints "tour"
    const sel = '[data-tour-overlay], [data-tour], [data-tour-step], .tour-overlay, .tour-step, .tour-popover, .tour-callout';
    document.querySelectorAll(sel).forEach(el => el.remove());
    // Also nuke anything with "tour" in any data-* attribute
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
    await page.waitForTimeout(300);
  }
}
await killTour();
await page.waitForTimeout(400);
await killTour();

console.log('[record] click ▶RUN to open menu');
const runBtn = page.locator('button', { hasText: /^▶RUN/ }).first();
await runBtn.waitFor({ state: 'visible', timeout: 8000 });
await runBtn.click();
await page.waitForTimeout(1500);

console.log('[record] click "Run New Simulation" via getByText');
await page.getByText(/Run New Simulation/i).first().click({ timeout: 6000, force: true });
console.log('[record] sim launched — recording starts NOW to capture Launching Simulation state');

// NB: do NOT delay before recording — the "Launching Simulation..."
// state is what we want as the first frame of the loop.
await page.waitForTimeout(300);

// Optional 7th arg: tab-tour-at-seconds. When set (e.g. "90"), the
// recorder waits this long, then clicks #tab-viz, holds 6s, then
// clicks #tab-reports, holds 6s, then returns to #tab-sim. Designed
// to stitch a tab tour onto the end of a multi-turn recording so
// the hero loop covers sim + viz + reports in one pass.
const TAB_TOUR_AT = parseInt(process.argv[7] || '0', 10);

if (TAB_TOUR_AT > 0) {
  console.log(`[record] recording for ${TAB_TOUR_AT}s of sim activity, then tab tour`);
  await page.waitForTimeout(TAB_TOUR_AT * 1000);
  for (const tab of ['viz', 'reports']) {
    console.log(`[record] tab tour: click #tab-${tab}`);
    const clicked = await page.evaluate((id) => {
      const el = document.getElementById(id);
      if (el) { el.click(); return true; }
      return false;
    }, `tab-${tab}`);
    if (!clicked) console.log(`[record] tab tour: #tab-${tab} not found`);
    await page.waitForTimeout(6000);
  }
  console.log(`[record] tab tour: return to #tab-sim`);
  await page.evaluate(() => document.getElementById('tab-sim')?.click());
  const remaining = (RECORD_SECONDS - TAB_TOUR_AT - 14) * 1000;
  if (remaining > 0) await page.waitForTimeout(remaining);
} else {
  console.log(`[record] recording for ${RECORD_SECONDS}s of real streaming activity`);
  await page.waitForTimeout(RECORD_SECONDS * 1000);
}

const videoHandle = page.video();
console.log('[record] closing context to flush video');
await ctx.close();
await browser.close();

const webmPath = await videoHandle?.path();
if (!webmPath) {
  console.error('[record] no video path returned');
  process.exit(1);
}
console.log('[record] webm written:', webmPath);

const mp4Out = path.resolve(ASSETS_DIR, `${outName}.mp4`);
console.log('[record] ffmpeg → mp4:', mp4Out);
// Optional 6th arg: speed factor (e.g. "2.0" plays 2× faster). Defaults
// to 1.0 (real time). When >1, applies setpts=1/N*PTS to compress the
// real-time recording into a watchable hero loop while still showing
// real activity beat-by-beat.
const SPEED = parseFloat(process.argv[6] || '1.0');
const ffmpegArgs = [
  '-y',
  '-ss', String(TRIM_START),
  '-i', webmPath,
  '-t', String(TRIM_SECONDS),
  '-c:v', 'libx264',
  '-preset', 'medium',
  '-crf', '22',
  '-pix_fmt', 'yuv420p',
  '-an',
  ...(SPEED !== 1.0 ? ['-vf', `setpts=${(1 / SPEED).toFixed(4)}*PTS`] : []),
  mp4Out,
];
execFileSync('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'inherit', 'inherit'] });

console.log('[record] done. Output:', mp4Out);
