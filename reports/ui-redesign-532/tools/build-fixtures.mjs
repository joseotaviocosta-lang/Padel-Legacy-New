// Fase 5.32-A — fixtures DERIVADOS para que antes/depois fotografem os
// mesmos dados. Tudo acontece na cópia em memória do Chrome temporário
// (session.mjs); os saves da LOCAL-8A não são alterados.
//
//   t5-com-dupla : save da temporada 5 (LOCAL-8A) → aceita a 1ª proposta
//                  recebida pela UI → avança ~40 dias pelo botão "Avançar"
//                  (Race com pontos reais da temporada).
//   carreira-nova: carreira criada pela UI (sem ranking, sem dupla).
//
// Uso: node reports/ui-redesign-532/tools/build-fixtures.mjs [t5|nova]
import { mkdirSync, writeFileSync } from 'node:fs';
import { openSession, spa, sleep, dismissOverlays } from './session.mjs';

const OUT = 'reports/ui-redesign-532/fixtures';
mkdirSync(OUT, { recursive: true });
const which = process.argv[2] || 't5';
const SAVE5 = { url: '/reports/local-8a-career-audit/run10/save-season-5.json', careerId: 'bd83ba91-e824-4539-ae0c-97afc1ffa7be' };

async function advanceDays(page, days) {
  for (let i = 0; i < days; i += 1) {
    await dismissOverlays(page);
    const clicked = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^Avançar/.test(x.innerText.trim()) && x.getClientRects().length && !x.disabled);
      if (!b) return false; b.click(); return true;
    });
    if (!clicked) { console.log('sem botão Avançar no dia', i); await spa(page, '/game', 3000); continue; }
    await sleep(1500);
    await page.waitForFunction(() => ![...document.querySelectorAll('button')].some((x) => /Avançando|Simulando/i.test(x.innerText)), { timeout: 300000 }).catch(() => null);
    await sleep(1200);
    // Torneio do jogador: o app pode abrir partida/modal — sai pela Home.
    if (!/\/game$/.test(new URL(page.url()).pathname)) await spa(page, '/game', 2500);
    if (i % 5 === 4) console.log('dia', i + 1, await page.evaluate(() => (document.body.innerText.match(/(SEG|TER|QUA|QUI|SEX|SÁB|DOM) \d\d\/\d\d/) || [''])[0]));
  }
}

async function exportActive(page, file) {
  const json = await page.evaluate(async () => {
    const { CareerManager } = await import('/src/careers/CareerManager.js');
    const manager = new CareerManager();
    await manager.initialize();
    const id = await manager.getLastCareer();
    return JSON.stringify(await manager.exportCareer(id));
  });
  writeFileSync(file, json);
  console.log('fixture', file, json.length, 'bytes');
}

if (which === 't5') {
  const { browser, page } = await openSession({ save: SAVE5 });
  await spa(page, '/partners?view=offers', 5000);
  const name = await page.evaluate(() => document.querySelector('[data-partner-candidate="offer"] h3')?.innerText.trim());
  await page.evaluate(() => [...document.querySelectorAll('main button')].find((x) => /Analisar proposta/i.test(x.innerText))?.click());
  await sleep(1500);
  await page.evaluate(() => [...document.querySelectorAll('[role=dialog] button')].find((b) => /aceitar proposta/i.test(b.innerText))?.click());
  await sleep(4000);
  await dismissOverlays(page);
  await spa(page, '/game', 4000);
  console.log('parceiro aceito:', name, '→', await page.evaluate(() => (document.body.innerText.match(/DUPLA\s+([^\n]+)/) || [''])[0]));
  await advanceDays(page, Number(process.env.PL532_DAYS || 20));
  console.log('errors', page.__errors);
  await exportActive(page, `${OUT}/t5-com-dupla.json`);
  await browser.close();
} else {
  const { browser, page } = await openSession();
  await sleep(3000);
  console.log(await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 200)));
  await exportActive(page, `${OUT}/carreira-nova.json`);
  await browser.close();
}
