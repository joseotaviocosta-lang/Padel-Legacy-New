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

  // Clica em "Jogar partida treino" para abrir o modal de seleção se não houver parceiro
  console.log('Clicking "Jogar partida treino"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1000));

  const modalTitle = await page.evaluate(() => document.querySelector('h2, [role="dialog"] h2, h3')?.textContent || '');
  console.log('Dialog opened:', modalTitle);

  // Se for "Escolha sua Dupla", seleciona o primeiro parceiro e confirma
  const isPartnerModal = await page.evaluate(() => /Escolha sua Dupla/i.test(document.body.innerText || ''));
  if (isPartnerModal) {
    console.log('Partner modal detected. Selecting partner item...');
    await page.evaluate(() => {
      // Procura botões de parceiro disponíveis dentro do modal
      const listButtons = [...document.querySelectorAll('button')].filter(b => 
        (b.textContent || '').includes('Iniciante') || (b.textContent || '').includes('Amador')
      );
      if (listButtons.length > 0) listButtons[0].click();
    });
    await new Promise((r) => setTimeout(r, 600));

    console.log('Clicking Confirm button...');
    const confirmed = await page.evaluate(() => {
      const confirmBtn = [...document.querySelectorAll('button')].find(b => /Confirmar/i.test(b.textContent || ''));
      if (confirmBtn && !confirmBtn.disabled) {
        confirmBtn.click();
        return true;
      }
      return false;
    });
    console.log('Confirm clicked:', confirmed);
    await new Promise((r) => setTimeout(r, 2000));

    // Agora clica em "Jogar partida treino" novamente
    console.log('Clicking "Jogar partida treino" after partner contract...');
    await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button')];
      const b = btns.find((x) => /Jogar partida treino/i.test(x.textContent || ''));
      if (b) b.click();
    });
    await new Promise((r) => setTimeout(r, 1500));
  }

  // Clica em "Iniciar Partida" no SimulationModal
  console.log('Clicking "Iniciar Partida"...');
  await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')];
    const b = btns.find((x) => /Iniciar Partida/i.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 2000));

  const status = await page.evaluate(() => {
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

  console.log('Status:', status);

  const shotPath = resolve(DIR, 'test-live-match-confirmed.png');
  await page.screenshot({ path: shotPath });
  console.log('Saved screenshot:', shotPath);
} finally {
  await browser.close();
}
