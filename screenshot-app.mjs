/**
 * Comma — Visual Snapshot Script
 * 
 * Run BEFORE and AFTER UI changes to capture comparison screenshots.
 * 
 * Usage:
 *   npx playwright test screenshot-app.mjs --headed
 * 
 * Or run directly:
 *   node screenshot-app.mjs before
 *   node screenshot-app.mjs after
 * 
 * Screenshots saved to: ./comma-screenshots/{before|after}/
 */

import { chromium } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

// === CONFIGURATION ===
const APP_URL = process.env.COMMA_URL || 'https://app.getcomma.com.au';
const LABEL = process.argv[2] || 'before'; // 'before' or 'after'
const OUTPUT_DIR = join(process.cwd(), 'comma-screenshots', LABEL);

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 390, height: 844 },
];

// Tabs to capture — update these if tab IDs change
const TABS = [
  'overview',
  'goals',
  'networth',
  'committed',
  'categories',
  'health',
  'subscriptions',
  'savings',
  'insights',
  'deepdive',
  'trend',
  'heatmap',
  'search',
  'settings',
];

// === HELPERS ===
function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// === MAIN ===
async function run() {
  console.log(`\n📸 Comma Screenshot Capture`);
  console.log(`   Label:  ${LABEL}`);
  console.log(`   URL:    ${APP_URL}`);
  console.log(`   Output: ${OUTPUT_DIR}\n`);

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    const vpDir = join(OUTPUT_DIR, vp.name);
    ensureDir(vpDir);

    console.log(`\n🖥  Viewport: ${vp.name} (${vp.width}x${vp.height})`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2, // Retina quality
    });
    const page = await context.newPage();

    // Load the app and set it up with demo data
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await sleep(2000);

    // --- Screenshot 1: Onboarding modal (if visible) ---
    const onboardingVisible = await page.evaluate(() => {
      return !localStorage.getItem('comma_onboarded');
    });

    if (onboardingVisible) {
      await page.screenshot({
        path: join(vpDir, '00-onboarding-modal.png'),
        fullPage: false,
      });
      console.log(`   ✅ 00-onboarding-modal`);

      // Dismiss modal by clicking "Explore with demo data"
      try {
        const demoBtn = await page.locator('button', { hasText: /demo/i }).first();
        await demoBtn.click({ timeout: 3000 });
        await sleep(1500);
      } catch {
        // If no demo button, try setting the flag manually
        await page.evaluate(() => {
          localStorage.setItem('comma_onboarded', 'true');
        });
        await page.reload({ waitUntil: 'networkidle' });
        await sleep(1500);
      }
    } else {
      console.log(`   ⏭  Onboarding already dismissed`);
    }

    // --- Screenshot 2: Reveal moment (skip — only shows on first upload) ---

    // --- Screenshot each tab ---
    for (const tabId of TABS) {
      try {
        // Try clicking the tab via the sidebar, tab bar, or bottom nav
        const clicked = await page.evaluate((id) => {
          // Method 1: Find a nav element or button with data-tab or matching onClick
          const allButtons = document.querySelectorAll('button, [role="tab"], a, div[onClick]');
          for (const el of allButtons) {
            const text = el.textContent?.toLowerCase().trim();
            const dataTab = el.getAttribute('data-tab');
            if (dataTab === id) {
              el.click();
              return true;
            }
          }
          return false;
        }, tabId);

        if (!clicked) {
          // Method 2: Directly set tab state via React internals or URL
          await page.evaluate((id) => {
            // Try to find setTab in the React fiber tree — fallback to manual dispatch
            const root = document.getElementById('root');
            if (root && root._reactRootContainer) {
              // Can't easily access React state, try dispatching a custom event
            }
            // Fallback: look for any clickable element containing the tab name
            const tabNames = {
              overview: 'overview',
              goals: 'goals',
              networth: 'net worth',
              committed: 'committed',
              categories: 'categories',
              health: 'health',
              subscriptions: 'subscriptions',
              savings: 'savings',
              insights: 'insights',
              deepdive: 'deep dive',
              trend: 'trend',
              heatmap: 'heatmap',
              search: 'search',
              settings: 'settings',
            };
            const searchText = tabNames[id] || id;
            const elements = document.querySelectorAll('button, [role="tab"], div, span, a');
            for (const el of elements) {
              if (
                el.textContent?.toLowerCase().trim() === searchText &&
                (el.tagName === 'BUTTON' || el.onclick || el.style.cursor === 'pointer')
              ) {
                el.click();
                return;
              }
            }
          }, tabId);
        }

        await sleep(1200); // Wait for tab content and animations

        // Scroll to top
        await page.evaluate(() => window.scrollTo(0, 0));
        await sleep(300);

        // Take screenshot
        await page.screenshot({
          path: join(vpDir, `${TABS.indexOf(tabId) + 1}-${tabId}.png`),
          fullPage: false,
        });
        console.log(`   ✅ ${TABS.indexOf(tabId) + 1}-${tabId}`);

        // Also take a full-page screenshot for longer tabs
        const pageHeight = await page.evaluate(() => document.body.scrollHeight);
        if (pageHeight > vp.height + 200) {
          await page.screenshot({
            path: join(vpDir, `${TABS.indexOf(tabId) + 1}-${tabId}-full.png`),
            fullPage: true,
          });
          console.log(`   ✅ ${TABS.indexOf(tabId) + 1}-${tabId}-full (scrollable)`);
        }
      } catch (err) {
        console.log(`   ❌ ${tabId}: ${err.message}`);
      }
    }

    await context.close();
  }

  await browser.close();

  console.log(`\n✅ Done! Screenshots saved to: ${OUTPUT_DIR}`);
  console.log(`\nNext steps:`);
  if (LABEL === 'before') {
    console.log(`  1. Run your 9C prompts in Claude Code`);
    console.log(`  2. Push to Vercel`);
    console.log(`  3. Run: node screenshot-app.mjs after`);
  } else {
    console.log(`  Compare: comma-screenshots/before/ vs comma-screenshots/after/`);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
