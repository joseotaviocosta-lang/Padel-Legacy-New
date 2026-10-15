// Playthrough 5.24-C, Partes G/H/I/K/L/O — evidências dos atalhos visíveis.
//
// Por viewport (360x800, 390x844, 844x390, desktop 1366x768) e página
// (Home, Ranking, Comissão técnica, Economia):
//  - retângulos da rail, BottomNav, Floating Guide e header; interseções;
//  - botões inteiros dentro da viewport (safe area: borda >= 0);
//  - alvo de toque >= 44px;
//  - posição estável após rolar (fixed);
//  - fim da rolagem: o conteúdo da rota termina ACIMA da rail;
//  - quantos atalhos visíveis por rótulo (desktop: 1 de cada, sem duplicata);
//  - header: 2 faixas; BottomNav: 5 itens; overflow horizontal.
// E o fluxo de navegação real: Centro (1 toque) → voltar → Carreiras
// (1 toque) → Continuar → voltar, conferindo carreira/save.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-524c');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { id: '360', width: 360, height: 800, mobile: true },
  { id: '390', width: 390, height: 844, mobile: true },
  { id: '844x390', width: 844, height: 390, mobile: true },
  { id: 'desktop', width: 1366, height: 768 },
];
const PAGES = [
  { id: 'home', path: '/game' },
  { id: 'ranking', path: '/ranking' },
  { id: 'comissao-tecnica', path: '/career/team' },
  { id: 'economia', path: '/game/economy' },
];
const LABELS = ['Centro de treinamento', 'Gerenciar carreiras'];

function measureChrome(page) {
  return page.evaluate((labels) => {
    const vis = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0;
    };
    const box = (el) => { if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
    const hit = (a, b) => Boolean(a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b);
    const rail = document.querySelector('[data-floating-utility-rail]');
    const railItems = rail ? [...rail.querySelectorAll(':scope > *')].filter(vis) : [];
    const shortcuts = Object.fromEntries(labels.map((l) => {
      const el = rail ? [...rail.querySelectorAll('button, a')].find((n) => n.getAttribute('aria-label') === l) : null;
      return [l, box(el)];
    }));
    const bottomNav = [...document.querySelectorAll('nav')].find((n) => vis(n) && getComputedStyle(n).position === 'fixed' && Math.abs(n.getBoundingClientRect().bottom - window.innerHeight) < 2);
    const guide = document.querySelector('[aria-label="Abrir guia da carreira"]');
    const header = [...document.querySelectorAll('header.pl-layer-header, .app-desktop-bar')].find(vis);
    const visibleByLabel = Object.fromEntries(labels.map((l) => [l, [...document.querySelectorAll(`[aria-label="${l}"]`)].filter(vis).length]));
    const railBoxes = railItems.map(box);
    const W = window.innerWidth; const H = window.innerHeight;
    return {
      shortcuts,
      rail: box(rail),
      railBoxes,
      bottomNav: box(bottomNav),
      bottomNavItems: bottomNav ? bottomNav.querySelectorAll('a, button').length : 0,
      guide: box(guide),
      header: box(header),
      headerRows: header && header.tagName === 'HEADER' ? header.querySelectorAll(':scope > div').length : null,
      overlapBottomNav: railBoxes.some((b) => hit(b, box(bottomNav))),
      overlapGuide: railBoxes.some((b) => hit(b, box(guide))),
      overlapHeader: railBoxes.some((b) => hit(b, box(header))),
      outOfViewport: railBoxes.some((b) => b.x < 0 || b.y < 0 || b.r > W || b.b > H),
      minTouch: railBoxes.length ? Math.min(...railBoxes.flatMap((b) => [b.w, b.h])) : null,
      visibleByLabel,
      overflowX: document.documentElement.scrollWidth - W,
    };
  }, LABELS);
}

