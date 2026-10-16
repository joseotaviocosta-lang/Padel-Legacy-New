// Hotfix 5.31-B — auditoria de CONTENÇÃO no app desktop real (Tauri/
// WebView2 via puppeteer-core, porta 9223), em 360/390/desktop/paisagem.
// Só leitura e navegação (abas/filtros/selects; nunca ações que gravam).
//
// Por grupo horizontal (abas, sub-abas, filtros da inbox, selects):
//  - gutter: o grupo começa/termina dentro da margem da página (≥ 8px da
//    borda da tela) — nada "cortado pela borda";
//  - scrolls: o grupo rola na horizontal (scrollWidth > clientWidth);
//  - endReachable: rolado até o fim, o ÚLTIMO item fica inteiro dentro do
//    contêiner (com folga), sem metade cortada;
//  - wrappedChips: chip/aba com texto quebrado em 2 linhas;
//  - activeVisible: o item ativo está inteiro dentro do contêiner.
// Card de técnico: nome truncado (scrollWidth > clientWidth), badges
// colidindo com nome/OVR, OVR com largura previsível.
//
// Uso: node audit.mjs --phase=before|after --state=<rótulo>
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true]; }));
const PHASE = args.phase || 'before';
const STATE = args.state || 'default';
const OUT = `reports/ui-hotfix-531b/${PHASE}`;
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
const go = async (path, ready) => {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  if (ready) await page.waitForFunction((src) => new RegExp(src, 'i').test(document.querySelector('main')?.innerText || ''), { timeout: 20000 }, ready.source).catch(() => {});
  await sleep(1800);
  await page.evaluate(() => window.scrollTo(0, 0));
};

const SCREENS = [
  { key: 'partner-overview', path: '/partners?view=overview', ready: /Sua dupla|Sem parceiro/ },
  { key: 'partner-received', path: '/partners?view=offers', ready: /Recebidas/ },
  { key: 'partner-search', path: '/partners?view=search', ready: /Ordenar/ },
  { key: 'partner-inbox', path: '/partners?view=inbox', ready: /Todas/ },
  { key: 'partner-inbox-last', path: '/partners?view=inbox', ready: /Todas/, lastInboxFilter: true },
  { key: 'coach', path: '/career/team?tab=coach', ready: /Ver detalhes/ },
  { key: 'staff', path: '/career/team?tab=staff', ready: /Sua comissão/ },
];

async function measure() {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const GUTTER = 8;
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
    const label = (el) => (el.innerText || el.getAttribute('aria-label') || el.value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    const inHScroll = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    // Grupos horizontais: listas de abas e linhas de filtros/selects dentro do main.
    const groups = [
      ...[...document.querySelectorAll('main [role=tablist]')].map((el) => ({ kind: 'tabs', el })),
      ...[...document.querySelectorAll('main [data-inbox-filters]')].map((el) => ({ kind: 'inbox-filters', el })),
      // Linha de filtros antiga da inbox (antes do hotfix não tinha marcador).
      ...[...document.querySelectorAll('main div.overflow-x-auto')].filter((el) => !el.matches('[role=tablist], [data-inbox-filters]') && el.querySelector('button')).map((el) => ({ kind: 'inbox-filters', el })),
      ...[...document.querySelectorAll('main [data-partner-search-selects], main select')].filter((el, i, all) => el.tagName !== 'SELECT' || !all.some((g) => g !== el && g.contains?.(el))).map((el) => ({ kind: el.tagName === 'SELECT' ? 'select' : 'selects', el })),
    ].filter(({ el }) => visible(el));
    const result = groups.map(({ kind, el }) => {
      const r = el.getBoundingClientRect();
      const items = [...el.querySelectorAll(':scope > button, :scope > [role=tab], :scope > select, :scope > label, :scope > * > select')].filter(visible);
      const cs = getComputedStyle(el);
      const scrolls = el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX);
      // Chip/aba com texto quebrado: só botões/abas (o <label> dos selects tem legenda + select por desenho).
      const wrappedChips = items.filter((it) => (it.tagName === 'BUTTON' || it.getAttribute('role') === 'tab') && it.getBoundingClientRect().height > 56).map(label);
      const active = items.find((it) => it.getAttribute('data-state') === 'active' || it.getAttribute('aria-pressed') === 'true' || it.getAttribute('aria-selected') === 'true' || /bg-primary(\s|$)/.test(it.className));
      const within = (it) => { const ir = it.getBoundingClientRect(); return ir.left >= r.left - 1 && ir.right <= r.right + 1; };
      // Fim alcançável: rola até o fim e mede o último item.
      let endReachable = true; let endGap = null;
      if (scrolls && items.length) {
        const prev = el.scrollLeft; el.scrollLeft = el.scrollWidth;
        const last = items[items.length - 1].getBoundingClientRect();
        endGap = Math.round(r.right - last.right);
        endReachable = last.right <= r.right - 2 && last.left >= r.left;
        el.scrollLeft = prev;
      }
      const selectsOut = kind.startsWith('select') ? [...el.querySelectorAll('select'), ...(el.tagName === 'SELECT' ? [el] : [])].filter((s) => { const sr = s.getBoundingClientRect(); return sr.left < GUTTER - 1 || sr.right > vw - GUTTER + 1; }).map((s) => label(s)) : [];
      // Item cortado na borda NO ESTADO INICIAL (sem rolar): fora do contêiner
      // e sem rolagem possível = inacessível; rolável = ok.
      const clippedNoScroll = scrolls ? [] : items.filter((it) => !within(it)).map(label);
      return {
        kind, label: label(el).slice(0, 60), left: Math.round(r.left), right: Math.round(r.right),
        insideGutter: r.left >= GUTTER - 1 && r.right <= vw - GUTTER + 1,
        scrolls, endReachable, endGap, wrappedChips, clippedNoScroll, selectsOut,
        activeVisible: active ? within(active) : null, items: items.length,
      };
    });
    // Card de técnico: nome vs badges vs OVR.
    const coachCards = [...document.querySelectorAll('[data-coach-card]')].filter(visible).slice(0, 8).map((card) => {
      const name = card.querySelector('h3');
      const badges = [...card.querySelectorAll('span.rounded-full')].filter((b) => /recomendado|custo/i.test(b.innerText));
      const ovr = [...card.querySelectorAll('p')].find((p) => /^\d{1,3}$/.test(p.innerText.trim()));
      const nr = name.getBoundingClientRect(); const or = ovr?.getBoundingClientRect();
      const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      return {
        name: name.innerText.trim(), nameTruncated: name.scrollWidth > name.clientWidth + 1, nameWidth: Math.round(nr.width),
        badges: badges.map((b) => b.innerText.trim()),
        badgeOverlapsOvr: badges.some((b) => overlap(b.getBoundingClientRect(), or)),
        badgeOverlapsName: badges.some((b) => overlap(b.getBoundingClientRect(), nr)),
        badgeClipped: badges.some((b) => b.scrollWidth > b.clientWidth + 1),
        ovr: ovr?.innerText.trim() || null, ovrWidth: or ? Math.round(or.width) : null,
        cardHeight: Math.round(card.getBoundingClientRect().height),
      };
    });
    const controls = [...document.querySelectorAll('button, a[role=button], [role=tab], select')].filter(visible);
    const clipped = controls.filter((b) => !inHScroll(b) && b.tagName !== 'SELECT' && (b.scrollWidth > b.clientWidth + 2 || b.getBoundingClientRect().right > vw + 1)).map(label);
    const offscreen = [];
    for (const el of document.querySelectorAll('main *')) {
      if (!visible(el) || el.closest('svg')) continue;
      const r = el.getBoundingClientRect();
      if ((r.right > vw + 1 || r.left < -1) && !inHScroll(el) && getComputedStyle(el).position !== 'fixed') offscreen.push(label(el) || el.tagName);
    }
    return { vw, docOverflowPx: Math.max(0, document.documentElement.scrollWidth - vw), offscreenCount: offscreen.length, offscreen: offscreen.slice(0, 6), clippedCount: clipped.length, clipped: clipped.slice(0, 6), groups: result, coachCards };
  });
}

