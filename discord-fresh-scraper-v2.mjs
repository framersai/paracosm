/**
 * v2 — focused: assumes user is already logged in (persistent profile preserved).
 * Goes straight to DM, clicks any "X blocked message(s) - Show" links, scrolls + extracts.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = `${process.env.HOME}/Documents/agentos-star-audit/scammers/dm-scrape`;
const PROFILE = `${process.env.HOME}/.agentos-evidence-chrome-profile`;
mkdirSync(`${OUT}/screenshots`, { recursive: true });

const TARGET_DM = 'https://discord.com/channels/@me/1492963001756553357';
let shotCount = 0;
async function shot(page, label) {
  shotCount++;
  const fname = `v2-${String(shotCount).padStart(3,'0')}-${label}.png`;
  await page.screenshot({ path: join(OUT, 'screenshots', fname), fullPage: false });
  console.log(`  [shot ${shotCount}] ${fname}`);
}

async function expandBlockedMessages(page) {
  // Discord shows: "N blocked messages" then "Show" / "Show messages" link
  // We click ALL such expand links repeatedly until none remain.
  let totalExpanded = 0;
  for (let pass = 0; pass < 50; pass++) {
    const expanded = await page.evaluate(() => {
      // Find any clickable element that contains "blocked" + "show" or "messages"
      const candidates = Array.from(document.querySelectorAll('button, a, span[role="button"], div[role="button"]'));
      const matchers = candidates.filter(el => {
        const t = (el.textContent || '').toLowerCase();
        return (t.includes('blocked') && (t.includes('show') || t.includes('message'))) ||
               t === 'show messages' || t === 'show' || t.match(/^show\s+\d+/) ||
               (t.includes('blocked') && el.offsetParent !== null);
      });
      const clicked = [];
      for (const el of matchers) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          el.click();
          clicked.push((el.textContent || '').slice(0, 100));
        }
      }
      return clicked;
    });
    if (expanded.length === 0) {
      if (pass === 0) console.log(`  (no "blocked message" expand links found on first pass)`);
      break;
    }
    console.log(`  expanded ${expanded.length} blocked-message link(s): ${expanded.join(' | ').slice(0,200)}`);
    totalExpanded += expanded.length;
    await page.waitForTimeout(700);
  }
  return totalExpanded;
}

async function main() {
  console.log(`Reconnecting to persistent profile (should auto-login)...`);
  const ctx = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    viewport: { width: 1400, height: 900 },
    executablePath: '/Users/johnn/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  
  console.log(`Going straight to DM: ${TARGET_DM}`);
  await page.goto(TARGET_DM, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await shot(page, 'dm-initial');
  
  // Verify we're actually in the DM (not bumped to login)
  const url = page.url();
  console.log(`Current URL: ${url}`);
  if (url.includes('/login')) {
    console.log(`! Not logged in — please log in in the window, then I'll wait...`);
    for (let i = 0; i < 600; i++) {
      if (page.url().includes('/channels/')) break;
      await page.waitForTimeout(1000);
    }
    await page.goto(TARGET_DM, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await shot(page, 'dm-after-login');
  }
  
  console.log(`\nPass 1: Click any "X blocked messages — Show" expand links visible now...`);
  await expandBlockedMessages(page);
  await page.waitForTimeout(1500);
  await shot(page, 'after-initial-expand');
  
  console.log(`\nScroll to TOP of conversation to load all history...`);
  let prevHeight = 0;
  let stableCount = 0;
  for (let i = 0; i < 400; i++) {
    const result = await page.evaluate(() => {
      const scroller = document.querySelector('main [class*="scroller"]') 
                    || document.querySelector('[data-list-id="chat-messages"]')
                    || document.querySelector('[class*="messagesWrapper"] [class*="scroller"]');
      if (!scroller) return { ok: false };
      scroller.scrollTop = 0;
      return { ok: true, scrollTop: scroller.scrollTop, scrollHeight: scroller.scrollHeight };
    });
    if (!result.ok) { console.log(`  no scroller at iter ${i}`); break; }
    await page.waitForTimeout(700);
    
    // Re-click any blocked-message expanders that appeared during scroll
    if (i % 5 === 4) await expandBlockedMessages(page);
    
    if (i % 20 === 19) await shot(page, `scroll-top-${i}`);
    
    if (result.scrollTop === 0 && result.scrollHeight === prevHeight) {
      stableCount++;
      if (stableCount >= 4) {
        console.log(`+ Hit top after ${i+1} scrolls`);
        break;
      }
    } else {
      stableCount = 0;
    }
    prevHeight = result.scrollHeight;
    if (i % 10 === 9) console.log(`  scroll ${i+1}, scrollHeight=${result.scrollHeight}`);
  }
  
  console.log(`\nFinal pass: expand any remaining blocked-message links across full conversation`);
  await expandBlockedMessages(page);
  await page.waitForTimeout(2000);
  await shot(page, 'final-top-all-expanded');
  
  console.log(`\nScroll DOWN with chunked screenshots for full visual record...`);
  for (let i = 0; i < 50; i++) {
    await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (sc) sc.scrollBy({ top: 700, behavior: 'instant' });
    });
    await page.waitForTimeout(450);
    // Try expanding again — sometimes blocked-msg links only render in viewport
    if (i % 3 === 2) await expandBlockedMessages(page);
    await shot(page, `down-${String(i).padStart(2,'0')}`);
    const atBottom = await page.evaluate(() => {
      const sc = document.querySelector('main [class*="scroller"]') || document.querySelector('[data-list-id="chat-messages"]');
      if (!sc) return true;
      return Math.abs(sc.scrollHeight - sc.clientHeight - sc.scrollTop) < 30;
    });
    if (atBottom) {
      console.log(`+ Reached bottom`);
      break;
    }
  }
  
  shotCount++;
  await page.screenshot({ path: join(OUT, 'screenshots', `v2-${String(shotCount).padStart(3,'0')}-final-fullpage.png`), fullPage: true });
  console.log(`  [fullshot ${shotCount}] final fullpage`);
  
  console.log(`\nExtracting all messages from DOM...`);
  const messages = await page.evaluate(() => {
    const items = document.querySelectorAll('[id^="chat-messages-"], li[class*="messageListItem"], [data-list-item-id^="chat-messages"]');
    return Array.from(items).map((el) => {
      const timeEl = el.querySelector('time');
      const authorEl = el.querySelector('[class*="username"]') || el.querySelector('h3 span');
      const contentEl = el.querySelector('[id^="message-content"]') || el.querySelector('[class*="messageContent"]');
      const attachments = [
        ...Array.from(el.querySelectorAll('a[href*="cdn.discordapp.com"]')).map(a => a.href),
        ...Array.from(el.querySelectorAll('img[src*="cdn.discordapp.com"]')).map(a => a.src),
        ...Array.from(el.querySelectorAll('video source, video')).map(a => a.src || a.querySelector('source')?.src).filter(Boolean),
      ];
      return {
        id: el.id || el.getAttribute('data-list-item-id') || null,
        timestamp_iso: timeEl?.getAttribute('datetime') || null,
        timestamp_display: timeEl?.textContent || null,
        author: authorEl?.textContent?.trim() || null,
        content: contentEl?.innerText?.trim() || contentEl?.textContent?.trim() || null,
        attachments: [...new Set(attachments)],
      };
    }).filter(m => m.content || m.attachments.length);
  });
  
  console.log(`Extracted ${messages.length} messages`);
  
  writeFileSync(join(OUT, 'dm-messages.json'), JSON.stringify(messages, null, 2));
  writeFileSync(join(OUT, 'dm-messages.txt'),
    messages.map(m => 
      `[${m.timestamp_iso || m.timestamp_display || '?'}] ${m.author || '?'}: ${m.content || '(media only)'}` +
      (m.attachments.length ? '\n  ATTACHMENTS:\n    ' + m.attachments.join('\n    ') : '')
    ).join('\n\n')
  );
  writeFileSync(join(OUT, 'dm-page.html'), await page.content());
  
  console.log(`\n+ Complete.`);
  console.log(`  ${OUT}/dm-messages.json (${messages.length} messages)`);
  console.log(`  ${OUT}/dm-messages.txt`);
  console.log(`  ${OUT}/dm-page.html`);
  console.log(`  ${OUT}/screenshots/v2-*.png (${shotCount} screenshots)`);
  console.log(`\nKeeping browser open. Close it manually when done.`);
}

main().catch(e => { console.error(e); process.exit(1); });
