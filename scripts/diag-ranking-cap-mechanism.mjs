// Fase 1.5, item 1 — mede (não corrige) se o teto de 500 de
// `AthleteProfile.list('ranking_position', 500)` exclui os 24 reais do
// mercado de parcerias em algum momento da temporada 1, e por quê.
// Roda o caminho REAL e completo (advanceDay + processGameStateDay, todas
// as ~10 fases diárias, incluindo processWorldCircuit — que também usa o
// MESMO list('ranking_position',500), achado novo desta medição) dia a
// dia, como o harness oficial (audit-real-athletes-simulation.mjs), com a
// mesma poda de memória. Intercepta CareerEntityRepository.prototype.list
// (não dá pra interceptar entities.AthleteProfile.list — é um Proxy que
// cria um adapter novo a cada acesso) e amostra, uma vez por mês
// calendário, quais dos 24 reais aparecem na lista de 500 e qual o
// ranking_position de cada um (presente ou não na lista).
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };
import { writeFileSync, mkdirSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const PROCEDURAL_ATHLETE_SAMPLE = Math.max(1, Number(args.proceduralAthletes || 970));
const PROCEDURAL_TEAM_SAMPLE = Math.max(1, Number(args.proceduralTeams || 486));
const SEED = String(args.seed || 'ranking-cap-diag');
const OUT_DIR = args.out || 'reports/real-athletes-audit';
const DAYS = Math.max(1, Number(args.days || 367));

function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seedInt) { let a = seedInt >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function installDeterminism(seedString) {
  const seedInt = hashSeed(seedString);
  Math.random = mulberry32(seedInt);
  const RealDate = Date;
  let fakeClockMs = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (seedInt % 100000);
  function tick() { fakeClockMs += 1000; return fakeClockMs; }
  class DeterministicDate extends RealDate {
    constructor(...ctorArgs) { if (ctorArgs.length === 0) super(tick()); else super(...ctorArgs); }
    static now() { return tick(); }
  }
  globalThis.Date = DeterministicDate;
  return seedInt;
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
  async list() { return [...this.files.keys()]; }
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
  const { CareerEntityRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');

  // instrumentação: só observa, não transforma nada (achado 1, não a correção)
  const rankingPositionListCalls = { AthleteProfile: 0 };
  const originalList = CareerEntityRepository.prototype.list;
  CareerEntityRepository.prototype.list = async function patchedList(entityName, sort, limit) {
    const rows = await originalList.call(this, entityName, sort, limit);
    if (entityName === 'AthleteProfile' && sort === 'ranking_position') rankingPositionListCalls.AthleteProfile += 1;
    return rows;
  };

  const seedInt = installDeterminism(SEED);
  console.log(`Seed: "${SEED}" (hash ${seedInt}) — ${PROCEDURAL_ATHLETE_SAMPLE} bots procedurais, ${DAYS} dias.`);

  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'ranking-cap-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'diag-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
    trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
  });
  let currentProfile = await localGame.entities.PlayerProfile.get('diag-player');

  const realAthleteIds = new Map(); // id -> nome
  for (const athlete of worldSeed.athletes) {
    const created = await localGame.entities.AthleteProfile.create({ ...athlete });
    realAthleteIds.set(created.id, created.name);
  }
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplementalFull = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplementalFull.athletes.slice(0, PROCEDURAL_ATHLETE_SAMPLE));
  void PROCEDURAL_TEAM_SAMPLE;

  console.log(`Elenco: ${realAthleteIds.size} reais + ${PROCEDURAL_ATHLETE_SAMPLE} procedurais.`);

  const monthlySamples = [];
  let lastSampledMonth = null;
  let currentDate = '2026-01-01';

  for (let day = 0; day < DAYS; day += 1) {
    currentProfile = await advanceDay(currentProfile, {});
    const newDate = currentProfile.career_date;
    // eslint-disable-next-line no-await-in-loop
    await processGameStateDay(currentProfile, currentDate, newDate).catch((err) => console.error(`[dia ${day}]`, err?.message || err));
    currentDate = newDate;

    const month = currentDate.slice(0, 7);
    if (month !== lastSampledMonth) {
      lastSampledMonth = month;
      // eslint-disable-next-line no-await-in-loop
      const top500 = await localGame.entities.AthleteProfile.list('ranking_position', 500);
      const top500Ids = new Set(top500.map((row) => row.id));
      // eslint-disable-next-line no-await-in-loop
      const realRows = await Promise.all([...realAthleteIds.keys()].map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)));
      const reals = realRows.filter(Boolean).map((row) => ({
        name: row.name,
        ranking_position: row.ranking_position ?? null,
        world_ranking_points: row.world_ranking_points ?? null,
        in_top500: top500Ids.has(row.id),
      }));
      const presentCount = reals.filter((r) => r.in_top500).length;
      monthlySamples.push({ month, day, presentCount, totalReals: reals.length, reals });
      console.log(`[${month}] dia ${day}: ${presentCount}/${reals.length} reais dentro do top-500 de ranking_position.`);

      // poda de memória (mesmo esquema do harness oficial) pra não estourar heap numa temporada inteira
      const pruneOps = [];
      const recentEvents = await localGame.entities.WorldEvent.list('-created_date', 5000).catch(() => []);
      recentEvents.slice(300).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'WorldEvent', id: row.id }));
      const recentMessages = await localGame.entities.CareerMessage.list('-created_date', 5000).catch(() => []);
      recentMessages.slice(50).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'CareerMessage', id: row.id }));
      const realTeamKeysNone = new Set();
      const allTeamRankings = await localGame.entities.TeamRanking.list(null, 20000).catch(() => []);
      allTeamRankings.filter((row) => !realTeamKeysNone.has(row.id)).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'TeamRanking', id: row.id }));
      const allPartnerships = await localGame.entities.Partnership.list(null, 20000).catch(() => []);
      allPartnerships.filter((row) => row.status !== 'ativa').forEach((row) => pruneOps.push({ type: 'delete', entityName: 'Partnership', id: row.id }));
      const allAnnualReports = await localGame.entities.AnnualCareerReport.list('-year', 200).catch(() => []);
      allAnnualReports.slice(1).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'AnnualCareerReport', id: row.id }));
      for (let i = 0; i < pruneOps.length; i += 500) await localGame.batch(pruneOps.slice(i, i + 500)).catch(() => {});
    }
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(`${OUT_DIR}/ranking-cap-diagnostic-${PROCEDURAL_ATHLETE_SAMPLE}bots.json`, JSON.stringify({
    seed: SEED, proceduralAthletes: PROCEDURAL_ATHLETE_SAMPLE, days: DAYS,
    athleteProfileListRankingPositionCalls: rankingPositionListCalls.AthleteProfile,
    monthlySamples,
  }, null, 2));
  console.log(`Relatório: ${OUT_DIR}/ranking-cap-diagnostic-${PROCEDURAL_ATHLETE_SAMPLE}bots.json`);

  CareerEntityRepository.prototype.list = originalList;
} finally {
  await vite.close();
}
