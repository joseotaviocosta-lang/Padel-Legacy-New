// Fase 2.6, item 2 — diagnóstico (não é o perfilamento completo de ~40min):
// mede o custo de processLivingWorldDay POR SUB-ESTÁGIO, separado por
// dia-com-resolução-de-torneio vs dia-sem, chamando a função REAL uma vez
// por dia ao longo de uma temporada inteira (366 dias) — sem rodar os
// outros ~9 sistemas diários que não fazem parte de livingWorld (staff,
// recovery, athleteIntelligence etc.), leve o bastante pra rodar em
// minutos, não dezenas de minutos. Depende do bloco de instrumentação
// TEMPORÁRIO em src/lib/livingWorldEngine.js
// (DIAGNOSE_LIVINGWORLD_SUBSTAGES), documentado e revertido depois desta
// medição — ver FASE-2.6-RELATORIO.md, item 2, pra reaplicar se precisar
// rerodar.
function hashSeed(value) { let h = 2166136261; for (const ch of String(value)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seedInt) { let a = seedInt >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function installDeterminism(seedString) {
  const seedInt = hashSeed(seedString);
  Math.random = mulberry32(seedInt);
  const RealDate = Date;
  let fakeClockMs = new RealDate('2026-01-01T00:00:00.000Z').getTime() + (seedInt % 100000);
  function tick() { fakeClockMs += 1000; return fakeClockMs; }
  class DeterministicDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(tick()); else super(...args); }
    static now() { return tick(); }
  }
  globalThis.Date = DeterministicDate;
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

process.env.DIAGNOSE_LIVINGWORLD_SUBSTAGES = '1';

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const PROCEDURAL = Math.max(1, Number(args.proceduralAthletes || 900));
const SEED = String(args.seed || 'livingworld-substages');

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { getRealAthleteRegistry, getConfirmedRealPairs, getProbableRealPairs } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');
  const { processLivingWorldDay } = await vite.ssrLoadModule('/src/lib/livingWorldEngine.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

  installDeterminism(SEED);
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'livingworld-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'livingworld-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });

  const registry = getRealAthleteRegistry();
  for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL));

  // Pares conhecidos + 3 meses de mercado real rodado, pra ter Partnership
  // ativas plausíveis (resolveCompletedWorldTourEvents só monta chave a
  // partir de Partnership ativa — sem isso, torneio nenhum resolveria e o
  // sub-estágio processWorldTourDay ficaria artificialmente barato).
  const lockedPairs = [...getConfirmedRealPairs().map((p) => ({ ...p, locked: true })), ...getProbableRealPairs().map((p) => ({ ...p, locked: false }))];
  const seedUpdates = [];
  for (const pair of lockedPairs) {
    const a = await localGame.entities.AthleteProfile.get(pair.a);
    const b = await localGame.entities.AthleteProfile.get(pair.b);
    if (!a || !b) continue;
    const common = { ai_partnership_status: 'ativa', ai_partnership_start_date: '2026-01-01', ai_partnership_months: 0, ai_partnership_chemistry: pair.locked ? 88 : 60, ai_partnership_protected: pair.locked, market_status: 'contratado' };
    seedUpdates.push({ id: a.id, ...common, ai_partner_id: b.id, ai_partner_name: b.name });
    seedUpdates.push({ id: b.id, ...common, ai_partner_id: a.id, ai_partner_name: a.name });
  }
  if (seedUpdates.length) await localGame.entities.AthleteProfile.bulkUpdate(seedUpdates);

  let marketProfile = {};
  let marketDate = '2026-01-01';
  for (let m = 0; m < 3; m += 1) {
    const previousDate = marketDate;
    const [y, mo] = marketDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo, 1));
    marketDate = next.toISOString().slice(0, 10);
    // eslint-disable-next-line no-await-in-loop
    const result = await processAiPartnershipMarket(marketProfile, previousDate, marketDate);
    marketProfile = result.profile || marketProfile;
  }

  const allAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1200);
  const rankUpdates = allAthletes.map((a, index) => ({ id: a.id, ranking_position: index + 1 }));
  await localGame.entities.AthleteProfile.bulkUpdate(rankUpdates);

  // createCareer já semeia um horizonte rolante de torneios a partir de
  // career_date (src/lib/career.js) — evita duplicar id: só cria os que
  // ainda não existem (mesmo critério de dedupe que career.js usa, por
  // circuit_code+ano; mesmo fix já aplicado em diag-field-fill.mjs).
  const existingTournaments = await localGame.entities.Tournament.list(null, 2000);
  const existingCodes = new Set(existingTournaments.map((t) => t.circuit_code));
  const tournaments = buildSeasonTournaments(2026, 'livingworld-diag-season');
  const missingTournaments = tournaments.filter((t) => !existingCodes.has(t.circuit_code));
  if (missingTournaments.length) await localGame.entities.Tournament.bulkCreate(missingTournaments);

  const profile = { id: 'livingworld-player' };
  let currentDate = '2026-01-01';
  const totalDays = 366;
  for (let d = 0; d < totalDays; d += 1) {
    // eslint-disable-next-line no-await-in-loop
    await processLivingWorldDay(profile, currentDate);
    const next = new Date(`${currentDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    currentDate = next.toISOString().slice(0, 10);
  }

  const diag = globalThis.__LIVINGWORLD_SUBSTAGE_DIAG__ || [];
  const byLabel = new Map();
  const resolvedDates = new Set();
  for (const row of diag) {
    if (row.resolvedThisCall > 0) resolvedDates.add(row.date);
    if (!byLabel.has(row.label)) byLabel.set(row.label, []);
    byLabel.get(row.label).push(row);
  }

  console.log(`=== custo de processLivingWorldDay por sub-estágio (${totalDays} dias, ${PROCEDURAL} procedurais) ===`);
  console.log(`dias com resolução de torneio: ${resolvedDates.size}/${totalDays}\n`);

  let grandTotal = 0;
  const summaryRows = [];
  for (const [label, rows] of byLabel) {
    const total = rows.reduce((s, r) => s + r.ms, 0);
    grandTotal += total;
    summaryRows.push({ label, total, calls: rows.length, avg: total / rows.length });
  }
  summaryRows.sort((a, b) => b.total - a.total);
  for (const row of summaryRows) {
    console.log(`${row.label}: total=${row.total.toFixed(0)}ms (${(100 * row.total / grandTotal).toFixed(1)}%) | ${row.calls} chamadas | média=${row.avg.toFixed(2)}ms/chamada`);
  }

  console.log(`\ntotal medido (soma dos sub-estágios): ${grandTotal.toFixed(0)}ms\n`);

  console.log('=== dias com torneio vs sem torneio, por sub-estágio ===');
  for (const [label, rows] of byLabel) {
    const withTournament = rows.filter((r) => resolvedDates.has(r.date));
    const withoutTournament = rows.filter((r) => !resolvedDates.has(r.date));
    const avgWith = withTournament.length ? withTournament.reduce((s, r) => s + r.ms, 0) / withTournament.length : 0;
    const avgWithout = withoutTournament.length ? withoutTournament.reduce((s, r) => s + r.ms, 0) / withoutTournament.length : 0;
    console.log(`${label}: média em dia-com-torneio=${avgWith.toFixed(2)}ms (n=${withTournament.length}) | média em dia-sem-torneio=${avgWithout.toFixed(2)}ms (n=${withoutTournament.length})`);
  }

  const totalWithTournamentDays = [...resolvedDates].length;
  const totalCostOnTournamentDays = diag.filter((r) => resolvedDates.has(r.date)).reduce((s, r) => s + r.ms, 0);
  const totalCostOnNonTournamentDays = grandTotal - totalCostOnTournamentDays;
  console.log(`\ncusto total em dias-com-torneio: ${totalCostOnTournamentDays.toFixed(0)}ms (${totalWithTournamentDays} dias, ${(100 * totalCostOnTournamentDays / grandTotal).toFixed(1)}% do total)`);
  console.log(`custo total em dias-sem-torneio: ${totalCostOnNonTournamentDays.toFixed(0)}ms (${totalDays - totalWithTournamentDays} dias, ${(100 * totalCostOnNonTournamentDays / grandTotal).toFixed(1)}% do total)`);
} finally {
  await vite.close();
}
