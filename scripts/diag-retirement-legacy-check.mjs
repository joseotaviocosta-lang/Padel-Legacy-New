// Fase 2.6, item 3 — verificação rápida: AthleteCareerLegacy é criado no
// momento da aposentadoria, com campos plausíveis, e SOBREVIVE à poda de
// AthleteProfile (worldSimulationLifecycle.js:pruneOldRetiredAthletes,
// 24 meses) — é exatamente essa sobrevivência que torna a poda seg
// não-destrutiva.
import assert from 'node:assert/strict';
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

const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { getRealAthleteRegistry } = await vite.ssrLoadModule('/src/players/realAthleteRegistry.js');
  const { evolveAthletesMonthly } = await vite.ssrLoadModule('/src/lib/athleteBehavior.js');
  const { simulateWorldDay } = await vite.ssrLoadModule('/src/game-core/worldSimulationLifecycle.js');

  installDeterminism('retirement-legacy-check');
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'legacy-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'legacy-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  let profile = await localGame.entities.PlayerProfile.get('legacy-player');

  const registry = getRealAthleteRegistry();
  for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, 900));

  // Simula até bem além dos 24 meses de poda (3 anos), rodando as funções
  // REAIS mês a mês — igual ao teste de 10 temporadas, mas mais curto e
  // com o foco específico neste item.
  let currentDate = '2026-01-01';
  for (let m = 0; m < 36; m += 1) {
    const previousDate = currentDate;
    const [y, mo] = previousDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo, 1));
    currentDate = next.toISOString().slice(0, 10);
    const isYearBoundary = Number(currentDate.slice(0, 4)) !== Number(previousDate.slice(0, 4));
    // eslint-disable-next-line no-await-in-loop
    await evolveAthletesMonthly(currentDate, { isYearBoundary, profile });
    // eslint-disable-next-line no-await-in-loop
    profile = (await localGame.entities.PlayerProfile.get('legacy-player')) || profile;
    // eslint-disable-next-line no-await-in-loop
    const result = await simulateWorldDay(profile, previousDate, currentDate);
    profile = result.profile || profile;
  }

  const legacyRows = await localGame.entities.AthleteCareerLegacy.list(null, 5000);
  const retiredProfiles = (await localGame.entities.AthleteProfile.filter({ retired: true })) || [];
  const allProfiles = await localGame.entities.AthleteProfile.list(null, 6000);

  console.log(`=== verificação AthleteCareerLegacy (36 meses) ===`);
  console.log(`linhas de legado: ${legacyRows.length}`);
  console.log(`AthleteProfile ainda retired:true (não podados, <24 meses): ${retiredProfiles.length}`);
  console.log(`AthleteProfile total: ${allProfiles.length}`);
  console.log(`exemplo:`, JSON.stringify(legacyRows[0], null, 2));

  assert.ok(legacyRows.length > 0, 'deve ter pelo menos uma linha de legado após 36 meses com aposentadoria ativa');
  const legacyIds = new Set(legacyRows.map((r) => r.athlete_id));
  const profileIds = new Set(allProfiles.map((p) => p.id));
  const survivedPruning = legacyRows.filter((r) => !profileIds.has(r.athlete_id));
  console.log(`linhas de legado cujo AthleteProfile original já foi podado (prova de sobrevivência): ${survivedPruning.length}/${legacyRows.length}`);
  assert.ok(survivedPruning.length > 0, 'pelo menos uma linha de legado deve sobreviver à poda do AthleteProfile original (36 meses > 24 meses de poda)');

  for (const row of legacyRows) {
    assert.ok(row.name, `linha de legado sem nome: ${JSON.stringify(row)}`);
    assert.ok(row.retirement_date, `linha de legado sem retirement_date: ${row.athlete_id}`);
    assert.equal(typeof row.is_real, 'boolean', `is_real não é boolean: ${row.athlete_id}`);
    assert.ok(row.career_titles_by_tier && typeof row.career_titles_by_tier === 'object', `career_titles_by_tier ausente/inválido: ${row.athlete_id}`);
  }

  console.log('PASS — AthleteCareerLegacy gravado corretamente e sobrevive à poda de AthleteProfile.');
  process.exitCode = 0;
} catch (error) {
  console.error('FAIL —', error);
  process.exitCode = 1;
} finally {
  await vite.close();
}
