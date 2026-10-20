// Fase 5.32-C — Diretório e Perfis de Atletas no navegador real (Chrome +
// dev server). Carreira NOVA criada pela UI num perfil temporário e, se o
// save existir localmente, a temporada 10 da LOCAL-8A em memória.
//   - diretório e perfil sem overflow/corte em 360/390/768/1366/1600/paisagem;
//   - busca sem acento, recortes (Top 100, Aposentados);
//   - perfil: posição do cabeçalho = a da linha (autoridade do Ranking),
//     seções, parceiro → perfil do parceiro → "voltar para";
//   - deep link ?athlete=, recarregar, voltar do navegador fecha o perfil;
//   - Ranking → Perfil, Mundo → Perfil, linha do jogador → "meu perfil";
//   - 0 erro de JS.
// Requer o dev server (npm run dev, 127.0.0.1:5174).
// Uso: node scripts/test-athletes-mobile-containment-v532c.mjs
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
const DIRECTORY = '/world/directory?tab=athletes';

let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const spa = async (page, path, settle = 1500) => {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(settle);
};
const path = (page) => page.evaluate(() => `${location.pathname}${location.search}`);
const waitRows = (page) => page.waitForFunction(() => document.querySelectorAll('[data-athlete-row]').length > 0, { timeout: 120000, polling: 100 }).then(() => sleep(400));
const waitProfile = (page) => page.waitForSelector('[data-athlete-profile]', { timeout: 30000 }).then(() => sleep(900)).then(() => true).catch(() => false);
const setVp = async (page, vp) => { await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile) }); await sleep(500); };
const closeDialogs = async (page) => {
  let closed = false;
  for (let i = 0; i < 4 && (await page.$('[role=dialog]')); i += 1) { await page.keyboard.press('Escape'); await sleep(600); closed = true; }
  if (!closed) return;
  let last = await path(page);
  for (let i = 0; i < 10; i += 1) { await sleep(300); const now = await path(page); if (now === last) break; last = now; }
  await sleep(400);
};
// Toque real: centraliza o alvo (scroll instantâneo) e só toca se o ponto é dele.
async function tap(page, selector, { within = null } = {}) {
  await page.evaluate((sel, root) => {
    const scope = root ? document.querySelector(root) : document;
    const el = scope?.querySelector(sel);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'instant' });
  }, selector, within);
  await sleep(350);
  const p = await page.evaluate((sel, root) => {
    const scope = root ? document.querySelector(root) : document;
    const el = scope?.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2; const y = r.y + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return { x, y, inside: el.contains(hit) };
  }, selector, within);
  assert.ok(p, `FALHOU: alvo ausente ${selector}`);
  assert.ok(p.inside, `FALHOU: alvo coberto ${selector}`);
  await page.mouse.click(p.x, p.y);
}
async function typeSearch(page, value) {
  await page.evaluate((v) => {
    const input = document.querySelector('[data-directory-search]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value);
  await sleep(900);
}
async function clickTab(page, rootSelector, label) {
  const sel = await page.evaluate((root, l) => {
    const tabs = [...document.querySelectorAll(`${root} [role=tab]`)];
    const i = tabs.findIndex((t) => t.innerText.trim() === l);
    if (i < 0) return null;
    tabs[i].setAttribute('data-test-tab', l);
    return `[data-test-tab="${l}"]`;
  }, rootSelector, label);
  assert.ok(sel, `FALHOU: aba ${label} ausente`);
  await tap(page, sel);
  await sleep(700);
}

const measureDirectory = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const main = document.querySelector('main') || document.body;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const outside = [...main.querySelectorAll('*')].filter((el) => visible(el) && !inScroller(el)).filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; });
  const cut = [...main.querySelectorAll('button, a, [role=tab], input, select')].filter(visible)
    .filter((b) => b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible' && !b.querySelector('.truncate') && !/truncate/.test(b.className) && b.tagName !== 'SELECT');
  const rows = [...main.querySelectorAll('[data-athlete-row]')].filter(visible);
  // Em cada linha: posição, nome e OVR dentro da linha e da tela.
  const rowsOk = rows.slice(0, 12).map((row) => {
    const r = row.getBoundingClientRect();
    const parts = [row.firstElementChild, row.querySelector('.truncate'), row.children[row.children.length - 2]].map((e) => e?.getBoundingClientRect());
    return parts.every((b) => b && b.width > 0 && b.left >= r.left - 1 && b.right <= r.right + 1 && b.right <= vw + 1);
  });
  const search = main.querySelector('[data-directory-search]');
  return {
    vh: window.innerHeight,
    overflowX: document.documentElement.scrollWidth - vw,
    outside: outside.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 50)}`),
    cut: cut.slice(0, 5).map((el) => `${el.tagName}:${(el.innerText || el.value || '').slice(0, 30)}`),
    searchY: search ? Math.round(search.getBoundingClientRect().top) : null,
    firstRowY: rows[0] ? Math.round(rows[0].getBoundingClientRect().top) : null,
    rowsOk, rowHeights: rows.slice(0, 8).map((r) => Math.round(r.getBoundingClientRect().height)),
  };
});
const measureProfile = (page) => page.evaluate(() => {
  const panel = document.querySelector('[role=dialog] .pl-modal-panel');
  const r = panel.getBoundingClientRect();
  const vw = window.innerWidth;
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== panel; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const outside = [...panel.querySelectorAll('*')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && !inScroller(el) && (b.right > r.right + 1 || b.left < r.left - 1); });
  const header = panel.querySelector('[data-athlete-header]')?.getBoundingClientRect();
  return {
    panelInside: r.left >= -1 && r.right <= vw + 1,
    outside: outside.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 40)}`),
    headerVisible: Boolean(header && header.top < window.innerHeight && header.bottom > 0),
    rank: panel.querySelector('[data-athlete-world-rank]')?.getAttribute('data-athlete-world-rank') || '',
    name: panel.querySelector('[data-athlete-name]')?.innerText.trim(),
    partner: panel.querySelector('[data-athlete-current-partner]')?.getAttribute('data-athlete-current-partner'),
  };
});

