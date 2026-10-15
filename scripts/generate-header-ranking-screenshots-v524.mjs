// Playthrough 5.24 — evidências visuais:
//  - desktop: 4 views do Ranking + header com os 3 atalhos;
//  - mobile 390 e 360: header em 2 faixas, sem overflow;
//  - Países: número do header do Ranking == número da página de Países.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-524');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { id: 'desktop', width: 1366, height: 768 },
  { id: '390', width: 390, height: 844, mobile: true },
  { id: '360', width: 360, height: 800, mobile: true },
];
const VIEWS = [
  { id: 'mundial-individual', path: '/ranking?scope=world&type=individual' },
  { id: 'mundial-duplas', path: '/ranking?scope=world&type=doubles' },
  { id: 'race-individual', path: '/ranking?scope=race&type=individual' },
  { id: 'race-duplas', path: '/ranking?scope=race&type=doubles' },
];

async function injectCareer(page) {
  return page.evaluate(async () => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const { ensureMyProfile } = await import('/src/lib/padel.js');
    const { startPartnership } = await import('/src/lib/partnershipSystem.js');
    const { ensurePlayerTeamRanking } = await import('/src/lib/teamRanking.js');
    const bots = await import('/src/lib/bots.js');
    const user = await localGame.auth.me();
    const profile = await ensureMyProfile(user);
    const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 40).catch(() => []);
    await Promise.all((athletes || []).slice(0, 30).map((a, i) => localGame.entities.AthleteProfile
      .update(a.id, { race_points: Math.max(0, 900 - i * 25) }).catch(() => null)));
    const pool = bots.BOTS_BY_DIFFICULTY?.avancado || bots.BOTS_BY_DIFFICULTY?.elite || [];
    const bot = pool[0];
    if (!bot) return { ok: false, reason: 'sem bot' };
    const started = await startPartnership(profile, bot, 60, 50);
    const partnerId = started?.partnership?.partner_bot_id;
    if (!partnerId) return { ok: false, reason: 'parceria não formada' };
    await localGame.entities.AthleteProfile.update(partnerId, { world_ranking_points: 978, ranking_points: 978, race_points: 120 }).catch(() => null);
    await localGame.entities.PlayerProfile.update(profile.id, { rank_points: 39, world_ranking_points: 39, race_points: 39 }).catch(() => null);
    const fresh = await localGame.entities.PlayerProfile.get(profile.id);
    const materialized = await ensurePlayerTeamRanking(fresh);
    return { ok: true, partnerId, canonicalPoints: materialized?.points ?? null };
  }).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
}

function overflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth).catch(() => null);
}

function hudCountries(page) {
  return page.evaluate(() => {
    const el = [...document.querySelectorAll('[aria-label]')].find((n) => (n.getAttribute('aria-label') || '').startsWith('países'));
    if (!el) return null;
    // O badge do Ranking é interativo ("países: 17 — abrir"); a página de
    // Países é um span ("países: 17"). Extrai só o número.
    const match = (el.getAttribute('aria-label') || '').match(/(\d[\d.]*)/);
    return match ? match[1] : null;
  }).catch(() => null);
}

async function run() {
  const evidence = {};
  for (const vp of VIEWPORTS) {
    const browser = await launch();
    try {
      const page = await openCareer(browser, vp);
      const injected = await injectCareer(page);
      evidence[`inject-${vp.id}`] = injected;
      const overflows = [];
      for (const view of VIEWS) {
        await goto(page, view.path, { settle: 1800 });
        await dismissOverlays(page);
        await page.screenshot({ path: resolve(OUT_DIR, `${view.id}-${vp.id}.png`), fullPage: false });
        overflows.push(await overflow(page));
        console.log(`✓ ${view.id}-${vp.id}.png`);
      }
      evidence[`overflow-${vp.id}`] = overflows;
      // Header em 2 faixas no mobile.
      if (vp.mobile) {
        await goto(page, '/game', { settle: 1500 });
        // O guia de onboarding (primeira visita à Home) cobre o header;
        // avança/fecha antes de fotografar.
        for (let i = 0; i < 6; i += 1) {
          const closed = await page.evaluate(() => {
            const btns = [...document.querySelectorAll('button')];
            const next = btns.find((b) => /Ver próximo passo|Começar|Entendi|Fechar|Pular|Concluir/i.test((b.textContent || '').trim()));
            if (next) { next.click(); return true; }
            const x = document.querySelector("[aria-label*=Fechar], [aria-label*=fechar], [aria-label*=Close]");
            if (x) { x.click(); return true; }
            return false;
          }).catch(() => false);
          if (!closed) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        await dismissOverlays(page);
        await page.screenshot({ path: resolve(OUT_DIR, `header-${vp.id}.png`), fullPage: false });
        console.log(`✓ header-${vp.id}.png (overflow ${await overflow(page)})`);
      }
      await page.close();
    } finally {
      await browser.close();
    }
  }

  // Países: header do Ranking x página de Países na MESMA sessão.
  {
    const browser = await launch();
    try {
      const page = await openCareer(browser, VIEWPORTS[0]);
      await goto(page, '/ranking?scope=world&type=individual', { settle: 1800 });
      const headerCount = await hudCountries(page);
      await page.screenshot({ path: resolve(OUT_DIR, 'paises-header-ranking-desktop.png'), fullPage: false });
      await goto(page, '/world/directory?tab=countries', { settle: 1800 });
      const pageCount = await hudCountries(page);
      await page.screenshot({ path: resolve(OUT_DIR, 'paises-pagina-desktop.png'), fullPage: false });
      evidence.countries = { headerCount, pageCount, match: headerCount === pageCount };
      console.log(`✓ países: header=${headerCount} página=${pageCount} match=${headerCount === pageCount}`);
      await page.close();
    } finally {
      await browser.close();
    }
  }

  writeFileSync(resolve(OUT_DIR, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log('\nEvidências: reports/screenshots-524/');
}

run().catch((error) => { console.error(error); process.exit(1); });
