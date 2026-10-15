import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import {
  launch,
  newPage,
  openCareer,
  launchLiveMatch,
  advanceMatchPoints,
  togglePlayPause,
  switchMatchTab,
  VIEWPORTS_520D,
} from './lib/liveMatchHarness.mjs';

const DIR = resolve(process.cwd(), 'reports/screenshots-520d');
mkdirSync(DIR, { recursive: true });

async function takeShot(page, name) {
  const dest = resolve(DIR, `${name}.png`);
  await page.screenshot({ path: dest, fullPage: false });
  console.log(`Saved: ${name}.png (exists: ${existsSync(dest)})`);
}

console.log('Capturing all mandatory screenshots for 5.20-D in', DIR);

const browser = await launch();
try {
  // 1. Mobile 360x800
  console.log('\n--- 1. Viewport 360x800 ---');
  const page360 = await openCareer(browser, VIEWPORTS_520D[0]);
  await launchLiveMatch(page360, { startImmediate: true });
  await takeShot(page360, 'live-match-360-start');

  await advanceMatchPoints(page360, 3);
  await togglePlayPause(page360, 'pause');
  await takeShot(page360, 'live-match-360-running');
  await page360.close();

  // 2. Mobile 390x844
  console.log('\n--- 2. Viewport 390x844 ---');
  const page390 = await newPage(browser, VIEWPORTS_520D[1]);
  await launchLiveMatch(page390, { startImmediate: true });
  await advanceMatchPoints(page390, 4);
  await togglePlayPause(page390, 'pause');
  await takeShot(page390, 'live-match-390-running');

  await switchMatchTab(page390, 'tactics');
  await new Promise((r) => setTimeout(r, 400));
  await takeShot(page390, 'live-match-390-tactic');

  await switchMatchTab(page390, 'coach');
  await new Promise((r) => setTimeout(r, 400));
  await takeShot(page390, 'live-match-390-coach');
  await page390.close();

  // 3. Landscape 844x390
  console.log('\n--- 3. Viewport 844x390 ---');
  const page844 = await newPage(browser, VIEWPORTS_520D[2]);
  await launchLiveMatch(page844, { startImmediate: true });
  await advanceMatchPoints(page844, 3);
  await takeShot(page844, 'live-match-844x390-running');

  await togglePlayPause(page844, 'pause');
  await takeShot(page844, 'live-match-844x390-paused');
  await page844.close();

  // 4. Laptop 1366x768
  console.log('\n--- 4. Viewport 1366x768 ---');
  const page1366 = await newPage(browser, VIEWPORTS_520D[3]);
  await launchLiveMatch(page1366, { startImmediate: true });
  await advanceMatchPoints(page1366, 4);
  await togglePlayPause(page1366, 'pause');
  await takeShot(page1366, 'live-match-1366-running');
  await page1366.close();

  // 5. Desktop 1920x1080
  console.log('\n--- 5. Viewport 1920x1080 ---');
  const page1920 = await newPage(browser, VIEWPORTS_520D[4]);
  await launchLiveMatch(page1920, { startImmediate: true });
  await advanceMatchPoints(page1920, 4);
  await togglePlayPause(page1920, 'pause');
  await takeShot(page1920, 'live-match-1920-running');
  await page1920.close();

  console.log('\nAll 5.20-D screenshots generated and verified!');
} finally {
  await browser.close();
}