async function checkDirectory(page, state) {
  for (const vp of VIEWPORTS) {
    await setVp(page, vp);
    await closeDialogs(page);
    await spa(page, DIRECTORY, 800);
    await waitRows(page);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await sleep(300);
    const m = await measureDirectory(page);
    const label = `${state} diretório @ ${vp.id}`;
    ok(`${label}: 0 overflow horizontal`, m.overflowX <= 0, `overflowX=${m.overflowX}`);
    ok(`${label}: 0 elemento fora da tela`, m.outside.length === 0, m.outside.join(' | '));
    ok(`${label}: 0 controle cortado`, m.cut.length === 0, m.cut.join(' | '));
    ok(`${label}: busca na primeira dobra`, m.searchY !== null && m.searchY < m.vh * (vp.id === 'landscape' ? 1 : 0.5), `${m.searchY}`);
    if (vp.id !== 'landscape') ok(`${label}: lista começa na primeira dobra`, m.firstRowY !== null && m.firstRowY < m.vh, `${m.firstRowY}/${m.vh}`);
    ok(`${label}: posição, nome e OVR inteiros em cada linha`, m.rowsOk.every(Boolean), JSON.stringify(m.rowsOk));
    ok(`${label}: linhas compactas (≤ 72px)`, m.rowHeights.every((h) => h <= 72), JSON.stringify(m.rowHeights));
    // Perfil do 1º da lista neste viewport.
    await tap(page, '[data-athlete-row]');
    ok(`${label}: perfil abre`, await waitProfile(page));
    const p = await measureProfile(page);
    ok(`${label}: perfil dentro da tela, sem elemento vazando`, p.panelInside && p.outside.length === 0, p.outside.join(' | '));
    ok(`${label}: cabeçalho esportivo visível ao abrir`, p.headerVisible);
    await closeDialogs(page);
  }
}

