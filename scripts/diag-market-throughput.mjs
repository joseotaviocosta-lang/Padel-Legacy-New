// Fase 2.5, item 1.3 — diagnóstico (não corrige nada): mede a vazão do
// mercado de parcerias (processAiPartnershipMarket, função REAL) — pares
// formados/dissolvidos por mês, e quantos atletas permanecem sem parceiro
// ao fim da temporada, reais e bots separados. Pergunta motivadora: os 900
// bots também ficam sem parceiro em massa (propriedade do circuito
// inteiro), ou é um efeito concentrado nos 100 reais (amostra pequena
// demais pro mercado alcançar)?
//
// Leve de propósito: só roda processAiPartnershipMarket, uma vez por mês
// (função já é gated por mês internamente) — mesmo padrão de
// test-ranking-proximity-pairing.mjs / test-population-stability-10-seasons.mjs.
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

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const PROCEDURAL = Math.max(1, Number(args.proceduralAthletes || 900));
const MONTHS = Math.max(1, Number(args.months || 12));
const SEED = String(args.seed || 'market-throughput');

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

  installDeterminism(SEED);
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'market-throughput-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'market-throughput-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });

  const registry = getRealAthleteRegistry();
  for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL));

  // Semeia os 27 pares conhecidos como pares ATIVOS de saída (mesmo padrão
  // de saveFoundation.js) — reproduz o estado real de largada de uma
  // carreira, em vez de partir de "ninguém tem parceiro".
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

  const realIds = new Set(registry.map((a) => a.id));
  const monthly = [];
  let profile = {};
  let currentDate = '2026-01-01';
  for (let m = 0; m < MONTHS; m += 1) {
    const previousDate = currentDate;
    const [y, mo] = currentDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo, 1));
    currentDate = next.toISOString().slice(0, 10);
    // eslint-disable-next-line no-await-in-loop
    const result = await processAiPartnershipMarket(profile, previousDate, currentDate);
    profile = result.profile || profile;
    monthly.push({ month: currentDate.slice(0, 7), formed: result.formed || 0, dissolved: result.dissolved || 0 });
  }

  const allAthletes = await localGame.entities.AthleteProfile.list(null, 1200);
  const active = allAthletes.filter((a) => !a.retired);
  const reals = active.filter((a) => realIds.has(a.id));
  const bots = active.filter((a) => !realIds.has(a.id));
  const unpaired = (list) => list.filter((a) => !a.ai_partner_id && !a.partner_athlete_id).length;

  console.log(`=== vazão do mercado de parcerias (${PROCEDURAL} procedurais, ${MONTHS} meses, seed=${SEED}) ===`);
  console.log('formados/dissolvidos por mês:');
  for (const row of monthly) console.log(`  ${row.month}: formados=${row.formed} dissolvidos=${row.dissolved}`);
  const totalFormed = monthly.reduce((s, r) => s + r.formed, 0);
  const totalDissolved = monthly.reduce((s, r) => s + r.dissolved, 0);
  console.log(`total no período: formados=${totalFormed} dissolvidos=${totalDissolved} | média/mês formados=${(totalFormed / MONTHS).toFixed(1)} dissolvidos=${(totalDissolved / MONTHS).toFixed(1)}`);
  console.log(`\npopulação ativa ao fim: ${active.length} (reais=${reals.length} bots=${bots.length})`);
  console.log(`sem parceiro ao fim — reais: ${unpaired(reals)}/${reals.length} (${(100 * unpaired(reals) / reals.length).toFixed(1)}%)`);
  console.log(`sem parceiro ao fim — bots: ${unpaired(bots)}/${bots.length} (${(100 * unpaired(bots) / bots.length).toFixed(1)}%)`);
} finally {
  await vite.close();
}
