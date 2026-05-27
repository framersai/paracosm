/**
 * Dedicated visual-only pass — scroll up from BOTTOM with screenshots at every step
 * for posterity. Focus on confrontation period (May 23-25).
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = `${process.env.HOME}/Documents/agentos-star-audit/scammers/dm-scrape/screenshots-confrontation`;
const PROFILE = `${process.env.HOME}/.agentos-evidence-chrome-profile`;
mkdirSync(OUT, { recursive: true });

const TARGET_DM = 'https://discord.com/channels/@me/1492963001756553357';
let n = 0;
async function shot(page, label) {
  n++;
  await page.screenshot({ path: join(OUT, `${String(n).padStart(4,'0')}-${label}.png`), fullPage: false });
}

async function dismissModals(page) {
  for (let i = 0; i < 3; i++) {
    const did = await page.evaluate(() => {
      const dlg = document.querySelector('[role="dialog"]');
      if (!dlg) return false;
      const ok = Array.from(dlg.querySelectorAll('button')).find(b => /^(okay|ok|got it|close|continue)$/i.test((b.textContent || '').trim()));
      if (ok) { ok.click(); return true; }
      return false;
    });
    if (!did) break;
    await page.waitForTimeout(300);
  }
}

async function expandShows(page) {
  for (let i = 0; i < 10; i++) {
    const did = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, span[role="button"], div[role="button"], h3, a'));
      const clicks = all.filter(el => {
        const t = (el.textContent || '').trim().toLowerCase();
        return t === 'show' || /^show\s+\d/.test(t) || /blocked.*show|show.*blocked/.test(t);
      });
      let did = false;
      for (const el of clicks) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && el.offsetParent !== null) { el.click(); did = true; }
      }
      return did;
    });
    if (!did) break;
    await page.waitForTimeout(250);
  }
}

async function main() {
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 1100 }, // taller viewport = more msgs per shot
    executablePath: '/Users/johnn/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto(TARGET_DM, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await dismissModals(page);
  await expandShows(page);
  
  // Force to bottom
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (sc) sc.scrollTop = sc.scrollHeight;
    });
    await page.waitForTimeout(300);
  }
  await dismissModals(page);
  await expandShows(page);
  await shot(page, 'bottom-most-recent');
  
  console.log('Scrolling UP with screenshot at every viewport...');
  for (let i = 0; i < 200; i++) {
    await dismissModals(page);
    await expandShows(page);
    await shot(page, `scroll-up-${String(i).padStart(3,'0')}`);
    
    const reachedTop = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return true;
      const before = sc.scrollTop;
      sc.scrollBy({ top: -700, behavior: 'instant' });
      return sc.scrollTop === 0 && before === 0;
    });
    await page.waitForTimeout(500);
    if (reachedTop) {
      console.log(`+ Reached top at iter ${i}`);
      await dismissModals(page);
      await expandShows(page);
      await shot(page, `top-of-conversation`);
      break;
    }
    if (i % 10 === 9) console.log(`  ${i+1} screenshots taken`);
  }
  
  // Final fullpage
  n++;
  await page.screenshot({ path: join(OUT, `${String(n).padStart(4,'0')}-FINAL-fullpage.png`), fullPage: true });
  
  console.log(`\n+ ${n} screenshots saved to ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
