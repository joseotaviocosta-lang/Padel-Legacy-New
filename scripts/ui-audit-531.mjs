// Fase 5.31 — auditoria de Dupla / Parceiro / Staff no app desktop real
// (Tauri/WebView2 via puppeteer-core, porta 9223), em 360/390/desktop/
// paisagem, para o ESTADO da carreira ativa (rótulo --state).
//
// Só LEITURA e navegação: abre abas, abre/fecha detalhes. Nunca toca em
// Aceitar/Recusar/Contratar/Demitir/Renovar/Encerrar.
//
// Medições por tela (mesmo critério da 5.28–5.30):
//  - overflow do documento, elementos fora da tela, botões estourados;
//  - blocks: blocos de primeiro nível do PageContent;
//  - primaryCount: CTAs primários na página (fora de modal);
//  - modalPrimaryCount / modalClipped: idem dentro do modal aberto;
//  - firstActionY: topo da primeira ação útil (botão/aba de conteúdo);
//  - pageHeight / modalScrollHeight;
//  - erros de JS.
//
// Uso: node scripts/ui-audit-531.mjs --phase=before|after --state=<rótulo> [--only=a,b]
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const PHASE = args.phase || 'before';
const STATE = args.state || 'default';
const ONLY = args.only ? new Set(String(args.only).split(',')) : null;
const OUT = `reports/ui-redesign-531/${PHASE}`;
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

