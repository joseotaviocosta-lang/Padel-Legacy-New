import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { launch, openCareer, launchLiveMatch, VIEWPORTS_520D } from './lib/liveMatchHarness.mjs';

const browser = await launch();
try {
  const page = await openCareer(browser, VIEWPORTS_520D[0]);
  await launchLiveMatch(page, { startImmediate: true });
  
  const dest = resolve(process.cwd(), 'reports/screenshots-520d/live-match-360-start.png');
  console.log('Writing screenshot to:', dest);
  const buffer = await page.screenshot({ path: dest, fullPage: false });
  console.log('Buffer length:', buffer?.length);
  console.log('File exists on disk?', existsSync(dest));
} finally {
  await browser.close();
}
