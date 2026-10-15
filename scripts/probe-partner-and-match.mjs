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
  console.log('Navigating to Partners to ensure partner...');
  await goto(page, '/partners', { settle: 1500 });
  await dismissOverlays(page);

  // Verifica se precisa escolher dupla
  const hasPartner = await page.evaluate(async () => {
    const p = (await window.__PL_LOCAL_GAME_ENTITIES__?.PlayerProfile?.list?.(null, 1))?.[0];
    return Boolean(p?.partner_id);
  }).catch(() => false);

  console.log('Has partner?', hasPartner);

  // Se não tem dupla, escolhe a primeira disponível
  await page.evaluate(async () => {
    // Via UI: clica em Escolher Dupla se houver
    const btn = [...document.querySelectorAll('button')].find((x) => /Escolher Dupla|Buscar|Contratar/i.test(x.textContent || ''));
    if (btn) btn.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  // Clica no primeiro card de parceiro e confirma
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[class*="border"][class*="rounded"]')];
    const partnerCard = cards.find((c) => /Iniciante|Amador|OVR/i.test(c.textContent || '') && !c.querySelector('button'));
    if (partnerCard) partnerCard.click();
    const confirmBtn = [...document.querySelectorAll('button')].find((b) => /Confirmar|Escolher/i.test(b.textContent || ''));
    if (confirmBtn) confirmBtn.click();
  });
  await new Promise((r) => setTimeout(r, 1200));

  console.log('Navigating to Training Center match view...');
  await goto(page, '/game/training-center?view=match', { settle: 2000 });
  await dismissOverlays(page);

  // Clica em "Jogar partida treino"
  console.log('Clicking "Jogar partida treino"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Clica em "Iniciar Partida"
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
      bodySnippet: document.body.innerText.slice(0, 200),
    };
  });

  console.log('Live Match status:', liveMatchStatus);

  const shotPath = resolve(DIR, 'live-match-390-test.png');
  await page.screenshot({ path: shotPath });
  console.log('Screenshot saved to:', shotPath);
} finally {
  await browser.close();
}
