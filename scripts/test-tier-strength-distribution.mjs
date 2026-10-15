// Playthrough 5.0, Parte J/X — auditoria empírica da distribuição de força
// por tier: Masters > Gold > Silver > Bronze em força média do campo.
// Usa o calendário REAL (AI-only, WorldTourLifecycle) depois de avançar a
// carreira o suficiente para vários torneios de cada tier serem sorteados
// e resolvidos — nunca dados sintéticos "de mentirinha". `draw_pair_ids`
// (Tournament, escrito só pelo settlement AI-only) é a fonte ID-based do
// campo completo de cada torneio; ranking/OVR vêm de AthleteProfile pelos
// mesmos IDs — nunca por nome.
//
// Escopo consciente: o detalhamento POR RODADA (força média R16→QF→SF→F)
// para torneios AI-only puros exigiria rastrear IDs por rodada em
// bracket_history, que hoje só grava nomes (mesma limitação documentada
// na Parte A/E desta fase) — mudar isso é uma alteração de estrutura de
// chave fora do escopo autorizado (Parte Z: bracket graph). A progressão
// por rodada já é coberta, com IDs reais, por
// test-opponent-strength-by-round.mjs (mesmo motor de seeding,
// buildSeededDrawSlots, usado tanto no preview do jogador quanto no
// AI-only — Parte K: nunca reescrito aqui).
import assert from 'node:assert/strict';
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}
globalThis.location = { hostname: '127.0.0.1', pathname: '/test-tier-strength-distribution', search: '' };
globalThis.window = { location: globalThis.location, dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
  const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
  const { resolveCompletedWorldTourEvents, ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processWorldCircuit } = await vite.ssrLoadModule('/src/game-core/circuitLifecycle.js');

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  activeCareerAdapter.clearActiveCareer();
  const { career } = await manager.createCareer({ saveName: '5.0 Tier Strength', playerName: 'TierStrength' });
  activeCareerAdapter.setActiveCareer(career);
  let profile = await activeCareerAdapter.createPlayerProfile({ id: 'tier-strength-player', sport_name: 'TierStrength', career_date: '2026-01-01', birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0 });

  await ensureWorldSeed2025();
  await ensureFutureTournaments('2026-01-01');

  // Avança o relógio do mundo (sorteio + settlement AI-only + o recálculo
  // SEMANAL de ranking_position, processWorldCircuit — sem isso,
  // ranking_position de quem está fora do top 50 nunca atualiza,
  // Playthrough 5.0 Parte B/M, achado da auditoria) por ~1 ano.
  let previousDate = '2026-01-01';
  let date = '2026-01-01';
  const end = '2026-12-31';
  while (date < end) {
    const next = new Date(`${date}T00:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
    previousDate = date;
    date = next.toISOString().slice(0, 10);
    await ensureWorldTourDraws(date).catch(() => null);
    await resolveCompletedWorldTourEvents(date).catch(() => null);
    const circuitResult = await processWorldCircuit(profile, previousDate, date).catch(() => null);
    if (circuitResult?.profile) profile = circuitResult.profile;
  }

  const tournaments = await localGame.entities.Tournament.list('start_date', 3000);
  const tiers = ['Bronze', 'Silver', 'Gold', 'Masters'];
  const byTier = {};
  for (const tier of tiers) {
    byTier[tier] = tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length > 0 && t.champion);
  }

  console.log('torneios resolvidos por tier:', Object.fromEntries(tiers.map((t) => [t, byTier[t].length])));

  const athletes = await localGame.entities.AthleteProfile.list(null, 3000);
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  // draw_pair_ids guarda IDs de PARTNERSHIP (formato
  // `partnership-{athleteA}-{athleteB}-{data}`, WorldTourLifecycle.js),
  // não IDs de atleta direto — resolve via a própria entidade Partnership
  // (nunca por parsing de string), depois cruza athlete_a_id/athlete_b_id
  // com AthleteProfile.
  const allPartnerships = await localGame.entities.Partnership.list(null, 3000).catch(() => []);
  const partnershipById = new Map(allPartnerships.map((p) => [p.id, p]));

  const tierStats = {};
  for (const tier of tiers) {
    const ranks = []; const ovrs = [];
    for (const tournament of byTier[tier]) {
      for (const pairId of tournament.draw_pair_ids) {
        const partnership = partnershipById.get(pairId);
        const athleteIds = partnership ? [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean) : [];
        for (const id of athleteIds) {
          const athlete = athleteById.get(id);
          if (!athlete) continue;
          if (Number(athlete.ranking_position) > 0) ranks.push(Number(athlete.ranking_position));
          if (Number(athlete.overall_rating) > 0) ovrs.push(Number(athlete.overall_rating));
        }
      }
    }
    ranks.sort((a, b) => a - b);
    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const median = (arr) => arr.length ? arr[Math.floor(arr.length / 2)] : null;
    tierStats[tier] = {
      tournaments: byTier[tier].length,
      avgRank: avg(ranks), medianRank: median(ranks), bestRank: ranks[0] ?? null, worstRank: ranks[ranks.length - 1] ?? null,
      avgOVR: avg(ovrs),
    };
  }

  console.log('\n=== Playthrough 5.0, Parte J — distribuição de força por tier ===');
  for (const tier of tiers) {
    const s = tierStats[tier];
    console.log(`${tier}: torneios=${s.tournaments} avgRank=${s.avgRank?.toFixed(0)} medianRank=${s.medianRank} bestRank=${s.bestRank} worstRank=${s.worstRank} avgOVR=${s.avgOVR?.toFixed(1)}`);
  }

  let passed = 0; let failed = 0;
  const PASS = '\x1b[32m✓\x1b[0m'; const FAIL = '\x1b[31m✗\x1b[0m';
  function check(label, condition) {
    if (condition) { passed += 1; console.log(`${PASS} ${label}`); }
    else { failed += 1; console.log(`${FAIL} ${label}`); }
  }

  check(`pelo menos alguns torneios resolvidos por tier (amostra real, não vazia)`, tiers.every((t) => tierStats[t].tournaments > 0));
  // Rank NUMÉRICO menor = melhor colocado. "Masters mais forte" = avgRank
  // MENOR que Gold/Silver/Bronze (ranking_position 1 é o topo do mundo).
  if (tierStats.Masters.avgRank != null && tierStats.Gold.avgRank != null) {
    check('Masters é mais forte que Gold (rank médio menor = melhores atletas)', tierStats.Masters.avgRank < tierStats.Gold.avgRank);
  }
  if (tierStats.Gold.avgRank != null && tierStats.Silver.avgRank != null) {
    check('Gold é mais forte que Silver', tierStats.Gold.avgRank < tierStats.Silver.avgRank);
  }
  if (tierStats.Silver.avgRank != null && tierStats.Bronze.avgRank != null) {
    check('Silver é mais forte que Bronze', tierStats.Silver.avgRank < tierStats.Bronze.avgRank);
  }
  if (tierStats.Masters.avgOVR != null && tierStats.Bronze.avgOVR != null) {
    check('Masters tem OVR médio maior que Bronze', tierStats.Masters.avgOVR > tierStats.Bronze.avgOVR);
  }

  console.log(`\n=== Resultado: ${passed} passed, ${failed} failed ===\n`);
  if (failed > 0) process.exitCode = 1;
  else console.log('test-tier-strength-distribution: PASS');
} finally {
  await vite.close();
}
