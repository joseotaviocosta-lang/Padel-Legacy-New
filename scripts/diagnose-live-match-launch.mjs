import { launch, openCareer } from './lib/auditSession.mjs';
import { launchLiveMatch, measureLiveMatch } from './lib/liveMatchHarness.mjs';

const VP = { id: '360', label: 'Mobile 360x800', width: 360, height: 800, mobile: true };

async function run() {
  const browser = await launch();
  try {
    const page = await openCareer(browser, VP);
    console.log('1. Opened career, URL:', page.url());

    const ok = await launchLiveMatch(page, { startImmediate: true });
    console.log('2. launchLiveMatch returned:', ok);

    const m = await measureLiveMatch(page);
    console.log('3. measureLiveMatch:', m);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);

