// Playthrough 5.23, Parte AE — as QUATRO views (Mundial/Race ×
// Individual/Duplas) em desktop, 390 e 360, mais Race/Duplas perto do corte
// e o estado sem dupla.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-523');
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

async function injectCareer(page, { playerWorld = 39, partnerWorld = 978, playerRace = 39, partnerRace = 120, seedRace = true } = {}) {
  return page.evaluate(async ({ playerWorld, partnerWorld, playerRace, partnerRace, seedRace }) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const { ensureMyProfile } = await import('/src/lib/padel.js');
    const { startPartnership } = await import('/src/lib/partnershipSystem.js');
    const { ensurePlayerTeamRanking } = await import('/src/lib/teamRanking.js');
    const bots = await import('/src/lib/bots.js');
    const user = await localGame.auth.me();
    const profile = await ensureMyProfile(user);

    // Popula a Race individual (senão a temporada nasce sem pontos).
    if (seedRace) {
      const athletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 40).catch(() => []);
      await Promise.all((athletes || []).slice(0, 30).map((a, i) => localGame.entities.AthleteProfile
        .update(a.id, { race_points: Math.max(0, 900 - i * 25) }).catch(() => null)));
    }

    const pool = bots.BOTS_BY_DIFFICULTY?.avancado || bots.BOTS_BY_DIFFICULTY?.elite || [];
    const bot = pool[0];
    if (!bot) return { ok: false, reason: 'sem bot' };
    const started = await startPartnership(profile, bot, 60, 50);
    const partnerId = started?.partnership?.partner_bot_id;
    if (!partnerId) return { ok: false, reason: 'parceria não formada' };
    await localGame.entities.AthleteProfile.update(partnerId, {
      world_ranking_points: partnerWorld, ranking_points: partnerWorld, race_points: partnerRace,
    }).catch(() => null);
    await localGame.entities.PlayerProfile.update(profile.id, {
      rank_points: playerWorld, world_ranking_points: playerWorld, race_points: playerRace,
    }).catch(() => null);
    const fresh = await localGame.entities.PlayerProfile.get(profile.id);
    const materialized = await ensurePlayerTeamRanking(fresh);
    return { ok: true, partnerId, canonicalPoints: materialized?.points ?? null };
  }, { playerWorld, partnerWorld, playerRace, partnerRace, seedRace }).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
}

async function shoot(page, name) {
  await dismissOverlays(page);
  await page.screenshot({ path: resolve(OUT_DIR, name), fullPage: false });
  console.log(`✓ ${name}`);
}

async function run() {
  const results = {};
  // 1) Carreira com parceria e Race populada: quatro views por viewport.
  for (const vp of VIEWPORTS) {
    const browser = await launch();
    try {
      const page = await openCareer(browser, vp);
      const injected = await injectCareer(page);
      results[`inject-${vp.id}`] = injected;
      for (const view of VIEWS) {
        await goto(page, view.path, { settle: 1800 });
        await shoot(page, `${view.id}-${vp.id}.png`);
      }
      await page.close();
    } finally {
      await browser.close();
    }
  }

  // 2) Sem dupla ativa (carreira nova, sem parceria).
  {
    const browser = await launch();
    try {
      const page = await openCareer(browser, VIEWPORTS[0]);
      for (const view of [VIEWS[1], VIEWS[3]]) {
        await goto(page, view.path, { settle: 1500 });
        await shoot(page, `${view.id}-sem-dupla-desktop.png`);
      }
      await page.close();
    } finally {
      await browser.close();
    }
  }

  // 3) Mundial/Duplas perto do corte Top 8 (soma ~12.539).
  {
    const browser = await launch();
    try {
      const page = await openCareer(browser, VIEWPORTS[0]);
      await injectCareer(page, { playerWorld: 39, partnerWorld: 12500, playerRace: 39, partnerRace: 60, seedRace: false });
      await goto(page, VIEWS[1].path, { settle: 1800 });
      await shoot(page, 'mundial-duplas-perto-do-corte-desktop.png');
      await page.close();
    } finally {
      await browser.close();
    }
  }

  writeFileSync(resolve(OUT_DIR, 'measurements.json'), JSON.stringify(results, null, 2));
  console.log('\nCapturas em reports/screenshots-523/');
}

run().catch((error) => { console.error(error); process.exit(1); });
