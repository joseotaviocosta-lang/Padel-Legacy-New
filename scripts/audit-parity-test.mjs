// Fase 0.1 — Teste de paridade: harness vs. caminho de produção real.
//
// Roda a MESMA temporada (mesmo elenco, mesma seed) por dois caminhos:
//  (H) o harness de auditoria (audit-real-athletes-simulation.mjs): chama
//      só processAiPartnershipMarket + resolveCompletedWorldTourEvents, em
//      passos de calendário maiores.
//  (P) o caminho real do jogo: advanceDay (career.js) + processGameStateDay
//      (gameStateLifecycle.js) — o MESMO par de funções que
//      advanceCareerDayWork (game-core/calendarLifecycle.js) chama a cada
//      clique de "avançar dia" — DIA A DIA, incluindo todos os sistemas
//      diários que o harness NÃO chama (simulateWorldDay, processWorldCircuit,
//      processCircuitLifeWeek, etc.) e o calendário gerado pela mesma
//      ensureFutureTournaments (só no boundary de mês, como em produção).
//
// Compara campeão a campeão (por id de torneio, determinístico via
// createTournamentEditionId) entre os dois universos.
//
// Escala reduzida (ver --proceduralAthletes) para viabilizar rodar (P) —
// que paga o custo de ~365 processGameStateDay/ano, muito mais caro que os
// ~26 passos/ano do harness — em tempo prático. Isso é uma limitação
// disclosed do teste, não do harness em si.
import { writeFileSync, mkdirSync } from 'node:fs';
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const SEED = String(args.seed || 'parity-v1');
const PROCEDURAL_ATHLETES = Math.max(1, Number(args.proceduralAthletes || 80));
const PROCEDURAL_TEAMS = Math.max(1, Number(args.proceduralTeams || 40));
const STEP_DAYS_H = Math.max(1, Number(args.stepDaysHarness || 14));
const OUT_DIR = args.out || 'reports/real-athletes-audit';
const YEAR = 2026;

