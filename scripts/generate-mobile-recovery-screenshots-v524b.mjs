// Playthrough 5.24-B, Partes A/O/P — evidências visuais e medidas reais:
//  - Race → Duplas em 360/390/desktop, com contraste COMPUTADO do eyebrow e
//    do badge (cor do texto x fundo efetivo do card);
//  - Home, Treinos, Economia, drawer com "Acesso rápido";
//  - altura do header, do BottomNav e área útil em 360x800 e 390x844;
//  - overflow horizontal, header/BottomNav duplicados;
//  - toques reais até Centro de treinamento e Gerenciar carreiras.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-524b');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { id: '360', width: 360, height: 800, mobile: true },
  { id: '390', width: 390, height: 844, mobile: true },
  { id: 'desktop', width: 1366, height: 768 },
];
const PAGES = [
  { id: 'race-duplas', path: '/ranking?scope=race&type=doubles' },
  { id: 'home', path: '/game' },
  { id: 'treinos', path: '/career/training' },
  { id: 'economia', path: '/game/economy' },
];

async function injectCareer(page) {
  return page.evaluate(async () => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const { ensureMyProfile } = await import('/src/lib/padel.js');
    const { startPartnership } = await import('/src/lib/partnershipSystem.js');
    const { ensurePlayerTeamRanking } = await import('/src/lib/teamRanking.js');
    const bots = await import('/src/lib/bots.js');
    const profile = await ensureMyProfile(await localGame.auth.me());
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 40).catch(() => []);
    await Promise.all((athletes || []).slice(0, 30).map((a, i) => localGame.entities.AthleteProfile
      .update(a.id, { race_points: Math.max(0, 900 - i * 25) }).catch(() => null)));
    const pool = bots.BOTS_BY_DIFFICULTY?.avancado || bots.BOTS_BY_DIFFICULTY?.elite || [];
    const started = await startPartnership(profile, pool[0], 60, 50);
    const partnerId = started?.partnership?.partner_bot_id;
    if (!partnerId) return { ok: false };
    await localGame.entities.AthleteProfile.update(partnerId, { world_ranking_points: 978, ranking_points: 978, race_points: 120 }).catch(() => null);
    await localGame.entities.PlayerProfile.update(profile.id, { rank_points: 39, world_ranking_points: 39, race_points: 39 }).catch(() => null);
    await ensurePlayerTeamRanking(await localGame.entities.PlayerProfile.get(profile.id));
    return { ok: true, partnerId };
  }).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
}

// Contraste WCAG: cor do texto contra o fundo efetivo (compondo as camadas
// semitransparentes dos ancestrais sobre o body).
function contrastOf(page, text) {
  return page.evaluate((needle) => {
    const el = [...document.querySelectorAll('p,div,span')].find((n) => n.children.length === 0 && (n.textContent || '').trim().toLowerCase() === needle.toLowerCase())
      || [...document.querySelectorAll('div')].find((n) => n.children.length === 0 && (n.textContent || '').trim().startsWith(needle));
    if (!el) return null;
    const parse = (c) => { const m = c.match(/[\d.]+/g) || []; return { r: +m[0], g: +m[1], b: +m[2], a: m[3] === undefined ? 1 : +m[3] }; };
    const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
    const chain = [];
    for (let n = el; n; n = n.parentElement) chain.push(n);
    let bg = parse(getComputedStyle(document.body).backgroundColor);
    for (const n of chain.reverse()) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      if (c.a > 0) bg = over(c, bg);
      // Gradiente: aproxima pela primeira parada de cor (a do canto onde o
      // eyebrow fica, from-*).
      const grad = cs.backgroundImage.match(/rgba?\([^)]+\)/);
      if (grad) bg = over(parse(grad[0]), bg);
    }
    const fg = over(parse(getComputedStyle(el).color), bg);
    const lum = ({ r, g, b }) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [L1, L2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    return { text: (el.textContent || '').trim(), color: getComputedStyle(el).color, ratio: Math.round(((L1 + 0.05) / (L2 + 0.05)) * 100) / 100 };
  }, text);
}