async function scrollChecks(page) {
  return page.evaluate(async () => {
    const rail = document.querySelector('[data-floating-utility-rail]');
    const before = rail.getBoundingClientRect();
    // scroll-behavior: smooth no CSS — rolagem instantânea para medir.
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
    await new Promise((r) => setTimeout(r, 400));
    const after = rail.getBoundingClientRect();
    const stage = document.querySelector('.app-route-stage');
    const stageBottom = stage.getBoundingClientRect().bottom;
    // Último conteúdo REAL da rota (o stage pode ter min-height).
    let contentBottom = 0;
    for (const el of stage.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && getComputedStyle(el).position !== 'fixed') contentBottom = Math.max(contentBottom, r.bottom);
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
    return {
      stableWhenScrolling: Math.abs(before.top - after.top) < 1 && Math.abs(before.left - after.left) < 1,
      contentBottomAtEnd: Math.round(Math.min(stageBottom, contentBottom)),
      railTop: Math.round(after.top),
      contentClearOfRail: Math.min(stageBottom, contentBottom) <= after.top + 1,
    };
  });
}

const tap = (page, label, root = '[data-floating-utility-rail]') => page.evaluate((l, r) => {
  const scope = document.querySelector(r) || document;
  const el = [...scope.querySelectorAll('button, a')].find((n) => n.getAttribute('aria-label') === l && n.getBoundingClientRect().width > 0);
  if (!el) return false;
  el.click();
  return true;
}, label, root);

const careerState = (page) => page.evaluate(async () => {
  const { careerManager } = await import('/src/local/careerDataStore.js');
  const { localGame } = await import('/src/api/localGameClient.js');
  const activeId = await careerManager.activeId().catch(() => null);
  const player = await localGame.entities.PlayerProfile.list(null, 1).then((r) => r?.[0]).catch(() => null);
  return { activeId, playerId: player?.id || null, coins: player?.coins ?? null, careerDate: player?.career_date || null };
}).catch((e) => ({ error: String(e?.message || e) }));

async function navigationFlow(page) {
  const steps = [];
  const path = () => new URL(page.url()).pathname;
  // A 1ª visita à Home credita a recompensa do tutorial (+50, missão
  // tutorial-career-created) — com ou sem troca de carreira. Visitá-la antes
  // isola o fluxo, para que "save íntegro" compare só o efeito dos atalhos.
  await goto(page, '/game', { settle: 4000 });
  await dismissOverlays(page);
  const homeCoins = (await careerState(page)).coins;
  await goto(page, '/ranking', { settle: 1800 });
  await dismissOverlays(page);
  const start = await careerState(page);
  steps.push({ step: 'inicio', path: path() });
  const t1 = await tap(page, 'Centro de treinamento');
  await new Promise((r) => setTimeout(r, 1800));
  steps.push({ step: 'tap Centro (1 toque)', ok: t1, path: path(), shell: await page.evaluate(() => document.querySelectorAll('.app-shell').length), coins: (await careerState(page)).coins });
  await page.goBack({ waitUntil: 'networkidle2' }).catch(() => null);
  await new Promise((r) => setTimeout(r, 1500));
  steps.push({ step: 'voltar', path: path() });
  const t2 = await tap(page, 'Gerenciar carreiras');
  await new Promise((r) => setTimeout(r, 3000));
  steps.push({ step: 'tap Carreiras (1 toque)', ok: t2, path: path(), shell: await page.evaluate(() => document.querySelectorAll('.app-shell').length) });
  await page.screenshot({ path: resolve(OUT_DIR, 'fluxo-gerenciar-carreiras.png') });
  const coinsBeforeCareers = steps[1].coins;
  // Mobile: a lista abre por "Carregar carreira"; o card tem "Continuar".
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /Carregar carreira/.test(x.textContent || ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  const cont = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === 'Continuar' && x.getBoundingClientRect().width > 0);
    if (!b) return false; b.click(); return true;
  });
  await new Promise((r) => setTimeout(r, 4000));
  await dismissOverlays(page);
  const reentered = await careerState(page);
  steps.push({ step: 'Continuar (reentrar)', ok: cont, path: path(), shell: await page.evaluate(() => document.querySelectorAll('.app-shell').length) });
  await page.goBack({ waitUntil: 'networkidle2' }).catch(() => null);
  await new Promise((r) => setTimeout(r, 2000));
  steps.push({ step: 'voltar após reentrar', path: path() });
  return {
    steps,
    sameCareer: Boolean(start.activeId) && start.activeId === reentered.activeId,
    samePlayer: Boolean(start.playerId) && start.playerId === reentered.playerId,
    // Pré-existente (fora do escopo): a recompensa do tutorial é creditada ao
    // abrir a Home e some num reload completo antes de persistir — o saldo
    // fora da Home oscila 100↔150 mesmo SEM trocar de carreira (controle
    // medido). Por isso o saldo pós-reentrada (que cai na Home) é comparado
    // com o saldo da Home antes do fluxo.
    coinsBeforeCareers,
    homeCoins,
    saveIntact: homeCoins === reentered.coins && start.careerDate === reentered.careerDate,
    start,
    reentered,
  };
}

