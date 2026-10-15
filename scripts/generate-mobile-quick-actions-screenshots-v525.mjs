// Playthrough 5.25, Partes 23-36 — evidências da nova disposição dos atalhos.
// Por viewport e página mede: Carreiras (canto inferior esquerdo), Centro
// (direita, logo abaixo do Avançar, alinhado a ele), BETA flutuante ausente
// no mobile, sobreposições (BottomNav, Guide, header), alvo de toque,
// overflow, faixas do header, itens da BottomNav. E o fluxo do menu:
// ☰ → Beta testers → Central de testes abre.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-525');
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
  { id: 'treinos', path: '/career/training' },
  { id: 'economia', path: '/game/economy' },
];

function measure(page) {
  return page.evaluate(() => {
    const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const box = (el) => { if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
    const hit = (a, b) => Boolean(a && b && a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b);
    const W = window.innerWidth; const H = window.innerHeight;
    const careers = [...document.querySelectorAll('[aria-label="Gerenciar carreiras"]')].find(vis);
    const training = [...document.querySelectorAll('[aria-label="Centro de treinamento"]')].find(vis);
    const header = [...document.querySelectorAll('header.pl-layer-header, .app-desktop-bar')].find(vis);
    const advance = header ? [...header.querySelectorAll('button')].find((b) => vis(b) && (/Avançar/i.test(b.textContent || '') || /Avançar|avançar/i.test(b.getAttribute('aria-label') || ''))) : null;
    const bottomNav = [...document.querySelectorAll('nav')].find((n) => vis(n) && getComputedStyle(n).position === 'fixed' && Math.abs(n.getBoundingClientRect().bottom - H) < 2);
    const guide = document.querySelector('[aria-label="Abrir guia da carreira"]');
    const betaFloating = [...document.querySelectorAll('[data-floating-utility-rail] button[title="Relatar problema da versão beta"]')].filter(vis).length;
    const c = box(careers); const t = box(training); const a = box(advance); const n = box(bottomNav); const g = box(guide); const h = box(header);
    const shortcuts = [c, t].filter(Boolean);
    return {
      careers: c, training: t, advance: a, bottomNav: n, guide: g, header: h,
      betaFloating,
      careersBottomLeft: Boolean(c && c.x <= 24 && n && c.b <= n.y && n.y - c.b <= 24),
      trainingRight: Boolean(t && W - t.r <= 16),
      trainingBelowAdvance: Boolean(t && a && t.y >= a.b && Math.abs(t.r - a.r) <= 8),
      trainingBelowHeader: Boolean(t && h && t.y >= h.b),
      overlapBottomNav: shortcuts.some((s) => hit(s, n)),
      overlapGuide: shortcuts.some((s) => hit(s, g)),
      overlapHeader: shortcuts.some((s) => hit(s, h)),
      outOfViewport: shortcuts.some((s) => s.x < 0 || s.y < 0 || s.r > W || s.b > H),
      minTouch: shortcuts.length ? Math.min(...shortcuts.flatMap((s) => [s.w, s.h])) : null,
      visible: { careers: [...document.querySelectorAll('[aria-label="Gerenciar carreiras"]')].filter(vis).length, training: [...document.querySelectorAll('[aria-label="Centro de treinamento"]')].filter(vis).length },
      headerRows: header && header.tagName === 'HEADER' ? header.querySelectorAll(':scope > div').length : null,
      bottomNavItems: bottomNav ? bottomNav.querySelectorAll('a, button').length : 0,
      overflowX: document.documentElement.scrollWidth - W,
      // O que fica embaixo do Centro (no topo da página, antes de rolar).
      underTraining: t ? (() => { const el = document.elementsFromPoint(t.x + t.w / 2, t.y + t.h / 2).find((e) => !e.closest('[data-floating-utility-rail]') && !e.closest('[data-quick-action]')); return el ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 50)} "${(el.textContent || '').trim().slice(0, 30)}"` : null; })() : null,
    };
  });
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
        await page.screenshot({ path: resolve(OUT_DIR, `${p.id}-${vp.id}.png`) });
        out.pages[p.id] = await measure(page);
      }
      if (vp.mobile && vp.width < 768) {
        await goto(page, '/game', { settle: 1800 });
        await dismissOverlays(page);
        await page.evaluate(() => document.querySelector('[aria-label="Abrir navegação"]')?.click());
        await new Promise((r) => setTimeout(r, 900));
        const menuBeta = await page.evaluate(() => Boolean([...document.querySelectorAll('[data-menu-beta]')].find((b) => b.getBoundingClientRect().width > 0)));
        await page.screenshot({ path: resolve(OUT_DIR, `menu-beta-${vp.id}.png`) });
        await page.evaluate(() => document.querySelector('[data-menu-beta]')?.click());
        await new Promise((r) => setTimeout(r, 1200));
        const central = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"], h2')].some((el) => /Central de testes/.test(el.textContent || '') && el.getBoundingClientRect().width > 0));
        const drawerClosed = await page.evaluate(() => !document.querySelector('#mobile-navigation-drawer'));
        await page.screenshot({ path: resolve(OUT_DIR, `central-beta-${vp.id}.png`) });
        out.menuBeta = { entry: menuBeta, opensCentral: central, drawerClosed };
        // 1 toque: Centro e Carreiras.
        await page.keyboard.press('Escape');
        await goto(page, '/ranking', { settle: 1800 });
        await page.evaluate(() => document.querySelector('[data-quick-action="training"]')?.click());
        await new Promise((r) => setTimeout(r, 1500));
        const trainingPath = new URL(page.url()).pathname;
        await page.evaluate(() => document.querySelector('[data-quick-action="careers"]')?.click());
        await new Promise((r) => setTimeout(r, 2500));
        out.taps = { training: trainingPath, careers: new URL(page.url()).pathname };
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
      console.log(`${vp}/${id}: beta=${m.betaFloating} carreirasBL=${m.careersBottomLeft} centroDir=${m.trainingRight} abaixoAvançar=${m.trainingBelowAdvance} nav=${m.overlapBottomNav} guide=${m.overlapGuide} header=${m.overlapHeader} fora=${m.outOfViewport} touch=${m.minTouch} vis=${JSON.stringify(m.visible)} rows=${m.headerRows} navItems=${m.bottomNavItems} ox=${m.overflowX} sob=${m.underTraining}`);
    }
    if (out.menuBeta) console.log(`${vp} menu: ${JSON.stringify(out.menuBeta)} toques: ${JSON.stringify(out.taps)}`);
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
