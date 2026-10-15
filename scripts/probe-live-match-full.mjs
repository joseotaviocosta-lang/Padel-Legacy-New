import { launch, newPage, goto } from './lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from './lib/auditSession.mjs';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const VP = { id: '390', label: 'Mobile 390x844', width: 390, height: 844, mobile: true };
const DIR = resolve(process.cwd(), 'reports/screenshots-520d');
mkdirSync(DIR, { recursive: true });

console.log('Launching browser...');
const browser = await launch();
try {
  const page = await openCareer(browser, VP);
  console.log('Navigating to Training Center match view...');
  await goto(page, '/game/training-center?view=match', { settle: 2000 });
  await dismissOverlays(page);

  console.log('Clicking "Jogar partida treino"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Se o modal "Escolha sua Dupla" abriu:
  const hasPartnerModal = await page.evaluate(() => /Escolha sua Dupla/i.test(document.body.innerText || ''));
  console.log('Partner selection modal open?', hasPartnerModal);

  if (hasPartnerModal) {
    console.log('Selecting first partner...');
    await page.evaluate(() => {
      const partnerBtns = [...document.querySelectorAll('button')].filter(b => /Iniciante|Amador/i.test(b.textContent || '') && !b.textContent.includes('Confirmar'));
      if (partnerBtns.length > 0) partnerBtns[0].click();
    });
    await new Promise((r) => setTimeout(r, 500));

    console.log('Confirming partner...');
    await page.evaluate(() => {
      const confirmBtn = [...document.querySelectorAll('button')].find(b => /Confirmar/i.test(b.textContent || ''));
      if (confirmBtn) confirmBtn.click();
    });
    await new Promise((r) => setTimeout(r, 1500));

    // Agora clica em "Jogar partida treino" novamente
    console.log('Clicking "Jogar partida treino" after partner confirmed...');
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Clica em "Iniciar Partida" no SimulationModal
  console.log('Clicking "Iniciar Partida"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Iniciar Partida/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  const liveMatchStatus = await page.evaluate(() => {
    const root = document.querySelector('[data-live-match]');
    const sb = document.querySelector('[aria-label="Placar da partida"]');
    const tabs = [...document.querySelectorAll('[role="tab"]')].map((t) => t.textContent.trim());
    return {
      hasLiveMatch: Boolean(root),
      hasScoreboard: Boolean(sb),
      tabs,
      bodySnippet: document.body.innerText.slice(0, 300),
    };
  });

  console.log('Live Match status:', liveMatchStatus);

  const shotPath = resolve(DIR, 'live-match-390-running.png');
  await page.screenshot({ path: shotPath });
  console.log('Screenshot saved to:', shotPath);
} finally {
  await browser.close();
}
