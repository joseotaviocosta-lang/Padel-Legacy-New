// LOCAL-8F — sonda: o botão "Avançar" conclui o dia no navegador depois da
// ativação da carreira? Registra datas, erros e textos visíveis.
// Uso: node reports/local-8f-lifecycle-persistence/tools/advance-probe.mjs <cenário>
import { readFileSync } from 'node:fs';
import { openSession, sleep, setViewport, dismissOverlays } from '../../ui-redesign-532/tools/session.mjs';
import { SCENARIOS } from '../../local-8d-navigation-persistence-audit/tools/route-audit.mjs';

const id = process.argv[2] || 't5-com-dupla';
const file = SCENARIOS[id];
const careerId = readFileSync(file, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
const { browser, page } = await openSession({ save: { url: `/${file}`, careerId } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (/erro|error|falh|Inicializa|Avan|bloque/i.test(t)) logs.push(`${m.type()}: ${t.slice(0, 200)}`); });
const date = () => page.evaluate(async () => { const { activeCareerAdapter } = await import('/src/gameplay/services/runtime.js'); return (await activeCareerAdapter.getActiveCareer({ fresh: false })).player.career_date; });
try {
  await setViewport(page, 'desktop');
  await page.evaluate(() => { history.pushState({}, '', '/game'); dispatchEvent(new PopStateEvent('popstate')); });
  await sleep(6000); await dismissOverlays(page);
  const before = await date();
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => /Avan/i.test(b.innerText)).map((b) => `${b.innerText.trim().slice(0, 40)}|disabled=${b.disabled}|visible=${b.getClientRects().length > 0}`));
  console.log('antes', before, JSON.stringify(buttons));
  const clicked = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Avançar/i.test(x.innerText.trim()) && x.getClientRects().length && !x.disabled); if (!b) return false; b.click(); return true; });
  console.log('clicou', clicked);
  for (let i = 0; i < Number(process.env.PROBE_STEPS || 24); i += 1) {
    await sleep(5000);
    const d = await date();
    const busy = await page.evaluate(() => [...document.querySelectorAll('button,[role=dialog],[role=alertdialog]')].filter((x) => /Avançando|Simulando|Processando|Confirmar|Continuar/i.test(x.innerText)).map((x) => x.innerText.trim().slice(0, 80)));
    console.log(`t+${(i + 1) * 5}s data=${d} ${JSON.stringify(busy).slice(0, 300)}`);
    if (d !== before && !busy.some((x) => /Avançando|Simulando/i.test(x))) break;
    if (process.env.PROBE_CONTINUE && i === 1) console.log('continuar', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /^Continuar/i.test(x.innerText.trim()) && x.getClientRects().length); if (!b) return false; b.click(); return true; }));
  }
  console.log('logs', JSON.stringify(logs.slice(-15), null, 1));
  console.log('erros', JSON.stringify(page.__errors || []).slice(0, 800));
} finally { await browser.close(); }
