import { launch, newPage, goto } from './lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from './lib/auditSession.mjs';

const VP = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };

console.log('Launching browser...');
const browser = await launch();
try {
  const page = await openCareer(browser, VP);
  console.log('Career open. Navigating to Training Center match view...');
  await goto(page, '/game/training-center?view=match');
  await dismissOverlays(page);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Page title / text snippet:', text.slice(0, 300));
} finally {
  await browser.close();
}