function hashSeed(value) {
  let h = 2166136261;
  for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seedInt) {
  let a = seedInt >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function installDeterminism(seedString) {
  const seedInt = hashSeed(seedString);
  Math.random = mulberry32(seedInt);
  const RealDate = Date;
  let fakeClockMs = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (seedInt % 100000);
  function tick() { fakeClockMs += 1000; return fakeClockMs; }
  class DeterministicDate extends RealDate {
    constructor(...ctorArgs) {
      if (ctorArgs.length === 0) super(tick());
      else super(...ctorArgs);
    }
    static now() { return tick(); }
  }
  globalThis.Date = DeterministicDate;
}
function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'memory'; }
  async ensureDirectory(p) { this.directories.add(p); return true; }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { return this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); return d; }
  async copy(s, d) { this.files.set(d, this.files.get(s)); return d; }
  async list(dir = '.') { return [...this.files.keys()]; }
  async stat(p) { return { size: this.files.get(p)?.length || 0 }; }
}

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { resolveCompletedWorldTourEvents } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');
  const { advanceDay } = await vite.ssrLoadModule('/src/lib/career.js');
  const { processGameStateDay } = await vite.ssrLoadModule('/src/game-core/gameStateLifecycle.js');

  async function seedUniverse(label) {
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ playerName: label });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: `${label}-player`, sport_name: label, career_date: `${YEAR}-01-01`, birth_date: '2000-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
      tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
      energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
    });
    const profile = await localGame.entities.PlayerProfile.get(`${label}-player`);

    for (const athlete of worldSeed.athletes) await localGame.entities.AthleteProfile.create({ ...athlete });
    for (const team of worldSeed.teams) {
      const p1 = (await localGame.entities.AthleteProfile.filter({ bot_id: team.player1_id }))[0];
      const p2 = (await localGame.entities.AthleteProfile.filter({ bot_id: team.player2_id }))[0];
      await localGame.entities.TeamRanking.create({ ...team, player1_id: p1?.id || team.player1_id, player2_id: p2?.id || team.player2_id });
    }
    const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
    const seededTeams = await localGame.entities.TeamRanking.list('-ranking_points', 600);
    const supplemental = buildSupplementalRankingPopulation(seededAthletes, seededTeams);
    await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL_ATHLETES));
    await localGame.entities.TeamRanking.bulkCreate(supplemental.teams.slice(0, PROCEDURAL_TEAMS));
    return { manager, profile };
  }

  async function championsSnapshot() {
    const tournaments = await localGame.entities.Tournament.list('-start_date', 2000);
    const rows = [];
    for (const t of tournaments.filter((x) => x.world_tour_event && x.status === 'finalizado')) {
      rows.push({ id: t.id, tier: t.tier, champion: t.champion || null, runner_up: t.runner_up || null });
    }
    return rows.sort((a, b) => a.id.localeCompare(b.id));
  }

  // ═══════════════ Universo H — estilo harness (audit-real-athletes-simulation.mjs) ═══════════════
  installDeterminism(SEED);
  const uniH = await seedUniverse('uniH');
  {
    const seasonTournaments = buildSeasonTournaments(YEAR, `season-${YEAR}`);
    const existingIds = new Set((await localGame.entities.Tournament.list('-start_date', 2000)).map((t) => t.id));
    const newTournaments = seasonTournaments.filter((t) => !existingIds.has(t.id));
    if (newTournaments.length) await localGame.entities.Tournament.bulkCreate(newTournaments);
    let cursor = `${YEAR}-01-01`;
    const steps = Math.ceil(366 / STEP_DAYS_H) + 1;
    for (let step = 1; step <= steps; step += 1) {
      const previousCursor = cursor;
      cursor = addDays(cursor, STEP_DAYS_H);
      if (cursor.slice(0, 4) !== String(YEAR) && step > Math.floor(340 / STEP_DAYS_H)) break;
      await processAiPartnershipMarket(uniH.profile, previousCursor, cursor).catch(() => {});
      await resolveCompletedWorldTourEvents(cursor).catch(() => {});
    }
  }
  const snapshotH = await championsSnapshot();
  console.log(`Universo H (harness): ${snapshotH.length} torneios finalizados.`);

  // ═══════════════ Universo P — caminho real de produção, dia a dia ═══════════════
  installDeterminism(SEED); // reseta o relógio/rng para o MESMO ponto de partida
  const uniP = await seedUniverse('uniP');
  {
    let profile = uniP.profile;
    let oldDate = profile.career_date;
    for (let day = 0; day < 366; day += 1) {
      try {
        profile = await advanceDay(profile, { deferGlobalProcessing: false });
      } catch (error) {
        console.warn(`[Universo P] advanceDay bloqueado no dia ${day} (${oldDate}):`, error?.message || error);
        break;
      }
      const newDate = profile.career_date;
      const result = await processGameStateDay(profile, oldDate, newDate).catch((error) => {
        console.warn(`[Universo P] processGameStateDay falhou em ${newDate}:`, error?.message || error);
        return null;
      });
      profile = result?.profile || profile;
      oldDate = newDate;
      if (newDate.slice(0, 4) !== String(YEAR)) break;
    }
  }
  const snapshotP = await championsSnapshot();
  console.log(`Universo P (produção, dia a dia): ${snapshotP.length} torneios finalizados.`);

  // ═══════════════ Comparação ═══════════════
  const byIdH = new Map(snapshotH.map((r) => [r.id, r]));
  const byIdP = new Map(snapshotP.map((r) => [r.id, r]));
  const allIds = new Set([...byIdH.keys(), ...byIdP.keys()]);
  const rows = [];
  let matches = 0;
  let onlyH = 0;
  let onlyP = 0;
  let differ = 0;
  for (const id of [...allIds].sort()) {
    const h = byIdH.get(id);
    const p = byIdP.get(id);
    let status;
    if (h && p) { status = h.champion === p.champion ? 'match' : 'differ'; if (status === 'match') matches += 1; else differ += 1; }
    else if (h && !p) { status = 'only_H'; onlyH += 1; }
    else { status = 'only_P'; onlyP += 1; }
    rows.push({ id, tier: (h || p)?.tier, championH: h?.champion || null, championP: p?.champion || null, status });
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/parity-test.json`, JSON.stringify({
    seed: SEED, proceduralAthletes: PROCEDURAL_ATHLETES, proceduralTeams: PROCEDURAL_TEAMS,
    stepDaysHarness: STEP_DAYS_H, totalTournamentsH: snapshotH.length, totalTournamentsP: snapshotP.length,
    matches, differ, onlyH, onlyP, rows,
  }, null, 2));

  console.log('\n=== PARIDADE ===');
  console.log(`Torneios finalizados — H: ${snapshotH.length} · P: ${snapshotP.length}`);
  console.log(`Mesmo campeão (match): ${matches}`);
  console.log(`Campeão diferente (differ): ${differ}`);
  console.log(`Só finalizado em H: ${onlyH}`);
  console.log(`Só finalizado em P: ${onlyP}`);
  if (differ) console.log('Torneios com campeão diferente:', rows.filter((r) => r.status === 'differ').map((r) => `${r.id} (${r.tier}): H=${r.championH} / P=${r.championP}`).join('\n  '));
  console.log(`\nRelatório salvo em ${OUT_DIR}/parity-test.json`);
} finally {
  await vite.close();
}
