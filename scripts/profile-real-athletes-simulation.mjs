// Fase 0.2 — Perfilamento do harness de simulação, POR SISTEMA, antes de
// comprometer qualquer baseline longa. Roda 1 temporada em escala de
// produção (970 bots por padrão) usando exatamente o mesmo par de funções
// que a baseline usa (advanceDay + processGameStateDay), mas com o
// profiler de estágios que essas duas funções já aceitam nativamente
// (src/dev/performanceProbe.js:createStageProfiler — já existe em
// produção, usado por game-core/dayAdvanceCoordinator.js; nunca reimplementado
// aqui). Não reimplementa nenhuma lógica de jogo, não altera a baseline.
//
// Uso: node scripts/profile-real-athletes-simulation.mjs [--proceduralAthletes=970]
//   [--proceduralTeams=486] [--days=366] [--seed=profile-v1] [--out=reports/real-athletes-audit]
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const OUT_DIR = args.out || 'reports/real-athletes-audit';
const SEED = String(args.seed || 'profile-v1');
const PROCEDURAL_ATHLETE_SAMPLE = Math.max(1, Number(args.proceduralAthletes || 970));
const PROCEDURAL_TEAM_SAMPLE = Math.max(1, Number(args.proceduralTeams || 486));
const DAYS = Math.max(1, Number(args.days || 366));

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
  return seedInt;
}
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
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
  const { advanceDay } = await vite.ssrLoadModule('/src/lib/career.js');
  const { processGameStateDay } = await vite.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
  const { createStageProfiler } = await vite.ssrLoadModule('/src/dev/performanceProbe.js');
  const { getRealAthleteRegistry, getConfirmedRealPairs, getProbableRealPairs } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const { teamKey } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  const seedInt = installDeterminism(SEED);
  console.log(`Seed: "${SEED}" (hash ${seedInt}) — ${DAYS} dias, ${PROCEDURAL_ATHLETE_SAMPLE} bots procedurais.`);

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'profile-sim' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'profile-sim-player', sport_name: 'Profile Sim', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
    trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
  });
  let profile = await localGame.entities.PlayerProfile.get('profile-sim-player');

  const registry = getRealAthleteRegistry();
  const botIdToAssignedId = new Map();
  for (const athlete of registry) {
    const created = await localGame.entities.AthleteProfile.create({ ...athlete });
    botIdToAssignedId.set(athlete.bot_id, created.id);
  }
  const seedPairs = [...getConfirmedRealPairs().map((p) => ({ ...p, locked: true })), ...getProbableRealPairs().map((p) => ({ ...p, locked: false }))];
  const pairUpdates = [];
  for (const pair of seedPairs) {
    const id1 = botIdToAssignedId.get(pair.a); const id2 = botIdToAssignedId.get(pair.b);
    if (!id1 || !id2) continue;
    await localGame.entities.TeamRanking.create({ team_key: teamKey(id1, id2), player1_id: id1, player2_id: id2, ranking_points: 100, race_points: 0 });
    pairUpdates.push({ id: id1, ai_partner_id: id2, ai_partnership_protected: pair.locked, ai_partnership_status: 'ativa' });
    pairUpdates.push({ id: id2, ai_partner_id: id1, ai_partnership_protected: pair.locked, ai_partnership_status: 'ativa' });
  }
  if (pairUpdates.length) await localGame.entities.AthleteProfile.bulkUpdate(pairUpdates);
  const realTeamKeys = new Set((await localGame.entities.TeamRanking.list(null, 2000)).map((t) => t.id));
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const seededTeams = await localGame.entities.TeamRanking.list('-ranking_points', 600);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, seededTeams);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL_ATHLETE_SAMPLE));
  await localGame.entities.TeamRanking.bulkCreate(supplemental.teams.slice(0, PROCEDURAL_TEAM_SAMPLE));
  console.log(`Elenco pronto: ${registry.length + PROCEDURAL_ATHLETE_SAMPLE} atletas (${registry.length} reais + ${PROCEDURAL_ATHLETE_SAMPLE} procedurais).`);

  // ═══════════════ Perfilamento dia a dia ═══════════════
  const stageTotals = new Map(); // nome do estágio -> {totalMs, calls}
  const dayTotals = []; // {day, date, totalMs, hadTournamentEvent, pruneMs}
  let pruneTotalMs = 0;
  let pruneCalls = 0;
  const recordedTournamentIds = new Set();
  let lastSampledMonth = profile.career_date.slice(0, 7);

  function addStage(name, ms) {
    const entry = stageTotals.get(name) || { totalMs: 0, calls: 0 };
    entry.totalMs += ms;
    entry.calls += 1;
    stageTotals.set(name, entry);
  }

  let oldDate = profile.career_date;
  const overallStart = performance.now();
  for (let day = 0; day < DAYS; day += 1) {
    const dayStart = performance.now();
    const profiler = createStageProfiler();
    try {
      profile = await advanceDay(profile, { profiler });
    } catch (error) {
      console.warn(`[Profile] advanceDay bloqueado em ${oldDate} (dia ${day}):`, error?.message || error);
      break;
    }
    const newDate = profile.career_date;
    const result = await processGameStateDay(profile, oldDate, newDate, { profiler }).catch((error) => {
      console.warn(`[Profile] processGameStateDay falhou em ${newDate}:`, error?.message || error);
      return null;
    });
    profile = result?.profile || profile;
    oldDate = newDate;
    const breakdown = profiler.finish();
    for (const [name, wallMs] of Object.entries(breakdown.stages)) addStage(name, wallMs);

    // Detecta dia-com-torneio olhando se algum Tournament novo foi finalizado.
    const finalizedNow = (await localGame.entities.Tournament.list('-start_date', 2000).catch(() => []))
      .filter((t) => t.world_tour_event && t.status === 'finalizado' && !recordedTournamentIds.has(t.id));
    finalizedNow.forEach((t) => recordedTournamentIds.add(t.id));
    const hadTournamentEvent = finalizedNow.length > 0;

    // Mesma manutenção mensal da baseline oficial (WorldEvent/CareerMessage/
    // TeamRanking/Partnership/AnnualCareerReport/Tournament antigo) — medida
    // separadamente para responder "quanto custa a poda em si".
    let pruneMs = 0;
    const sampledMonth = newDate.slice(0, 7);
    if (sampledMonth !== lastSampledMonth) {
      lastSampledMonth = sampledMonth;
      const pruneStart = performance.now();
      const pruneOps = [];
      const recentEvents = await localGame.entities.WorldEvent.list('-created_date', 5000).catch(() => []);
      recentEvents.slice(300).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'WorldEvent', id: row.id }));
      const recentMessages = await localGame.entities.CareerMessage.list('-created_date', 5000).catch(() => []);
      recentMessages.slice(50).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'CareerMessage', id: row.id }));
      const allTeamRankings = await localGame.entities.TeamRanking.list(null, 20000).catch(() => []);
      allTeamRankings.filter((row) => !realTeamKeys.has(row.id)).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'TeamRanking', id: row.id }));
      const allPartnerships = await localGame.entities.Partnership.list(null, 20000).catch(() => []);
      allPartnerships.filter((row) => row.status !== 'ativa').forEach((row) => pruneOps.push({ type: 'delete', entityName: 'Partnership', id: row.id }));
      const allAnnualReports = await localGame.entities.AnnualCareerReport.list('-year', 200).catch(() => []);
      allAnnualReports.slice(1).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'AnnualCareerReport', id: row.id }));
      const allTournaments = await localGame.entities.Tournament.list(null, 20000).catch(() => []);
      allTournaments
        .filter((row) => recordedTournamentIds.has(row.id) && Number(row.year || String(row.start_date).slice(0, 4)) < Number(sampledMonth.slice(0, 4)) - 1)
        .forEach((row) => pruneOps.push({ type: 'delete', entityName: 'Tournament', id: row.id }));
      for (let i = 0; i < pruneOps.length; i += 500) await localGame.batch(pruneOps.slice(i, i + 500)).catch(() => {});
      pruneMs = performance.now() - pruneStart;
      pruneTotalMs += pruneMs;
      pruneCalls += 1;
    }

    const dayTotalMs = performance.now() - dayStart;
    dayTotals.push({ day, date: newDate, totalMs: round(dayTotalMs, 2), hadTournamentEvent, pruneMs: round(pruneMs, 2) });

    if (day > 0 && day % 30 === 0) {
      const elapsedS = (performance.now() - overallStart) / 1000;
      console.log(`[Profile] dia ${day}/${DAYS} (${newDate}) — ${round(elapsedS, 1)}s decorridos, ${round(elapsedS / day, 3)}s/dia em média.`);
    }
  }
  const overallMs = performance.now() - overallStart;

  // ═══════════════ Relatório ═══════════════
  mkdirSync(OUT_DIR, { recursive: true });
  const stageReport = [...stageTotals.entries()]
    .map(([name, { totalMs, calls }]) => ({ stage: name, totalMs: round(totalMs, 1), calls, avgMsPerCall: round(totalMs / calls, 2), pctOfTotal: round((totalMs / overallMs) * 100, 1) }))
    .sort((a, b) => b.totalMs - a.totalMs);

  const tournamentDays = dayTotals.filter((d) => d.hadTournamentEvent);
  const nonTournamentDays = dayTotals.filter((d) => !d.hadTournamentEvent);
  const avgMs = (rows) => rows.length ? round(rows.reduce((s, r) => s + r.totalMs, 0) / rows.length, 2) : null;

  const report = {
    seed: SEED,
    daysSimulated: dayTotals.length,
    proceduralAthletes: PROCEDURAL_ATHLETE_SAMPLE,
    proceduralTeams: PROCEDURAL_TEAM_SAMPLE,
    totalWallMs: round(overallMs, 1),
    totalWallMinutes: round(overallMs / 60000, 2),
    avgMsPerDay: round(overallMs / dayTotals.length, 2),
    stageBreakdown: stageReport,
    tournamentDaysVsOther: {
      tournamentDays: tournamentDays.length,
      nonTournamentDays: nonTournamentDays.length,
      avgMsTournamentDay: avgMs(tournamentDays),
      avgMsNonTournamentDay: avgMs(nonTournamentDays),
    },
    pruning: {
      totalMs: round(pruneTotalMs, 1),
      calls: pruneCalls,
      avgMsPerCall: pruneCalls ? round(pruneTotalMs / pruneCalls, 2) : null,
      pctOfTotal: round((pruneTotalMs / overallMs) * 100, 2),
    },
    firstMonthAvgMsPerDay: avgMs(dayTotals.slice(0, 30)),
    lastMonthAvgMsPerDay: avgMs(dayTotals.slice(-30)),
  };
  writeFileSync(`${OUT_DIR}/profile-report.json`, JSON.stringify({ ...report, dayTotals }, null, 2));

  console.log('\n=== PERFIL — CUSTO POR SISTEMA (1 temporada) ===');
  console.log(`Total: ${report.totalWallMinutes} min (${dayTotals.length} dias, ${report.avgMsPerDay} ms/dia em média)`);
  console.log('\nEstágio'.padEnd(40), 'Total ms'.padStart(10), '% total'.padStart(9), 'ms/chamada'.padStart(12));
  for (const row of stageReport) {
    console.log(row.stage.padEnd(40), String(row.totalMs).padStart(10), `${row.pctOfTotal}%`.padStart(9), String(row.avgMsPerCall).padStart(12));
  }
  console.log(`\nDias com torneio finalizado: ${tournamentDays.length} (média ${report.tournamentDaysVsOther.avgMsTournamentDay} ms) · sem: ${nonTournamentDays.length} (média ${report.tournamentDaysVsOther.avgMsNonTournamentDay} ms)`);
  console.log(`Poda mensal: ${report.pruning.calls} execuções, ${report.pruning.totalMs} ms total (${report.pruning.pctOfTotal}% do tempo total), ${report.pruning.avgMsPerCall} ms/execução`);
  console.log(`Custo médio por dia — mês 1: ${report.firstMonthAvgMsPerDay} ms · últimos 30 dias: ${report.lastMonthAvgMsPerDay} ms (${report.lastMonthAvgMsPerDay && report.firstMonthAvgMsPerDay ? round(report.lastMonthAvgMsPerDay / report.firstMonthAvgMsPerDay, 2) : '—'}x)`);
  console.log(`\nRelatório salvo em ${OUT_DIR}/profile-report.json`);
} finally {
  await vite.close();
}