async function checkBehaviour(page, state, { retired = false } = {}) {
  await setVp(page, VIEWPORTS[1]);
  await closeDialogs(page);
  await spa(page, DIRECTORY, 800);
  await waitRows(page);
  // Busca sem acento.
  await typeSearch(page, 'agustin tapia');
  const first = await page.evaluate(() => document.querySelector('[data-athlete-row]')?.innerText || '');
  ok(`${state}: busca "agustin tapia" encontra Agustín Tapia`, /Agustín Tapia/.test(first), first.slice(0, 60));
  const rowRank = await page.evaluate(() => document.querySelector('[data-athlete-row] [data-athlete-rank]')?.getAttribute('data-athlete-rank'));
  await tap(page, '[data-athlete-row]');
  await waitProfile(page);
  let p = await measureProfile(page);
  ok(`${state}: posição do cabeçalho = a da linha do diretório (#${rowRank})`, p.rank === rowRank && p.name === 'Agustín Tapia', JSON.stringify(p));
  for (const section of ['Resultados', 'Parcerias', 'Jogo', 'Resumo']) {
    await clickTab(page, '[data-athlete-profile]', section);
    const visible = await page.evaluate((s) => Boolean(document.querySelector(`[data-athlete-section="${{ Resultados: 'results', Parcerias: 'partners', Jogo: 'game', Resumo: 'summary' }[s]}"]`)), section);
    ok(`${state}: seção ${section} abre`, visible);
  }
  // Parceiro → perfil do parceiro → voltar.
  ok(`${state}: Tapia tem parceiro atual confirmado`, p.partner === 'current', p.partner);
  await tap(page, '[data-athlete-partner-link]');
  await sleep(1200);
  p = await measureProfile(page);
  ok(`${state}: parceiro abre o perfil do parceiro (${p.name})`, p.name && p.name !== 'Agustín Tapia');
  await tap(page, '[data-athlete-back]');
  await sleep(1000);
  p = await measureProfile(page);
  ok(`${state}: "voltar para" retorna ao perfil anterior`, p.name === 'Agustín Tapia');
  // Voltar do navegador fecha o perfil sem sair do diretório.
  await page.goBack(); await sleep(1500);
  ok(`${state}: voltar do navegador fecha o perfil e fica no diretório`, !(await page.$('[role=dialog]')) && (await path(page)).startsWith('/world/directory'), await path(page));
  await typeSearch(page, '');
  // Recortes.
  await clickTab(page, '[data-directory-controls]', 'Top 100');
  const top = await page.evaluate(() => [...document.querySelectorAll('[data-athlete-row] [data-athlete-rank]')].slice(0, 60).map((e) => Number(e.getAttribute('data-athlete-rank'))));
  ok(`${state}: Top 100 começa em #1 e só tem posições ≤ 100`, top[0] === 1 && top.every((n) => n >= 1 && n <= 100), JSON.stringify(top.slice(0, 5)));
  if (retired) {
    await clickTab(page, '[data-directory-controls]', 'Aposentados');
    const flags = await page.evaluate(() => [...document.querySelectorAll('[data-athlete-row]')].map((r) => r.hasAttribute('data-retired')));
    ok(`${state}: recorte Aposentados lista só aposentados (${flags.length})`, flags.length > 0 && flags.every(Boolean));
    await tap(page, '[data-athlete-row]');
    await waitProfile(page);
    const rp = await measureProfile(page);
    ok(`${state}: perfil de aposentado sem posição e "encerrou a carreira"`, rp.rank === '' && rp.partner === 'retired', JSON.stringify(rp));
    await closeDialogs(page);
  }
  await clickTab(page, '[data-directory-controls]', 'Todos');
  // Deep link + recarregar.
  const id = await page.evaluate(() => document.querySelector('[data-athlete-row]')?.getAttribute('data-athlete-row'));
  await spa(page, `${DIRECTORY}&athlete=${encodeURIComponent(id)}`, 800);
  ok(`${state}: deep link ?athlete= abre o perfil`, await waitProfile(page));
  // (dismissOverlays clica em qualquer "Fechar" — inclusive o X do perfil —,
  // então o perfil reaberto é verificado antes de dispensar avisos.)
  await page.reload({ waitUntil: 'networkidle2' }).catch(() => null);
  ok(`${state}: recarregar com ?athlete= reabre o perfil`, await page.waitForSelector('[data-athlete-profile]', { timeout: 120000 }).then(() => true).catch(() => false));
  await closeDialogs(page);
  await dismissOverlays(page);
  await closeDialogs(page);

  // Ranking → Perfil (posição do Ranking = posição do perfil).
  await spa(page, `/ranking?athlete=${encodeURIComponent(id)}`, 3500);
  ok(`${state}: Ranking → Perfil abre`, await waitProfile(page));
  const fromRanking = await measureProfile(page);
  ok(`${state}: no Ranking o perfil mostra a mesma posição Mundial`, fromRanking.rank === '1', JSON.stringify(fromRanking));
  const rankingLink = await page.$('[data-athlete-ranking-link]');
  ok(`${state}: no Ranking o perfil não oferece "ver no ranking" (já está lá)`, !rankingLink);
  await closeDialogs(page);
  // Mundo → (líder) → Perfil.
  await spa(page, '/world', 2000);
  await page.waitForSelector('[data-world-leader="individual"]', { timeout: 60000 });
  await tap(page, '[data-world-leader="individual"]');
  await sleep(3000);
  ok(`${state}: Mundo → Ranking Mundial`, (await path(page)).startsWith('/ranking?scope=world&type=individual'));
  await tap(page, '[data-ranking-row="athlete"] button');
  ok(`${state}: Mundo → Ranking → Perfil`, await waitProfile(page));
  await closeDialogs(page);
  // Linha do próprio jogador no Ranking → "meu perfil" (ações exclusivas preservadas lá).
  const hasSelf = await page.$('[data-ranking-row="athlete"][data-self] button');
  if (hasSelf) {
    await tap(page, '[data-ranking-row="athlete"][data-self] button');
    await waitProfile(page);
    ok(`${state}: linha do jogador → link para o perfil completo dele`, Boolean(await page.$('[data-athlete-player-link]')));
    await tap(page, '[data-athlete-player-link]');
    await sleep(2500);
    ok(`${state}: "Abrir meu perfil completo" vai para /career/athlete`, (await path(page)).startsWith('/career/athlete'));
  }
}

