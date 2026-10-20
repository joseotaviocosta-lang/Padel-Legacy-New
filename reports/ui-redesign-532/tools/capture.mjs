// Fase 5.32-A — captura + medição das 4 views do Ranking em 3 estados reais
// e 4 viewports. Uso: node capture.mjs before|after [estado...]
//
// Estados (todos carregados na cópia em memória — session.mjs):
//   t5-sem-dupla : save da temporada 5 da LOCAL-8A como está (#303, sem dupla,
//                  Race do ano ainda não começou);
//   t5-com-dupla : fixture derivado (dupla aceita pela UI + ~40 dias jogados);
//   carreira-nova: carreira criada pela UI (sem ranking, sem dupla).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { openSession, spa, sleep, setViewport, VIEWPORTS } from './session.mjs';

const PHASE = process.argv[2] || 'before';
const OUT = `reports/ui-redesign-532/${PHASE}`;
mkdirSync(OUT, { recursive: true });

const STATES = {
  't5-sem-dupla': { url: '/reports/local-8a-career-audit/run10/save-season-5.json', careerId: 'bd83ba91-e824-4539-ae0c-97afc1ffa7be' },
  't5-race-sem-dupla': { url: '/reports/ui-redesign-532/fixtures/t5-race-sem-dupla.json', file: 'reports/ui-redesign-532/fixtures/t5-race-sem-dupla.json' },
  't5-com-dupla': { url: '/reports/ui-redesign-532/fixtures/t5-com-dupla.json', file: 'reports/ui-redesign-532/fixtures/t5-com-dupla.json' },
  'carreira-nova': { url: '/reports/ui-redesign-532/fixtures/carreira-nova.json', file: 'reports/ui-redesign-532/fixtures/carreira-nova.json' },
};
const VIEWS = [
  { id: 'mundial-individual', path: '/ranking?scope=world&type=individual' },
  { id: 'mundial-duplas', path: '/ranking?scope=world&type=doubles' },
  { id: 'race-individual', path: '/ranking?scope=race&type=individual' },
  { id: 'race-duplas', path: '/ranking?scope=race&type=doubles' },
];
const requested = process.argv.slice(3);
const stateIds = requested.length ? requested : Object.keys(STATES);

function careerIdOf(state) {
  if (state.careerId) return state.careerId;
  // O arquivo é grande: o career_id está no começo do JSON.
  const head = readFileSync(state.file, 'utf8').slice(0, 4000);
  return head.match(/"career_id":"([^"]+)"/)[1];
}

const measure = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const main = document.querySelector('main') || document.body;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const scrollsX = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const clippedBy = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(hidden|clip)/.test(s.overflowX)) { const pr = p.getBoundingClientRect(); const r = el.getBoundingClientRect(); if (r.right > pr.right + 1 || r.left < pr.left - 1) return true; } } return false; };
  const offenders = [];
  for (const el of main.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !scrollsX(el)) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
  }
  const buttons = [...main.querySelectorAll('button, a, [role=tab]')].filter(visible);
  const cutButtons = buttons.filter((b) => { const r = b.getBoundingClientRect(); return (r.right > vw + 1 || r.left < -1) && !scrollsX(b); }).length
    + buttons.filter((b) => clippedBy(b) || b.scrollWidth > b.clientWidth + 2).length;
  const textY = (re) => { const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT); let n; while ((n = walker.nextNode())) { if (re.test(n.textContent) && n.parentElement && visible(n.parentElement)) return Math.round(n.parentElement.getBoundingClientRect().top + window.scrollY); } return null; };
  const hero = document.querySelector('[data-ranking-hero]');
  const heroY = hero ? Math.round(hero.getBoundingClientRect().top + window.scrollY) : textY(/^(Sua posição mundial|Sua dupla|Sua temporada|Sua dupla na Race|Sem dupla ativa)/);
  const rows = [...main.querySelectorAll('.pl-compact-row, [data-ranking-row]')].filter(visible);
  const firstRowY = rows.length ? Math.round(rows[0].getBoundingClientRect().top + window.scrollY) : null;
  const rowHeights = rows.slice(0, 10).map((r) => Math.round(r.getBoundingClientRect().height));
  const rowsInFold = rows.filter((r) => r.getBoundingClientRect().top + window.scrollY < window.innerHeight).length;
  const heroText = (hero?.innerText || '').replace(/\s+/g, ' ').slice(0, 260);
  return {
    viewport: `${vw}x${window.innerHeight}`,
    pageHeight: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - vw,
    offenders: offenders.slice(0, 8), offenderCount: offenders.length, cutButtons,
    heroY, firstRowY, rowsInFold, rowHeights,
    heroText,
    zeroPtsPodium: /(^|\s)0 pts/.test((main.querySelector('[data-ranking-podium]')?.innerText || '')),
    text: main.innerText.replace(/\s+/g, ' ').slice(0, 700),
  };
});

const result = existsSync(`${OUT}/measurements.json`) ? JSON.parse(readFileSync(`${OUT}/measurements.json`, 'utf8')) : {};
for (const stateId of stateIds) {
  const state = STATES[stateId];
  if (state.file && !existsSync(state.file)) { console.log('sem fixture', stateId); continue; }
  const { browser, page } = await openSession({ save: { url: state.url, careerId: careerIdOf(state) } });
  result[stateId] = {};
  const vpIds = (process.env.PL532_VPS || '390,360,desktop,landscape').split(',');
  for (const vpId of vpIds) {
    await setViewport(page, vpId);
    for (const view of VIEWS) {
      const before = page.__errors.length;
      await spa(page, view.path, 3500);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(400);
      const m = await measure(page);
      m.jsErrors = page.__errors.slice(before);
      result[stateId][`${view.id}@${vpId}`] = m;
      await page.screenshot({ path: `${OUT}/${stateId}--${view.id}-${vpId}.png` });
      if (vpId === '390') await page.screenshot({ path: `${OUT}/${stateId}--${view.id}-390-full.png`, fullPage: true });
      console.log(stateId, view.id, vpId, `h=${m.pageHeight} ovf=${m.overflowX} cut=${m.cutButtons} hero=${m.heroY} row1=${m.firstRowY} err=${m.jsErrors.length}`);
    }
  }
  await browser.close();
}
writeFileSync(`${OUT}/measurements.json`, JSON.stringify(result, null, 2));
console.log('ok', Object.keys(result));
void VIEWPORTS;