async function run() {
  const evidence = {};
  for (const vp of VIEWPORTS) {
    const browser = await launch();
    try {
      const page = await openCareer(browser, vp);
      const out = { pages: {} };
      for (const p of PAGES) {
        await goto(page, p.path, { settle: 2200 });
        await dismissOverlays(page);
        await page.screenshot({ path: resolve(OUT_DIR, `${p.id}-${vp.id}.png`), fullPage: false });
        out.pages[p.id] = { ...(await measureChrome(page)), scroll: await scrollChecks(page) };
        console.log(`✓ ${p.id}-${vp.id}.png`);
      }
      if (vp.id === '360' || vp.id === '390') {
        // Fallback do menu ☰ → Acesso rápido continua de pé.
        await goto(page, '/game', { settle: 1800 });
        await dismissOverlays(page);
        await tap(page, 'Abrir navegação', 'header');
        await new Promise((r) => setTimeout(r, 900));
        out.drawerQuickAccess = await page.evaluate(() => {
          const block = document.querySelector('[data-mobile-quick-access]');
          if (!block) return { present: false, labels: [] };
          return { present: true, labels: [...block.querySelectorAll('a, button')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => n.getAttribute('aria-label')) };
        });
        await page.screenshot({ path: resolve(OUT_DIR, `menu-acesso-rapido-${vp.id}.png`) });
        await page.keyboard.press('Escape');
        await new Promise((r) => setTimeout(r, 600));
        out.flow = await navigationFlow(page);
      }
      out.pageErrors = page.__errors || [];
      evidence[vp.id] = out;
      await page.close();
    } finally {
      await browser.close();
    }
  }
  writeFileSync(resolve(OUT_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));
  for (const [vp, out] of Object.entries(evidence)) {
    for (const [id, m] of Object.entries(out.pages)) {
      console.log(`${vp}/${id}: nav=${m.overlapBottomNav} guide=${m.overlapGuide} header=${m.overlapHeader} out=${m.outOfViewport} touch=${m.minTouch} vis=${JSON.stringify(m.visibleByLabel)} rows=${m.headerRows} navItems=${m.bottomNavItems} ox=${m.overflowX} fixed=${m.scroll.stableWhenScrolling} clear=${m.scroll.contentClearOfRail}(${m.scroll.contentBottomAtEnd}/${m.scroll.railTop})`);
    }
    if (out.flow) console.log(`${vp} fluxo:`, JSON.stringify({ steps: out.flow.steps, sameCareer: out.flow.sameCareer, samePlayer: out.flow.samePlayer, saveIntact: out.flow.saveIntact }));
  }
}

run().catch((error) => { console.error(error); process.exit(1); });