function layoutMetrics(page) {
  return page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.height > 0 && r.width > 0 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
    const headers = [...document.querySelectorAll('header.pl-layer-header, .app-desktop-bar')].filter(visible);
    const navs = [...document.querySelectorAll('nav[aria-label*="Navegação inferior"], [data-bottom-nav], nav.pl-bottom-nav')].filter(visible);
    const header = headers[0]?.getBoundingClientRect().height || 0;
    // BottomNav: elemento fixo colado no rodapé.
    const fixedBottom = [...document.querySelectorAll('nav')].filter((n) => visible(n) && getComputedStyle(n).position === 'fixed' && Math.abs(n.getBoundingClientRect().bottom - window.innerHeight) < 2);
    const bottom = fixedBottom[0]?.getBoundingClientRect().height || 0;
    return {
      viewport: window.innerHeight,
      header: Math.round(header),
      bottomNav: Math.round(bottom),
      usable: Math.round(window.innerHeight - header - bottom),
      headerCount: headers.length,
      bottomNavCount: fixedBottom.length,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      headerRows: headers[0] ? headers[0].querySelectorAll(':scope > div').length : 0,
      railVisibleButtons: [...document.querySelectorAll('[data-floating-utility-rail] button, [data-floating-utility-rail] a')].filter(visible).map((b) => b.getAttribute('aria-label') || b.textContent.trim()),
    };
  });
}

async function clickByLabel(page, label) {
  return page.evaluate((l) => {
    const el = [...document.querySelectorAll('button, a')].find((n) => n.getAttribute('aria-label') === l && n.getBoundingClientRect().width > 0);
    if (!el) return false;
    el.click();
    return true;
  }, label);
}

async function run() {
  const evidence = {};
  for (const vp of VIEWPORTS) {
    const browser = await launch();
    try {
      const page = await openCareer(browser, vp);
      evidence[`inject-${vp.id}`] = await injectCareer(page);
      const out = { pages: {} };
      for (const p of PAGES) {
        await goto(page, p.path, { settle: 2200 });
        await dismissOverlays(page);
        await page.screenshot({ path: resolve(OUT_DIR, `${p.id}-${vp.id}.png`), fullPage: false });
        out.pages[p.id] = await layoutMetrics(page);
        if (p.id === 'race-duplas') {
          out.contrast = {
            eyebrow: await contrastOf(page, 'Sua dupla na Race'),
            badge: await page.evaluate(() => {
              const h3 = [...document.querySelectorAll('h3')].find((n) => n.textContent.includes('&'));
              return h3?.closest('.relative')?.querySelector('.rounded-full')?.textContent?.trim() || null;
            }),
          };
          out.contrast.badgeRatio = out.contrast.badge ? await contrastOf(page, out.contrast.badge) : null;
          out.contrast.reference = await contrastOf(page, 'pontos na Race');
        }
        console.log(`✓ ${p.id}-${vp.id}.png`);
      }
      if (vp.mobile) {
        // Toque 1: ☰. Toque 2: Centro de treinamento.
        await goto(page, '/game', { settle: 1800 });
        await dismissOverlays(page);
        const t1 = await clickByLabel(page, 'Abrir navegação');
        await new Promise((r) => setTimeout(r, 900));
        await page.screenshot({ path: resolve(OUT_DIR, `acesso-rapido-${vp.id}.png`), fullPage: false });
        const t2 = await clickByLabel(page, 'Centro de treinamento');
        await new Promise((r) => setTimeout(r, 1800));
        const trainingUrl = new URL(page.url()).pathname;
        await page.screenshot({ path: resolve(OUT_DIR, `centro-treinamento-${vp.id}.png`), fullPage: false });
        // Gerenciar carreiras fecha a carreira ativa: por último.
        await goto(page, '/game', { settle: 1500 });
        const c1 = await clickByLabel(page, 'Abrir navegação');
        await new Promise((r) => setTimeout(r, 900));
        const c2 = await clickByLabel(page, 'Gerenciar carreiras');
        await new Promise((r) => setTimeout(r, 2500));
        const careersUrl = new URL(page.url()).pathname;
        await page.screenshot({ path: resolve(OUT_DIR, `gerenciar-carreiras-${vp.id}.png`), fullPage: false });
        out.shortcuts = {
          training: { taps: [t1, t2].filter(Boolean).length, landed: trainingUrl },
          careers: { taps: [c1, c2].filter(Boolean).length, landed: careersUrl },
        };
        console.log(`✓ atalhos ${vp.id}: ${JSON.stringify(out.shortcuts)}`);
      }
      out.pageErrors = page.__errors || [];
      evidence[vp.id] = out;
      await page.close();
    } finally {
      await browser.close();
    }
  }
  writeFileSync(resolve(OUT_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 1));
}

run().catch((error) => { console.error(error); process.exit(1); });
