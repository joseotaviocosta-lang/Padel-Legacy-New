// Fase 5.29 (derivado do ui-audit-528) — auditoria visual no app desktop real (Tauri/WebView2 dirigido
// por puppeteer-core, porta 9223). Para cada tela × largura (360, 390,
// 1280 e paisagem 780×360): screenshot + medição de overflow.
//
// Medições por tela:
//  - docOverflowPx: scrollWidth do documento além da largura da viewport;
//  - offscreen: elementos visíveis cujo retângulo sai da viewport (fora de
//    contêineres com rolagem horizontal intencional);
//  - clippedControls: botões/links cujo conteúdo é mais largo que a caixa
//    (texto estourando o botão);
//  - buttonHeights: alturas distintas de botões visíveis (padronização).
//
// Uso: node scripts/ui-audit-528.mjs --phase=before|after [--only=coach,...]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const PHASE = args.phase || 'before';
const OUT = `reports/ui-redesign-529/${PHASE}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('5174'));
if (!page) throw new Error('app não encontrado na porta 5174');
const cdp = await page.createCDPSession();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

const VIEWPORTS = [
  { key: '360', width: 360, height: 780, mobile: true },
  { key: '390', width: 390, height: 844, mobile: true },
  { key: 'desktop', width: 1280, height: 800, mobile: false },
  { key: 'landscape', width: 780, height: 360, mobile: true },
];
async function setViewport(v) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.mobile ? 2 : 1, mobile: v.mobile });
  await sleep(700);
}
async function nav(path) {
  await page.evaluate((p) => { window.history.pushState({}, '', p); window.dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(2600);
}
async function clickText(re) {
  const ok = await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('button, a, [role=button], [role=tab]')].filter((b) => b.getClientRects().length).find((b) => rx.test((b.innerText || b.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    return false;
  }, re.source);
  await sleep(1800);
  return ok;
}
async function closeModal() { await page.evaluate(() => { document.querySelector('[data-app-modal] .pl-modal-close, [data-app-modal] [aria-label="Fechar"]')?.click(); }); await sleep(700); }

async function measure() {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const inHScroll = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const label = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}.${String(el.className || '').split(' ').slice(0, 3).join('.')}:"${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
    const offscreen = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !inHScroll(el) && getComputedStyle(el).position !== 'fixed') offscreen.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
    const controls = [...document.querySelectorAll('button, a[role=button], [role=tab]')].filter(visible);
    // Selo de notificação (badge que sobra do sino por desenho) e abas dentro de faixas com rolagem horizontal intencional não contam.
    const clipped = controls.filter((b) => !inHScroll(b) && !(b.querySelector('[class*="-top-"], [class*="-right-"]') && b.scrollWidth - b.clientWidth <= 6) && (b.scrollWidth > b.clientWidth + 2 || b.getBoundingClientRect().right > vw + 1)).map((b) => ({ el: label(b), scrollW: b.scrollWidth, clientW: b.clientWidth }));
    const heights = {};
    for (const b of controls.filter((b) => (b.innerText || '').trim().length > 2)) { const h = Math.round(b.getBoundingClientRect().height); heights[h] = (heights[h] || 0) + 1; }
    const primaries = controls.filter((b) => /pl-game-primary|bg-primary(?!\/)/.test(String(b.className))).length;
    return { vw, docOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw), offscreen: offscreen.slice(0, 25), offscreenCount: offscreen.length, clippedControls: clipped.slice(0, 20), clippedCount: clipped.length, buttonHeights: heights, primaryButtons: primaries, buttons: controls.length };
  });
}

// Telas da 5.29: Torneios e Centro de Treinamento em vários estados.
async function scrollToText(re) {
  await page.evaluate((src) => {
    const rx = new RegExp(src, 'i');
    const el = [...document.querySelectorAll('h1,h2,h3,p,button,[role=tab]')].find((e) => e.getClientRects().length && rx.test((e.innerText || '').trim()));
    if (el) { const y = el.getBoundingClientRect().top + window.scrollY - 140; window.scrollTo(0, Math.max(0, y)); document.querySelector('main')?.scrollTo?.(0, Math.max(0, y)); }
  }, re.source);
  await sleep(800);
}
const SCREENS = [
  { id: 'tournaments-top', go: () => nav('/tournaments') },
  { id: 'tournaments-list', go: async () => { await nav('/tournaments'); await scrollToText(/^(fevereiro|janeiro|março)/); }, keepScroll: true },
  { id: 'tournaments-past', go: async () => { await nav('/tournaments'); return clickText(/^passados$/); } },
  { id: 'tournament-details', go: async () => { await nav('/tournaments'); await sleep(1500); return clickText(/^(ver detalhes|detalhes)$/); }, modal: true },
  { id: 'tournaments-stats', go: async () => { await nav('/tournaments'); return clickText(/^estatísticas$/); } },
  { id: 'training-top', go: () => nav('/game/training-center?view=training') },
  { id: 'training-cards', go: async () => { await nav('/game/training-center?view=training'); await scrollToText(/^(treino de quadra|golpes de fundo)/); }, keepScroll: true },
  { id: 'training-expanded', go: async () => { await nav('/game/training-center?view=training'); await sleep(1200); await page.evaluate(() => document.querySelector('[aria-label="Ver mais detalhes"]')?.click()); await sleep(800); await scrollToText(/^intensidade$/); }, keepScroll: true },
  { id: 'training-match', go: () => nav('/game/training-center?view=match') },
  { id: 'training-agenda', go: () => nav('/game/training-center?view=agenda') },
  { id: 'training-progress', go: () => nav('/game/training-center?view=progress') },
  { id: 'training-center', go: () => nav('/game/training-center?view=center') },
];
const only = args.only ? new Set(String(args.only).split(',')) : null;
const results = [];
for (const v of VIEWPORTS) {
  await setViewport(v);
  for (const s of SCREENS) {
    if (only && !only.has(s.id)) continue;
    const reached = await s.go();
    if (!s.keepScroll) await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    const m = await measure();
    const file = `${OUT}/${s.id}-${v.key}.png`;
    await page.screenshot({ path: file });
    results.push({ screen: s.id, viewport: v.key, reached: reached !== false, url: await page.evaluate(() => location.pathname + location.search), file, ...m });
    console.log(`${v.key.padEnd(9)} ${s.id.padEnd(20)} overflow=${m.docOverflowPx} offscreen=${m.offscreenCount} clipped=${m.clippedCount} heights=${JSON.stringify(m.buttonHeights)}`);
    if (s.modal) await closeModal();
  }
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
writeFileSync(`${OUT}/measurements.json`, JSON.stringify({ phase: PHASE, createdAt: new Date().toISOString(), errors, results }, null, 2));
console.log(`errors: ${errors.length}`);
browser.disconnect();