const go = async (path) => {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(3200);
  await page.evaluate(() => window.scrollTo(0, 0));
  await sleep(300);
};
// Clique real (mouse) no primeiro controle visível cujo texto casa com `re`,
// restrito a `scope` (CSS) quando dado. Nunca clica em ações que gravam.
const FORBIDDEN = /aceitar|recusar|contratar treinador|confirmar|demitir|renovar 12|encerrar|rescis|convidar|melhorar por|arquivar/i;
async function tap(re, scope = 'main') {
  const box = await page.evaluate((src, sc, forbidden) => {
    const rx = new RegExp(src, 'i'); const fx = new RegExp(forbidden, 'i');
    const root = document.querySelector(sc) || document;
    const el = [...root.querySelectorAll('button, a, [role=tab]')].filter((e) => e.getClientRects().length && !e.disabled)
      .find((e) => rx.test((e.innerText || e.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ')));
    if (!el) return null;
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
    if (fx.test(text)) return { refused: text };
    el.setAttribute('data-audit-target', '1');
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
    return { text };
  }, re.source, scope, FORBIDDEN.source);
  if (!box || box.refused) return box;
  // O app usa scroll suave: a posição só vale depois de o scroll assentar.
  await sleep(700);
  Object.assign(box, await page.evaluate(() => { const el = document.querySelector('[data-audit-target]'); el.removeAttribute('data-audit-target'); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }));
  await page.mouse.click(box.x, box.y);
  await sleep(1500);
  return box;
}
const closeModal = async () => { await page.keyboard.press('Escape'); await sleep(800); };

const SCREENS = [
  { key: 'partner-overview', path: '/partners?view=overview' },
  { key: 'partner-market', path: '/partners?view=offers', ready: /Escolha sua dupla|propostas|Recebidas/i },
  { key: 'partner-search', path: '/partners?view=search', ready: /Buscar atleta|Compatibilidade/i },
  { key: 'partner-contract', path: '/partners?view=contract', ready: /contrato/i },
  { key: 'partner-offer-detail', path: '/partners?view=offers', ready: /Analisar/i, open: async () => tap(/^(analisar|analisar proposta|ver proposta)/) },
  { key: 'coach', path: '/career/team?tab=coach', ready: /Ver detalhes|Técnico/i },
  { key: 'coach-detail', path: '/career/team?tab=coach', ready: /Ver detalhes/i, open: async () => tap(/^(ver detalhes|detalhes)$/) },
  { key: 'staff', path: '/career/team?tab=staff', ready: /comiss/i },
  { key: 'staff-market', path: '/career/team?tab=staff', ready: /Mercado/i, open: async () => tap(/^(mercado mensal|mercado)$/), inPage: true },
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
    const isClipped = (b) => !inHScroll(b) && !(b.querySelector('[class*="-top-"], [class*="-right-"]') && b.scrollWidth - b.clientWidth <= 6) && (b.scrollWidth > b.clientWidth + 2 || b.getBoundingClientRect().right > vw + 1);
    const modal = [...document.querySelectorAll('[data-app-modal], [role=dialog]')].filter(visible)[0] || null;
    const clipped = controls.filter((b) => !modal || !modal.contains(b)).filter(isClipped).map(label);
    const modalClipped = modal ? controls.filter((b) => modal.contains(b)).filter(isClipped).map(label) : [];
    const content = document.querySelector('.pl-page .pl-content-enter') || document.querySelector('.pl-page');
    const blocks = content ? [...content.children].filter(visible) : [];
    const primarySel = '.pl-game-primary, a.bg-primary, button.bg-primary';
    const primaries = [...document.querySelectorAll(`main ${primarySel.split(', ').join(', main ')}`)].filter(visible).filter((el) => !modal || !modal.contains(el));
    const modalPrimaries = modal ? [...modal.querySelectorAll(primarySel)].filter(visible) : [];
    const actions = [...document.querySelectorAll('main button, main a')].filter(visible).filter((el) => !el.closest('header') && !el.closest('[role=tablist]') && !el.closest('nav'));
    const firstActionY = actions.map((el) => el.getBoundingClientRect().top + window.scrollY).sort((a, b) => a - b)[0];
    const scroller = modal ? [modal, ...modal.querySelectorAll('*')].find((el) => el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) : null;
    const textOf = (el) => (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return {
      vw, vh: window.innerHeight, docOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw),
      offscreenCount: offscreen.length, offscreen: offscreen.slice(0, 8),
      clippedCount: clipped.length, clipped: clipped.slice(0, 8),
      modalOpen: Boolean(modal), modalClippedCount: modalClipped.length, modalClipped: modalClipped.slice(0, 8),
      modalPrimaryCount: modalPrimaries.length, modalPrimaryLabels: modalPrimaries.map(textOf),
      modalScrollHeight: scroller ? Math.round(scroller.scrollHeight) : (modal ? Math.round(modal.getBoundingClientRect().height) : null),
      blocks: blocks.length, primaryCount: primaries.length, primaryLabels: primaries.map(textOf),
      firstActionY: firstActionY == null ? null : Math.round(firstActionY),
      pageHeight: Math.round(document.documentElement.scrollHeight),
    };
  });
}

const results = [];
for (const v of VIEWPORTS) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.mobile ? 2 : 1, mobile: v.mobile });
  await sleep(600);
  for (const s of SCREENS) {
    if (ONLY && !ONLY.has(s.key)) continue;
    await go(s.path);
    if (s.ready) await page.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('main')?.innerText || ''), { timeout: 20000 }, s.ready.source).catch(() => {});
    await sleep(400);
    let opened = null;
    if (s.open) {
      opened = await s.open();
      if (!opened || opened.refused) { console.log(`${v.key.padEnd(9)} ${s.key.padEnd(22)} sem alvo para abrir (${JSON.stringify(opened)})`); results.push({ state: STATE, viewport: v.key, screen: s.key, skipped: true, opened }); continue; }
      if (s.inPage) await page.evaluate(() => window.scrollTo(0, 0));
      await sleep(500);
    }
    const m = await measure();
    const base = `${OUT}/${s.key}-${STATE}-${v.key}`;
    await page.screenshot({ path: `${base}.png` });
    if ((v.key === '390' || v.key === '360') && !m.modalOpen) await page.screenshot({ path: `${base}-full.png`, fullPage: true });
    results.push({ state: STATE, viewport: v.key, screen: s.key, opened: opened?.text || null, ...m, file: `${base}.png` });
    console.log(`${v.key.padEnd(9)} ${s.key.padEnd(22)} ovf=${m.docOverflowPx} off=${m.offscreenCount} clip=${m.clippedCount}/${m.modalClippedCount} blocks=${m.blocks} prim=${m.primaryCount}${m.modalOpen ? `+modal${m.modalPrimaryCount}` : ''} act=${m.firstActionY} h=${m.pageHeight}${m.modalOpen ? ` modalH=${m.modalScrollHeight}` : ''}`);
    if (m.modalOpen) await closeModal();
  }
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
const file = `${OUT}/measurements.json`;
const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { results: [], errors: [] };
prev.results = prev.results.filter((r) => r.state !== STATE || (ONLY && !ONLY.has(r.screen))).concat(results);
prev.errors = [...(prev.errors || []).filter((e) => !e.startsWith(`${STATE}:`)), ...errors.map((e) => `${STATE}: ${e}`)];
prev.phase = PHASE; prev.updatedAt = new Date().toISOString();
writeFileSync(file, JSON.stringify(prev, null, 2));
console.log(`errors: ${errors.length}`);
browser.disconnect();
