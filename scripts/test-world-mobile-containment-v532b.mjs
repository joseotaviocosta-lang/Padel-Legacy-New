// Fase 5.32-B — Mundo no navegador real (Chrome instalado + dev server).
// Estados: carreira NOVA criada pela UI num perfil temporário e, se o save
// existir localmente, a temporada 10 da LOCAL-8A carregada em memória
// (reports/ui-redesign-532/tools/session.mjs — nada toca nos saves).
// Mede, em 360/390/768/1366/1600/paisagem:
//   - 0 overflow horizontal, 0 elemento fora da tela, 0 controle cortado;
//   - hierarquia: cabeçalho → destaque → líderes → eventos → notícias →
//     explorar, nessa ordem vertical;
//   - primeira dobra com conteúdo esportivo (destaque + líderes);
//   - 0 erro de JS.
// E a navegação: cartões de líderes, CTA do destaque, linha de evento,
// atalhos, áreas de notícias, voltar do navegador e recarregar.
// Requer o dev server (npm run dev, 127.0.0.1:5174).
// Uso: node scripts/test-world-mobile-containment-v532b.mjs
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { launch, goto, BASE } from './lib/visualAuditDriver.mjs';
import { openCareer, dismissOverlays } from './lib/auditSession.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const up = await fetch(BASE).then((r) => r.ok).catch(() => false);
assert.ok(up, `dev server indisponível em ${BASE} (rode npm run dev)`);

const VIEWPORTS = [
  { id: '360', width: 360, height: 800, mobile: true },
  { id: '390', width: 390, height: 844, mobile: true },
  { id: 'landscape', width: 844, height: 390, mobile: true },
  { id: '768', width: 768, height: 1024, mobile: true },
  { id: '1366', width: 1366, height: 768 },
  { id: '1600', width: 1600, height: 900 },
];
const ORDER = ['header', 'hero', 'leaders', 'events', 'news', 'explore'];

let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const spa = async (page, path, settle = 2500) => {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(settle);
};
const ready = (page) => page.waitForSelector('[data-world-ready]', { timeout: 60000 }).then(() => sleep(400));
const path = (page) => page.evaluate(() => `${location.pathname}${location.search}`);
// Modal aberto: o app trata o próximo popstate como "voltar" para fechá-lo
// (overlayBackStack) — fecha com Escape, como o jogador faria.
// Fechar o modal desfaz a entrada de histórico dele (history.back
// assíncrono): espera a URL parar de mudar antes de seguir.
const closeDialogs = async (page) => {
  let closed = false;
  for (let i = 0; i < 3 && (await page.$('[role=dialog]')); i += 1) { await page.keyboard.press('Escape'); await sleep(600); closed = true; }
  if (!closed) return;
  let last = await path(page);
  for (let i = 0; i < 10; i += 1) { await sleep(300); const now = await path(page); if (now === last) break; last = now; }
  await sleep(500);
};

