// Fase 5.30 — auditoria da Home (Centro da carreira) no app desktop real
// (Tauri/WebView2 via puppeteer-core, porta 9223), em 360/390/desktop/
// paisagem, para o ESTADO da carreira ativa (rótulo --state).
//
// Medições por largura: overflow, elementos fora da tela, botões estourados
// (mesmo critério da 5.28/5.29) + altura útil:
//  - headerBottom: fim do header fixo;
//  - firstPrimaryY: topo do primeiro CTA primário visível;
//  - commitmentY: topo do bloco de próximo compromisso / "o que fazer agora";
//  - blocks: blocos de primeiro nível da página (filhos do PageContent);
//  - pageHeight: altura total do conteúdo.
//
// Uso: node scripts/ui-audit-530.mjs --phase=before|after --state=<rótulo>
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const PHASE = args.phase || 'before';
const STATE = args.state || 'default';
const OUT = `reports/ui-redesign-530/${PHASE}`;
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.connect({ browserURL: 'http://127.0.0.1:9223', defaultViewport: null });
const page = (await browser.pages()).find((p) => p.url().includes('5174'));
const cdp = await page.createCDPSession();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));

const VIEWPORTS = [
  { key: '360', width: 360, height: 780, mobile: true },
  { key: '390', width: 390, height: 844, mobile: true },
  { key: 'desktop', width: 1280, height: 800, mobile: false },
  { key: 'landscape', width: 780, height: 360, mobile: true },
];

async function measure() {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const inHScroll = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    const label = (el) => `${el.tagName.toLowerCase()}:"${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 50)}"`;
    const offscreen = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!visible(el) || el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !inHScroll(el) && getComputedStyle(el).position !== 'fixed') offscreen.push({ el: label(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
    const controls = [...document.querySelectorAll('button, a[role=button], [role=tab]')].filter(visible);
    const clipped = controls.filter((b) => !inHScroll(b) && !(b.querySelector('[class*="-top-"], [class*="-right-"]') && b.scrollWidth - b.clientWidth <= 6) && (b.scrollWidth > b.clientWidth + 2 || b.getBoundingClientRect().right > vw + 1)).map(label);
    const header = [...document.querySelectorAll('header, [data-app-header]')].filter((h) => getComputedStyle(h).position === 'fixed' || getComputedStyle(h).position === 'sticky').map((h) => h.getBoundingClientRect().bottom);
    const headerBottom = Math.round(Math.max(0, ...header));
    const content = document.querySelector('.pl-page .pl-content-enter') || document.querySelector('.pl-page');
    const blocks = content ? [...content.children].filter(visible) : [];
    const primaries = [...document.querySelectorAll('main .pl-game-primary, main a.bg-primary, main button.bg-primary')].filter(visible).filter((el) => !el.closest('[data-app-modal]'));
    const firstPrimary = primaries.map((el) => el.getBoundingClientRect().top + window.scrollY).sort((a, b) => a - b)[0];
    const commitmentEl = document.querySelector('[data-home-next-commitment]') || [...document.querySelectorAll('main h2, main h3, main p')].find((e) => /O que fazer agora|Compromisso da Semana|Planejamento da Semana/i.test(e.innerText || ''));
    const commitmentY = commitmentEl ? Math.round(commitmentEl.getBoundingClientRect().top + window.scrollY) : null;
    const primaryLabels = primaries.map((el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40));
    return {
      vw, vh: window.innerHeight, docOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
      offscreenCount: offscreen.length, offscreen: offscreen.slice(0, 10), clippedCount: clipped.length, clipped: clipped.slice(0, 10),
      headerBottom, firstPrimaryY: firstPrimary == null ? null : Math.round(firstPrimary), commitmentY,
      blocks: blocks.length, primaryCount: primaries.length, primaryLabels,
      pageHeight: Math.round(document.documentElement.scrollHeight),
    };
  });
}

async function goHome() {
  await page.evaluate(() => { history.pushState({}, '', '/game'); dispatchEvent(new PopStateEvent('popstate')); });
  await sleep(3500);
}

const results = [];
for (const v of VIEWPORTS) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.mobile ? 2 : 1, mobile: v.mobile });
  await sleep(600);
  await goHome();
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(400);
  const m = await measure();
  const base = `${OUT}/home-${STATE}-${v.key}`;
  await page.screenshot({ path: `${base}.png` });
  if (v.key !== 'landscape') await page.screenshot({ path: `${base}-full.png`, fullPage: true });
  results.push({ state: STATE, viewport: v.key, ...m, file: `${base}.png` });
  console.log(`${v.key.padEnd(9)} ${STATE.padEnd(12)} overflow=${m.docOverflowPx} offscreen=${m.offscreenCount} clipped=${m.clippedCount} blocks=${m.blocks} primaries=${m.primaryCount} firstPrimaryY=${m.firstPrimaryY} commitmentY=${m.commitmentY} pageH=${m.pageHeight}`);
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
const file = `${OUT}/measurements.json`;
const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { results: [], errors: [] };
prev.results = prev.results.filter((r) => r.state !== STATE).concat(results);
prev.errors = [...(prev.errors || []), ...errors.map((e) => `${STATE}: ${e}`)];
prev.phase = PHASE; prev.updatedAt = new Date().toISOString();
writeFileSync(file, JSON.stringify(prev, null, 2));
console.log(`errors: ${errors.length}`);
browser.disconnect();
