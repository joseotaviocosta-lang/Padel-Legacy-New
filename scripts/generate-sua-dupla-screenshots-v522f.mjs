// Playthrough 5.22-F, Parte 3 — screenshot REAL do card "Sua dupla", com
// parceiro ativo e pontos canônicos, em desktop e 390. Captura também o caso
// 0 + 0 -> "Sem ranking".
//
// A parceria é formada pelo caminho de PRODUÇÃO (startPartnership +
// materializeTeamRankingForPair), não por fixture de tela: o card fotografado
// é o mesmo que o jogo mostra.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { launch, goto, dismissOverlays, openCareer } from './lib/auditSession.mjs';

const OUT_DIR = resolve('reports/screenshots-522f');
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { id: 'desktop', width: 1366, height: 768 },
  { id: '390', width: 390, height: 844, mobile: true },
  { id: '360', width: 360, height: 800, mobile: true },
];
const SCENARIOS = [
  { id: 'sua-dupla-39', playerPoints: 39, partnerPoints: 0 },
  { id: 'sua-dupla-zero-zero', playerPoints: 0, partnerPoints: 0 },
];

async function injectPartnership(page, playerPoints, partnerPoints) {
  return page.evaluate(async ({ playerPoints, partnerPoints }) => {
    const { localGame } = await import('/src/api/localGameClient.js');
    const { ensureMyProfile } = await import('/src/lib/padel.js');
    const { startPartnership } = await import('/src/lib/partnershipSystem.js');
    const { materializeTeamRankingForPair } = await import('/src/lib/teamRanking.js');
    const bots = await import('/src/lib/bots.js');
    const user = await localGame.auth.me();
    const profile = await ensureMyProfile(user);
    const pool = bots.BOTS_BY_DIFFICULTY?.avancado || bots.BOTS_BY_DIFFICULTY?.elite || [];
    const bot = pool[0];
    if (!bot) return { ok: false, reason: 'sem bot' };
    const started = await startPartnership(profile, bot, 60, 50);
    const partnerId = started?.partnership?.partner_bot_id;
    if (!partnerId) return { ok: false, reason: 'parceria não formada' };
    await localGame.entities.AthleteProfile.update(partnerId, {
      world_ranking_points: partnerPoints, ranking_points: partnerPoints,
    }).catch(() => null);
    await localGame.entities.PlayerProfile.update(profile.id, {
      rank_points: playerPoints, world_ranking_points: playerPoints,
    }).catch(() => null);
    const freshProfile = await localGame.entities.PlayerProfile.get(profile.id);
    const partnerAthlete = await localGame.entities.AthleteProfile.get(partnerId);
    await materializeTeamRankingForPair(freshProfile, { ...(partnerAthlete || {}), id: partnerId });
    return { ok: true, partnerId, playerPoints, partnerPoints };
  }, { playerPoints, partnerPoints }).catch((error) => ({ ok: false, reason: String(error?.message || error) }));
}

async function measurePairCard(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll('p, h3')];
    const target = nodes.find((n) => (n.textContent || '').trim().toLowerCase().startsWith('sua dupla'));
    if (!target) return null;
    const block = target.closest('[class*="rounded-2xl"]') || target.parentElement;
    const rect = block.getBoundingClientRect();
    const text = block.innerText || '';
    return { height: Math.round(rect.height), text: text.split('\n').slice(0, 12).join(' | ') };
  }).catch(() => null);
}

async function run() {
  const results = {};
  // Um navegador (e portanto um storage) por cenário: o shim do Tauri guarda
  // a carreira no mesmo origin, então cenários no mesmo browser compartilham
  // o save e o segundo herdaria a parceria do primeiro.
  for (const scenario of SCENARIOS) {
    const browser = await launch();
    try {
      for (const vp of VIEWPORTS) {
        const page = await openCareer(browser, vp);
        const injected = await injectPartnership(page, scenario.playerPoints, scenario.partnerPoints);
        await goto(page, '/ranking?tab=teams', { settle: 2200 });
        await dismissOverlays(page);
        const name = `${scenario.id}-${vp.id}.png`;
        await page.screenshot({ path: resolve(OUT_DIR, name), fullPage: false });
        const measured = await measurePairCard(page);
        results[name] = { injected, measured };
        console.log(`✓ ${name}${measured ? ` (card ${measured.height}px)` : ' (card não encontrado)'} ${injected.ok ? '' : `[${injected.reason}]`}`);
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }
  writeFileSync(resolve(OUT_DIR, 'measurements.json'), JSON.stringify(results, null, 2));
  console.log('\nMedições: reports/screenshots-522f/measurements.json');
}

run().catch((error) => { console.error(error); process.exit(1); });