const measure = (page) => page.evaluate((order) => {
  const vw = window.innerWidth;
  const main = document.querySelector('main') || document.body;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const root = document.querySelector('[data-world-ready]') || main;
  const outside = [...root.querySelectorAll('*')].filter((el) => visible(el) && !inScroller(el)).filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; });
  const cut = [...root.querySelectorAll('button, a, [role=tab]')].filter(visible)
    .filter((b) => b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible' && !b.querySelector('.truncate') && !/truncate/.test(b.className));
  const blocks = order.map((id) => { const el = root.querySelector(`[data-world-block="${id}"]`); return el ? Math.round(el.getBoundingClientRect().top + window.scrollY) : null; });
  // Nenhuma etiqueta de dupla cortada (fora do próprio cartão).
  const tags = [...root.querySelectorAll('[data-pair-current="false"]')].filter(visible).map((t) => {
    const card = t.closest('[data-world-leader]').getBoundingClientRect(); const r = t.getBoundingClientRect();
    return r.right <= card.right + 1 && r.width >= 30;
  });
  // Botões flutuantes do app não podem cobrir o "Atualizar".
  const refresh = [...root.querySelectorAll('button')].find((b) => /Atualizar/.test(b.innerText));
  let refreshCovered = null;
  if (refresh) { const r = refresh.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); refreshCovered = !(hit && refresh.contains(hit)); }
  return {
    vh: window.innerHeight,
    overflowX: document.documentElement.scrollWidth - vw,
    outside: outside.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 50)}`),
    cut: cut.slice(0, 5).map((el) => `${el.tagName}:${el.innerText.slice(0, 30)}`),
    blocks, tags, refreshCovered,
    hero: document.querySelector('[data-world-hero]')?.getAttribute('data-world-hero') || null,
    leaders: [...root.querySelectorAll('[data-world-leader]')].map((el) => el.getAttribute('data-world-leader')),
  };
}, ORDER);

async function checkLayouts(page, state) {
  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile) });
    await sleep(500);
    await spa(page, '/world', 1200);
    await ready(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(300);
    const m = await measure(page);
    const label = `${state} @ ${vp.id}`;
    ok(`${label}: 0 overflow horizontal`, m.overflowX <= 0, `overflowX=${m.overflowX}`);
    ok(`${label}: 0 elemento fora da tela`, m.outside.length === 0, m.outside.join(' | '));
    ok(`${label}: 0 controle cortado`, m.cut.length === 0, m.cut.join(' | '));
    ok(`${label}: hierarquia destaque → líderes → eventos → notícias → explorar`, m.blocks.every((y) => y !== null) && m.blocks.every((y, i) => i === 0 || y > m.blocks[i - 1]), JSON.stringify(m.blocks));
    ok(`${label}: destaque na primeira dobra`, m.blocks[1] < m.vh * (vp.id === 'landscape' ? 0.9 : 0.4), `${m.blocks[1]} / ${m.vh}`);
    if (vp.id !== 'landscape') ok(`${label}: líderes começam na primeira dobra`, m.blocks[2] < m.vh, `${m.blocks[2]} / ${m.vh}`);
    ok(`${label}: três cartões de líderes (Mundial, Duplas, Race)`, m.leaders.join() === 'individual,doubles,race');
    ok(`${label}: etiquetas de parceria encerrada inteiras (${m.tags.length})`, m.tags.every(Boolean));
    ok(`${label}: "Atualizar" não fica coberto por botões flutuantes`, m.refreshCovered === false);
  }
}

async function clickAndExpect(page, selector, expectPath, label) {
  await closeDialogs(page);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await spa(page, '/world', 800);
  await ready(page);
  // Toque real: rola o alvo para o meio da tela e só toca se o ponto
  // pertence a ele (nada de barra inferior ou botão flutuante por cima).
  // (o app usa scroll-behavior: smooth — rola "instant" e mede depois)
  await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: Math.max(0, r.top + window.scrollY - window.innerHeight / 2), behavior: 'instant' });
  }, selector);
  await sleep(400);
  const point = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2; const y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, inside: el.contains(hit), hit: hit ? `${hit.tagName}.${String(hit.className).slice(0, 60)} @${location.pathname}` : `nada @${location.pathname} y=${Math.round(y)}` };
  }, selector);
  assert.ok(point, `FALHOU: ${label} — alvo ${selector} ausente`);
  ok(`${label}: alvo tocável (nada por cima)`, point.inside, point.hit);
  await page.mouse.click(point.x, point.y);
  await sleep(2500);
  const now = await path(page);
  ok(`${label} → ${now}`, expectPath instanceof RegExp ? expectPath.test(now) : now === expectPath);
  return now;
}

async function checkNavigation(page, state) {
  // Cartões de líderes abrem a view certa do Ranking (e o Ranking a obedece).
  await clickAndExpect(page, '[data-world-leader="doubles"]', '/ranking?scope=world&type=doubles', `${state}: cartão Duplas`);
  const selected = await page.evaluate(() => [...document.querySelectorAll('[data-ranking-view-switch] [role=tab][aria-selected=true]')].map((t) => t.innerText.trim()).join());
  ok(`${state}: o Ranking abre em Mundial × Duplas`, selected === 'Mundial,Duplas', selected);
  await page.goBack(); await sleep(2000);
  ok(`${state}: voltar do navegador retorna ao Mundo`, (await path(page)) === '/world' && Boolean(await page.$('[data-world-ready]')));
  await clickAndExpect(page, '[data-world-leader="race"]', '/ranking?scope=race&type=individual', `${state}: cartão Race`);
  await clickAndExpect(page, '[data-world-leader="individual"]', '/ranking?scope=world&type=individual', `${state}: cartão Mundial`);

  // CTA do destaque: torneio abre os detalhes; líder abre o atleta no Ranking.
  await closeDialogs(page);
  await spa(page, '/world', 800); await ready(page);
  const kind = await page.evaluate(() => document.querySelector('[data-world-hero]')?.getAttribute('data-world-hero'));
  const ctaPath = await clickAndExpect(page, '[data-world-hero] a', /^\/(tournaments\?tournament=|ranking\?)/, `${state}: CTA do destaque (${kind})`);
  if (ctaPath.startsWith('/tournaments')) {
    const dialog = await page.waitForSelector('[role=dialog]', { timeout: 15000 }).then(() => true).catch(() => false);
    ok(`${state}: CTA do destaque abre os detalhes do torneio`, dialog);
  }
  // Linha de próximo evento abre o torneio certo.
  await clickAndExpect(page, '[data-world-event-row] a', /^\/tournaments\?tournament=/, `${state}: próximo grande evento`);
  ok(`${state}: detalhes do evento abertos`, await page.waitForSelector('[role=dialog]', { timeout: 15000 }).then(() => true).catch(() => false));
  // Atalhos.
  await clickAndExpect(page, '[data-world-block="explore"] a[href="/tournaments?tab=calendar"]', '/tournaments?tab=calendar', `${state}: atalho Calendário`);
  const calTab = await page.evaluate(() => [...document.querySelectorAll('[role=tab][aria-selected=true]')].map((t) => t.innerText.trim()).join());
  ok(`${state}: Calendário abre na aba Calendário`, /Calendário/.test(calTab), calTab);
  await clickAndExpect(page, '[data-world-block="explore"] a[href="/world/directory?tab=athletes"]', '/world/directory?tab=athletes', `${state}: atalho Atletas`);

  // Notícias: as quatro áreas de antes continuam funcionando.
  await closeDialogs(page);
  await spa(page, '/world', 800); await ready(page);
  // Abas do Radix ativam no pointerdown: toque real por coordenada.
  const clickNewsTab = async (label) => {
    await page.evaluate((l) => {
      const t = [...document.querySelectorAll('[data-world-block="news"] [role=tab]')].find((x) => x.innerText.trim() === l);
      const r = t.getBoundingClientRect();
      window.scrollTo({ top: Math.max(0, r.top + window.scrollY - window.innerHeight / 2), behavior: 'instant' });
    }, label);
    await sleep(300);
    const p = await page.evaluate((l) => {
      const t = [...document.querySelectorAll('[data-world-block="news"] [role=tab]')].find((x) => x.innerText.trim() === l);
      const r = t.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, label);
    await page.mouse.click(p.x, p.y);
    await sleep(700);
    return page.evaluate(() => document.querySelector('[data-world-block="news"]').innerText);
  };
  ok(`${state}: notícias › Circuito`, /Circuito profissional/.test(await clickNewsTab('Circuito')));
  ok(`${state}: notícias › Mercado`, /Mercado mundial/.test(await clickNewsTab('Mercado')));
  ok(`${state}: notícias › História`, /Linha do tempo mundial/.test(await clickNewsTab('História')));
  // (innerText respeita o text-transform: os rótulos dos grupos vêm em caixa alta)
  ok(`${state}: notícias › Hoje (grupos Ranking/Torneios/Mercado/Tendências)`, /ranking[\s\S]*torneios[\s\S]*mercado[\s\S]*tendências/i.test(await clickNewsTab('Hoje')));
  const bulletin = await page.$('[data-world-block="news"] button[aria-expanded]');
  if (bulletin) {
    await bulletin.click(); await sleep(300);
    ok(`${state}: boletim expande sob demanda`, await bulletin.evaluate((b) => b.getAttribute('aria-expanded') === 'true'));
  }
  // Recarregar mantém a página.
  await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
  await dismissOverlays(page);
  await ready(page);
  ok(`${state}: recarregar mantém /world`, (await path(page)) === '/world');
}

const browser = await launch();
try {
  // ── Carreira nova ──
  const page = await openCareer(browser, { width: 390, height: 844, mobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await goto(page, '/world', { settle: 2500 });
  await dismissOverlays(page);
  await ready(page);
  await checkLayouts(page, 'nova');
  const heroNova = await page.evaluate(() => document.querySelector('[data-world-hero]')?.getAttribute('data-world-hero'));
  ok('nova: destaque é fato do circuito (líder ou evento; nenhum campeão inventado)', ['leader', 'next', 'live'].includes(heroNova), heroNova);
  const champions = await page.evaluate(() => document.querySelectorAll('[data-world-champion-row]').length);
  ok('nova: nenhum campeão recente antes das primeiras finais', champions === 0);
  const ended = await page.evaluate(() => document.querySelectorAll('[data-pair-current="false"]').length);
  ok('nova: nenhuma dupla do topo aparece como "encerrada" (duplas semeadas jogam juntas)', ended === 0);
  await checkNavigation(page, 'nova');
  ok('nova: 0 erro de JS', errors.length === 0, errors.join(' | '));
  await page.close();

  // ── Carreira avançada (LOCAL-8A, temporada 10) ──
  const SAVE = 'reports/local-8a-career-audit/run10/save-season-10.json';
  if (existsSync(SAVE)) {
    const { openSession } = await import('../reports/ui-redesign-532/tools/session.mjs');
    const careerId = readFileSync(SAVE, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
    const session = await openSession({ save: { url: `/${SAVE}`, careerId } });
    const p10 = session.page;
    await spa(p10, '/world', 1500); await ready(p10);
    await checkLayouts(p10, 't10');
    const hero10 = await p10.evaluate(() => document.querySelector('[data-world-hero]')?.getAttribute('data-world-hero'));
    ok('t10: destaque = título recente de grande evento', hero10 === 'champion', hero10);
    ok('t10: campeões recentes listados', (await p10.evaluate(() => document.querySelectorAll('[data-world-champion-row]').length)) === 3);
    ok('t10: dupla encerrada do topo sinalizada', (await p10.evaluate(() => document.querySelectorAll('[data-pair-current="false"]').length)) >= 1);
    await checkNavigation(p10, 't10');
    ok('t10: 0 erro de JS', p10.__errors.length === 0, p10.__errors.join(' | '));
    await session.browser.close();
  } else {
    console.log(`SKIP — t10: ${SAVE} ausente (artefato local da LOCAL-8A)`);
  }
  console.log(`test-world-mobile-containment-v532b: ${passed} PASS`);
} finally {
  await browser.close();
}
