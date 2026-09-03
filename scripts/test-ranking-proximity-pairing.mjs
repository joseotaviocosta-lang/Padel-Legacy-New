// Fase 2H.4 — mede a distribuição da diferença de ranking entre parceiros
// formados por processAiPartnershipMarket, com a população real de
// produção (100 reais + 900 procedurais). Rode este script duas vezes
// (antes/depois do achado 2H aplicado, via `git stash` em
// aiPartnershipLifecycle.js) pra comparar.
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
const SEED = String(args.seed || 'ranking-proximity');
const LABEL = String(args.label || 'run');

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
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');

  installDeterminism(SEED);
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'proximity-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'proximity-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });

  const registry = getRealAthleteRegistry();
  for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL));

  // ranking_position só é definido de verdade por processWorldCircuit
  // (não rodamos aqui — só o mercado, isolado, de propósito, pra ficar
  // rápido). Damos ranking_position inicial = ordem de world_ranking_points
  // pra ter um sinal de proximidade coerente pra medir, sem precisar do
  // motor inteiro.
  const allAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1200);
  const rankUpdates = allAthletes.map((a, index) => ({ id: a.id, ranking_position: index + 1 }));
  await localGame.entities.AthleteProfile.bulkUpdate(rankUpdates);

  const gaps = [];
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
    for (const event of result.events) {
      if (event?.event_type !== 'ai_partnership_formed') continue;
      // eslint-disable-next-line no-await-in-loop
      const [a, b] = await Promise.all([
        localGame.entities.AthleteProfile.get(event.athlete_id),
        localGame.entities.AthleteProfile.get(event.related_athlete_id),
      ]);
      if (!a || !b) continue;
      gaps.push(Math.abs(Number(a.ranking_position) - Number(b.ranking_position)));
    }
  }

  gaps.sort((a, b) => a - b);
  const pct = (p) => gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * p))] : null;
  const mean = gaps.length ? gaps.reduce((s, v) => s + v, 0) / gaps.length : null;
  console.log(`=== ${LABEL} — ${gaps.length} pares formados em ${MONTHS} meses (${PROCEDURAL} procedurais) ===`);
  console.log(`média=${mean?.toFixed(1)} | p10=${pct(0.10)} p25=${pct(0.25)} mediana=${pct(0.5)} p75=${pct(0.75)} p90=${pct(0.9)} p99=${pct(0.99)} max=${gaps[gaps.length - 1]}`);
  const buckets = { '0-10': 0, '11-30': 0, '31-80': 0, '81-200': 0, '201-500': 0, '500+': 0 };
  for (const g of gaps) {
    if (g <= 10) buckets['0-10'] += 1;
    else if (g <= 30) buckets['11-30'] += 1;
    else if (g <= 80) buckets['31-80'] += 1;
    else if (g <= 200) buckets['81-200'] += 1;
    else if (g <= 500) buckets['201-500'] += 1;
    else buckets['500+'] += 1;
  }
  console.log(Object.entries(buckets).map(([k, v]) => `${k}:${v} (${(v / gaps.length * 100).toFixed(1)}%)`).join(' | '));
} finally {
  await vite.close();
}
