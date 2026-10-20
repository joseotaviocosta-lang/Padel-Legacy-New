// Fase 5.32-A — Ranking no navegador real (Chrome instalado + dev server),
// com uma carreira NOVA criada pela UI num perfil temporário (nada toca nos
// saves do usuário). Mede, nas 4 views × 360/390/paisagem/desktop:
//   - 0 overflow horizontal, 0 elemento fora da tela, 0 botão cortado;
//   - os dois alternadores (período/tipo) na MESMA linha;
//   - "Sua posição" na primeira dobra (POSITION FIRST);
//   - 0 erro de JS.
// E a navegação: clique muda a URL com push (voltar/avançar funcionam),
// recarregar mantém a view, setas do teclado trocam a opção.
// Requer o dev server (npm run dev, 127.0.0.1:5174).
// Uso: node scripts/test-ranking-mobile-containment-v532.mjs
import assert from 'node:assert/strict';
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
  { id: 'desktop', width: 1366, height: 768 },
  { id: '1600', width: 1600, height: 900 },
];
const VIEWS = [
  ['world', 'individual'], ['world', 'doubles'], ['race', 'individual'], ['race', 'doubles'],
];

let passed = 0;
const ok = (label, condition, detail = '') => { assert.ok(condition, `FALHOU: ${label} ${detail}`); passed += 1; console.log(`PASS — ${label}`); };
const spa = async (page, path, settle = 2200) => {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await sleep(settle);
};
const viewState = (page) => page.evaluate(() => {
  const params = new URLSearchParams(location.search);
  const selected = [...document.querySelectorAll('[data-ranking-view-switch] [role=tab][aria-selected=true]')].map((t) => t.innerText.trim());
  return { scope: params.get('scope'), type: params.get('type'), selected };
});

const measure = (page) => page.evaluate(() => {
  const vw = window.innerWidth;
  const main = document.querySelector('main') || document.body;
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const inScroller = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true; } return false; };
  const root = document.querySelector('[data-ranking-view-switch]')?.parentElement || main;
  const outside = [...root.querySelectorAll('*')].filter((el) => visible(el) && !inScroller(el)).filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 || r.left < -1; });
  const cut = [...root.querySelectorAll('button, a, [role=tab], input')].filter(visible).filter((b) => b.scrollWidth > b.clientWidth + 2 && getComputedStyle(b).overflow !== 'visible' && !/truncate/.test(b.className));
  const tabs = [...document.querySelectorAll('[data-ranking-view-switch] [role=tablist]')].map((t) => Math.round(t.getBoundingClientRect().top));
  const hero = document.querySelector('[data-ranking-hero]');
  const heroRect = hero?.getBoundingClientRect();
  return {
    overflowX: document.documentElement.scrollWidth - vw,
    outside: outside.slice(0, 5).map((el) => `${el.tagName}.${String(el.className).slice(0, 50)}`),
    cut: cut.slice(0, 5).map((el) => `${el.tagName}:${el.innerText.slice(0, 30)}`),
    tabs,
    heroTop: heroRect ? Math.round(heroRect.top + window.scrollY) : null,
    heroKind: hero?.getAttribute('data-ranking-hero') || null,
    vh: window.innerHeight,
    // 5.32-A.1 — em cada linha visível: posição, nome e pontos inteiros na
    // tela e sem sobreposição entre nome e pontos.
    rows: [...document.querySelectorAll('[data-ranking-row]')].filter(visible).slice(0, 25).map((li) => {
      const row = li.firstElementChild; const r = row.getBoundingClientRect();
      const pos = row.firstElementChild?.getBoundingClientRect();
      const name = row.querySelector('.min-w-0.flex-1 p')?.getBoundingClientRect();
      const pts = row.lastElementChild?.getBoundingClientRect();
      const inside = (x) => x && x.width > 0 && x.left >= r.left - 1 && x.right <= r.right + 1 && x.right <= vw + 1;
      return { ok: inside(pos) && inside(name) && inside(pts) && name.right <= pts.left + 1, h: Math.round(r.height) };
    }),
    columns: (() => {
      const list = document.querySelector('ol[aria-label^="Classificação"]')?.getBoundingClientRect();
      return hero && list ? { heroRight: Math.round(heroRect.right), listLeft: Math.round(list.left) } : null;
    })(),
  };
});

