import { launch, newPage, goto } from './lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from './lib/auditSession.mjs';
import { mkdirSync } from 'node:fs';

const VP = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };

console.log('Launching browser for LiveMatch probe...');
const browser = await launch();
try {
  const page = await openCareer(browser, VP);
  console.log('Navigating to Training Center match view...');
  await goto(page, '/game/training-center?view=match');
  await dismissOverlays(page);
  
  console.log('Clicking "Jogar partida treino"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('Clicking "Iniciar Partida"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Iniciar Partida/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  const liveMatchFound = await page.evaluate(() => {
    const root = document.querySelector('[data-live-match]');
    const scoreboard = document.querySelector('[aria-label="Placar da partida"]');
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
    const btns = [...document.querySelectorAll('button')].map((b) => b.textContent.trim());
    return {
      hasLiveMatch: Boolean(root),
      hasScoreboard: Boolean(scoreboard),
      tabs,
      buttonSample: btns.slice(0, 15),
    };
  });

  console.log('Live Match status:', liveMatchFound);

  mkdirSync('reports/screenshots-520d', { recursive: true });
  await page.screenshot({ path: 'reports/screenshots-520d/probe-live-match-390.png' });
  console.log('Saved test screenshot to reports/screenshots-520d/probe-live-match-390.png');
} finally {
  await browser.close();
}