const results = [];
for (const v of VIEWPORTS) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: v.width, height: v.height, deviceScaleFactor: v.mobile ? 2 : 1, mobile: v.mobile });
  await sleep(500);
  for (const s of SCREENS) {
    await go(s.path, s.ready);
    if (s.lastInboxFilter) {
      // Seleciona o ÚLTIMO filtro da inbox (clique real) e confere que ele fica visível.
      const box = await page.evaluate(() => {
        const row = document.querySelector('main [data-inbox-filters]') || [...document.querySelectorAll('main div.overflow-x-auto')].find((el) => /Todas/.test(el.innerText));
        const last = row && [...row.querySelectorAll('button')].pop();
        if (!last) return null;
        last.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
        const r = last.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: last.innerText };
      });
      if (box) { await sleep(400); await page.mouse.click(box.x, box.y); await sleep(900); }
    }
    const m = await measure();
    const base = `${OUT}/${s.key}-${STATE}-${v.key}`;
    await page.screenshot({ path: `${base}.png` });
    results.push({ state: STATE, viewport: v.key, screen: s.key, ...m, file: `${base}.png` });
    const bad = m.groups.filter((g) => !g.insideGutter || !g.endReachable || g.wrappedChips.length || g.clippedNoScroll.length || g.selectsOut.length || g.activeVisible === false);
    const names = m.coachCards.filter((c) => c.nameTruncated || c.badgeOverlapsOvr || c.badgeOverlapsName);
    console.log(`${v.key.padEnd(9)} ${s.key.padEnd(20)} ovf=${m.docOverflowPx} off=${m.offscreenCount} clip=${m.clippedCount} groups=${m.groups.length} badGroups=${bad.length}${bad.length ? ' ' + JSON.stringify(bad.map((g) => ({ k: g.kind, l: g.label.slice(0, 24), gut: g.insideGutter, end: g.endReachable, gap: g.endGap, wrap: g.wrappedChips, sel: g.selectsOut, act: g.activeVisible }))) : ''}${m.coachCards.length ? ` coach=${m.coachCards.length} nameIssues=${names.length}${names.length ? ' ' + JSON.stringify(names.map((c) => [c.name, c.badges.join('+'), c.nameWidth])) : ''}` : ''}`);
  }
}
await cdp.send('Emulation.clearDeviceMetricsOverride');
const file = `${OUT}/measurements.json`;
const prev = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { results: [], errors: [] };
prev.results = prev.results.filter((r) => r.state !== STATE).concat(results);
prev.errors = [...(prev.errors || []).filter((e) => !e.startsWith(`${STATE}:`)), ...errors.map((e) => `${STATE}: ${e}`)];
prev.phase = PHASE; prev.updatedAt = new Date().toISOString();
writeFileSync(file, JSON.stringify(prev, null, 2));
console.log(`errors: ${errors.length}`);
browser.disconnect();