const browser = await launch();
try {
  const page = await openCareer(browser, VIEWPORTS[1]);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
  await goto(page, '/ranking?scope=world&type=individual', { settle: 3500 });
  await dismissOverlays(page);

  for (const vp of VIEWPORTS) {
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1, isMobile: Boolean(vp.mobile), hasTouch: Boolean(vp.mobile) });
    await sleep(600);
    for (const [scope, type] of VIEWS) {
      await spa(page, `/ranking?scope=${scope}&type=${type}`);
      await page.evaluate(() => window.scrollTo(0, 0));
      const m = await measure(page);
      const label = `${scope}/${type} @ ${vp.id}`;
      ok(`${label}: 0 overflow horizontal`, m.overflowX <= 0, `overflowX=${m.overflowX}`);
      ok(`${label}: 0 elemento fora da tela`, m.outside.length === 0, m.outside.join(' | '));
      ok(`${label}: 0 controle cortado`, m.cut.length === 0, m.cut.join(' | '));
      ok(`${label}: alternadores período/tipo na mesma linha`, m.tabs.length === 2 && Math.abs(m.tabs[0] - m.tabs[1]) <= 1, JSON.stringify(m.tabs));
      // Paisagem tem só 390px de altura: o cartão começa na 1ª dobra.
      const limit = vp.id === 'landscape' ? m.vh : m.vh * 0.45;
      ok(`${label}: "Sua posição" começa na primeira dobra (top ${m.heroTop} < ${Math.round(limit)})`, m.heroTop !== null && m.heroTop < limit, m.heroKind);
      ok(`${label}: posição, nome e pontos inteiros em cada linha visível (${m.rows.length})`, m.rows.every((r) => r.ok), JSON.stringify(m.rows.filter((r) => !r.ok).slice(0, 2)));
      if (vp.width >= 1366 && m.columns) ok(`${label}: desktop em duas colunas (cartão à esquerda da escada)`, m.columns.heroRight <= m.columns.listLeft, JSON.stringify(m.columns));
      if (vp.width >= 1366 && m.rows.length) ok(`${label}: desktop com linhas densas (≤ 56px)`, m.rows.every((r) => r.h <= 56), JSON.stringify(m.rows.map((r) => r.h).slice(0, 5)));
    }
  }

  // ── Navegação: push, voltar/avançar, recarregar, teclado ──
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await spa(page, '/ranking?scope=world&type=individual');
  const clickTab = async (text) => {
    const box = await page.evaluate((t) => {
      const el = [...document.querySelectorAll('[data-ranking-view-switch] [role=tab]')].find((x) => x.innerText.trim() === t);
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    }, text);
    await page.mouse.click(box.x, box.y);
    await sleep(1500);
  };
  await clickTab('Race');
  let s = await viewState(page);
  ok('clique em "Race" → URL scope=race&type=individual e aba selecionada', s.scope === 'race' && s.type === 'individual' && s.selected.includes('Race'), JSON.stringify(s));
  await clickTab('Duplas');
  s = await viewState(page);
  ok('clique em "Duplas" → URL scope=race&type=doubles', s.scope === 'race' && s.type === 'doubles' && s.selected.includes('Duplas'), JSON.stringify(s));
  await page.goBack(); await sleep(1500);
  s = await viewState(page);
  ok('voltar → Race/Individual (o clique empilhou histórico)', s.scope === 'race' && s.type === 'individual' && s.selected.join() === 'Race,Individual', JSON.stringify(s));
  await page.goBack(); await sleep(1500);
  s = await viewState(page);
  ok('voltar de novo → Mundial/Individual', s.scope === 'world' && s.type === 'individual' && s.selected.join() === 'Mundial,Individual', JSON.stringify(s));
  await page.goForward(); await sleep(1500);
  s = await viewState(page);
  ok('avançar → Race/Individual', s.scope === 'race' && s.type === 'individual', JSON.stringify(s));
  await page.reload({ waitUntil: 'networkidle2' }); await sleep(4000); await dismissOverlays(page);
  s = await viewState(page);
  ok('recarregar mantém a view da URL', s.scope === 'race' && s.type === 'individual' && s.selected.join() === 'Race,Individual', JSON.stringify(s));
  await page.evaluate(() => document.querySelector('[data-ranking-view-switch] [role=tab][aria-selected=true]').focus());
  await page.keyboard.press('ArrowLeft'); await sleep(1500);
  s = await viewState(page);
  ok('teclado: seta para a esquerda troca Race → Mundial', s.scope === 'world' && s.selected.includes('Mundial'), JSON.stringify(s));
  await spa(page, '/ranking?tab=teams');
  s = await viewState(page);
  ok('link legado ?tab=teams normaliza para scope=world&type=doubles', s.scope === 'world' && s.type === 'doubles', JSON.stringify(s));

  // ── Carreira nova: sem ranking, sem dupla ──
  await spa(page, '/ranking?scope=world&type=individual');
  const hero = await page.evaluate(() => document.querySelector('[data-ranking-hero]')?.innerText || '');
  ok('carreira nova: "Ainda sem ranking", sem posição numérica', /Ainda sem ranking/i.test(hero) && !/#\s?\d/.test(hero), hero.replace(/\s+/g, ' '));
  await spa(page, '/ranking?scope=world&type=doubles');
  const noPair = await page.evaluate(() => document.querySelector('[data-ranking-hero="no-pair"]')?.innerText || '');
  ok('carreira nova sem dupla: estado "Sem dupla ativa" com ação', /Sem dupla ativa/.test(noPair) && /Procurar parceiro/.test(noPair));
  await spa(page, '/ranking?scope=race&type=individual');
  const race = await page.evaluate(() => ({
    period: document.querySelector('[data-ranking-period]')?.innerText || '',
    podium: Boolean(document.querySelector('[data-ranking-podium]')),
  }));
  ok('Race: micro-explicação com o ano da carreira e sem pódio de "0 pts"', /Race \d{4}: pontos da temporada/.test(race.period) && !race.podium, race.period);

  ok('0 erro de JS em todo o roteiro', errors.length === 0, errors.join(' | '));
  await page.close();
} finally {
  await browser.close();
}
console.log(`\ntest-ranking-mobile-containment-v532: ${passed} PASS`);
