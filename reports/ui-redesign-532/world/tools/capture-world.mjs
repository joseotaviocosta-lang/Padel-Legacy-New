// Fase 5.32-B — captura + medição de Mundo (/world) em estados reais e 6
// viewports. Uso: node capture-world.mjs before|after [estado...]
//
// Estados (todos carregados na cópia em memória — ../../tools/session.mjs;
// nenhum save do usuário ou da LOCAL-8A é alterado):
//   carreira-nova : carreira criada pela UI (fixture da 5.32-A);
//   t1            : save da temporada 1 da LOCAL-8A (carreira intermediária);
//   t5-com-dupla  : fixture da 5.32-A (jogador com dupla, ~40 dias jogados);
//   t10           : save da temporada 10 da LOCAL-8A (carreira avançada).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { openSession, spa, sleep, setViewport } from '../../tools/session.mjs';

const PHASE = process.argv[2] || 'before';
const OUT = `reports/ui-redesign-532/world/${PHASE}`;

const SAVES = 'reports/local-8a-career-audit/run10';
export const WORLD_STATES = {
  'carreira-nova': { url: '/reports/ui-redesign-532/fixtures/carreira-nova.json', file: 'reports/ui-redesign-532/fixtures/carreira-nova.json' },
  t1: { url: `/${SAVES}/save-season-1.json`, file: `${SAVES}/save-season-1.json` },
  't5-com-dupla': { url: '/reports/ui-redesign-532/fixtures/t5-com-dupla.json', file: 'reports/ui-redesign-532/fixtures/t5-com-dupla.json' },
  t10: { url: `/${SAVES}/save-season-10.json`, file: `${SAVES}/save-season-10.json` },
};
export function careerIdOf(state) {
  const head = readFileSync(state.file, 'utf8').slice(0, 4000);
  return head.match(/"career_id":"([^"]+)"/)[1];
}

export const measureWorld = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const main = document.querySelector('main') || document.body;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const scrollsX = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const offenders = [];
  for (const el of main.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if ((r.right > vw + 1 || r.left < -1) && !scrollsX(el)) offenders.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
  }
  const buttons = [...main.querySelectorAll('button, a, [role=tab]')].filter(visible);
  const cutButtons = buttons.filter((b) => { const r = b.getBoundingClientRect(); return (r.right > vw + 1 || r.left < -1) && !scrollsX(b); }).length
    + buttons.filter((b) => b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible' && !b.querySelector('.truncate')).length;
  const content = main.querySelector('.pl-content-enter');
  const blocks = content ? [...content.children].filter(visible).map((el) => ({
    y: Math.round(el.getBoundingClientRect().top + window.scrollY),
    h: Math.round(el.getBoundingClientRect().height),
    text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 70),
  })) : [];
  const cards = [...main.querySelectorAll('*')].filter((el) => {
    if (!visible(el)) return false;
    const c = String(el.className || '');
    return /\bborder\b/.test(c) && /rounded-(xl|2xl)/.test(c) && el.getBoundingClientRect().height >= 40 && el.tagName !== 'BUTTON' && el.tagName !== 'A';
  }).length;
  const filterControls = [...main.querySelectorAll('[role=tab], select, [data-world-filter]')].filter(visible).length;
  const dominant = [...main.querySelectorAll('button, a')].filter((el) => visible(el) && /\bbg-primary\b/.test(String(el.className))).length;
  const sticky = [...document.querySelectorAll('header, nav')].filter(visible).map((el) => Math.round(el.getBoundingClientRect().height));
  return {
    viewport: `${vw}x${vh}`,
    pageHeight: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - vw,
    offenders: offenders.slice(0, 8), offenderCount: offenders.length, cutButtons,
    blockCount: blocks.length, blocks, cards, filterControls, dominantActions: dominant,
    blocksInFold: blocks.filter((b) => b.y < vh).length,
    chromeHeights: sticky,
    text: main.innerText.replace(/\s+/g, ' ').slice(0, 900),
  };
});

// Tempo até a página ficar pronta (SPA: pushState → conteúdo montado).
export async function timedOpen(page, path, readySelector) {
  await page.evaluate(() => { window.__t0 = performance.now(); });
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (el && !window.__t1) window.__t1 = performance.now();
    return Boolean(el);
  }, { timeout: 120000, polling: 16 }, readySelector).catch(() => null);
  const ms = await page.evaluate(() => { const v = (window.__t1 || performance.now()) - window.__t0; window.__t1 = 0; return Math.round(v); });
  await sleep(1500);
  return ms;
}

if (process.argv[1] && process.argv[1].endsWith('capture-world.mjs')) {
  mkdirSync(`${OUT}/sections`, { recursive: true });
  const READY = PHASE === 'before' ? '.pl-content-enter' : '[data-world-ready]';
  const requested = process.argv.slice(3);
  const stateIds = requested.length ? requested : Object.keys(WORLD_STATES);
  const result = existsSync(`${OUT}/measurements.json`) ? JSON.parse(readFileSync(`${OUT}/measurements.json`, 'utf8')) : {};
  for (const stateId of stateIds) {
    const state = WORLD_STATES[stateId];
    if (!existsSync(state.file)) { console.log('sem fixture', stateId); continue; }
    const { browser, page } = await openSession({ save: { url: state.url, careerId: careerIdOf(state) } });
    result[stateId] = {};
    // Tempo de abertura: 6 aberturas a 390 (Home → Mundo); a 1ª é a fria.
    await setViewport(page, 390);
    const times = [];
    for (let i = 0; i < 6; i += 1) {
      await spa(page, '/game', 2500);
      times.push(await timedOpen(page, '/world', READY));
    }
    result[stateId].openMs = times;
    const vpIds = (process.env.PL532_VPS || '390,360,768,desktop,1600,landscape').split(',');
    for (const vpId of vpIds) {
      await setViewport(page, vpId);
      const before = page.__errors.length;
      await spa(page, '/world', 4000);
      await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);
      const m = await measureWorld(page);
      m.jsErrors = page.__errors.slice(before);
      result[stateId][vpId] = m;
      await page.screenshot({ path: `${OUT}/${stateId}--world-${vpId}.png` });
      if (vpId === '390' || vpId === 'desktop') await page.screenshot({ path: `${OUT}/${stateId}--world-${vpId}-full.png`, fullPage: true });
      // Recortes por seção (destaque, líderes — atletas e duplas —, eventos,
      // notícias, explorar) para o relatório.
      if (PHASE === 'after' && (vpId === '390' || vpId === 'desktop')) {
        for (const block of ['hero', 'leaders', 'events', 'news', 'explore']) {
          const el = await page.$(`[data-world-block="${block}"]`);
          if (el) await el.screenshot({ path: `${OUT}/sections/${stateId}--${block}-${vpId}.png` }).catch(() => null);
        }
      }
      console.log(stateId, vpId, `h=${m.pageHeight} ovf=${m.overflowX} cut=${m.cutButtons} blocks=${m.blockCount} fold=${m.blocksInFold} cards=${m.cards} filters=${m.filterControls} cta=${m.dominantActions} err=${m.jsErrors.length}`);
    }
    console.log(stateId, 'openMs', times);
    await browser.close();
  }
  writeFileSync(`${OUT}/measurements.json`, JSON.stringify(result, null, 2));
  console.log('ok', Object.keys(result));
}