const browser = await launch();
try {
  const page = await openCareer(browser, VIEWPORTS[1]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await goto(page, DIRECTORY, { settle: 2500 });
  await dismissOverlays(page);
  await waitRows(page);
  await checkDirectory(page, 'nova');
  await checkBehaviour(page, 'nova');
  ok('nova: 0 erro de JS', errors.length === 0, errors.join(' | '));
  await page.close();

  const SAVE = 'reports/local-8a-career-audit/run10/save-season-10.json';
  if (existsSync(SAVE)) {
    const { openSession } = await import('../reports/ui-redesign-532/tools/session.mjs');
    const careerId = readFileSync(SAVE, 'utf8').slice(0, 4000).match(/"career_id":"([^"]+)"/)[1];
    const session = await openSession({ save: { url: `/${SAVE}`, careerId } });
    const p10 = session.page;
    await spa(p10, DIRECTORY, 1500);
    await waitRows(p10);
    await checkDirectory(p10, 't10');
    await checkBehaviour(p10, 't10', { retired: true });
    ok('t10: 0 erro de JS', p10.__errors.length === 0, p10.__errors.join(' | '));
    await session.browser.close();
  } else {
    console.log(`SKIP — t10: ${SAVE} ausente (artefato local da LOCAL-8A)`);
  }
  console.log(`test-athletes-mobile-containment-v532c: ${passed} PASS`);
} finally {
  await browser.close();
}
