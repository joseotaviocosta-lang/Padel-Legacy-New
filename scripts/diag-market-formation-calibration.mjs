// Fase 2.6, item 1 — curva de calibração da fração de formação de pares
// (MARKET_FORMATION_FRACTION, aiPartnershipLifecycle.js). Testa vários
// valores de fração contra a MESMA população de produção (100 reais + 27
// pares conhecidos + 900 procedurais), rodando processAiPartnershipMarket
// (função REAL) por um horizonte longo o bastante pra atingir regime
// estável (contratos duram 210-360 dias — menos de ~12-13 meses não é
// tempo suficiente pra ver o efeito da dissolução por fim de contrato).
// Reporta, por fração: % pareado ao fim (reais/bots separado), pares
// ativos, formados/dissolvidos médios nos últimos 6 meses (regime
// estável) — a curva que decide o valor antes de fixar no código.
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
const MONTHS = Math.max(1, Number(args.months || 30));
const FRACTIONS = String(args.fractions || '0.02,0.04,0.06,0.08,0.10,0.14,0.16,0.20,0.28')
  .split(',').map(Number).filter((v) => Number.isFinite(v) && v > 0);

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

  const registry = getRealAthleteRegistry();
  const realIds = new Set(registry.map((a) => a.id));

  async function runOneFraction(fraction, seedLabel) {
    installDeterminism(seedLabel);
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ playerName: 'calib-diag' });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: 'calib-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
      tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
      energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
    });

    for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
    const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
    const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
    await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL));

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

    const monthly = [];
    let profile = {};
    let currentDate = '2026-01-01';
    for (let m = 0; m < MONTHS; m += 1) {
      const previousDate = currentDate;
      const [y, mo] = currentDate.split('-').map(Number);
      const next = new Date(Date.UTC(y, mo, 1));
      currentDate = next.toISOString().slice(0, 10);
      // Fase 2.7, item 3: fração passada por parâmetro (nunca mais um
      // setter mutando estado de módulo) — cada rodada desta calibração
      // usa seu próprio valor sem qualquer risco de vazar pra produção.
      // eslint-disable-next-line no-await-in-loop
      const result = await processAiPartnershipMarket(profile, previousDate, currentDate, { formationFraction: fraction });
      profile = result.profile || profile;
      monthly.push({ month: currentDate.slice(0, 7), formed: result.formed || 0, dissolved: result.dissolved || 0 });
    }

    const allAthletes = await localGame.entities.AthleteProfile.list(null, 1200);
    const active = allAthletes.filter((a) => !a.retired);
    const reals = active.filter((a) => realIds.has(a.id));
    const bots = active.filter((a) => !realIds.has(a.id));
    const paired = (list) => list.filter((a) => a.ai_partner_id || a.partner_athlete_id).length;
    const activePartnerships = await localGame.entities.Partnership.filter({ status: 'ativa' });

    const steadyWindow = monthly.slice(-6);
    const avgFormed = steadyWindow.reduce((s, r) => s + r.formed, 0) / steadyWindow.length;
    const avgDissolved = steadyWindow.reduce((s, r) => s + r.dissolved, 0) / steadyWindow.length;

    return {
      fraction,
      activeTotal: active.length,
      realsPairedPct: (100 * paired(reals) / reals.length),
      botsPairedPct: (100 * paired(bots) / bots.length),
      overallPairedPct: (100 * paired(active) / active.length),
      activePartnerships: activePartnerships.length,
      avgFormedSteady: avgFormed,
      avgDissolvedSteady: avgDissolved,
      monthly,
    };
  }

  console.log(`=== curva de calibração — ${PROCEDURAL} procedurais, ${MONTHS} meses, frações: ${FRACTIONS.join(', ')} ===\n`);
  const results = [];
  for (const fraction of FRACTIONS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await runOneFraction(fraction, `market-calib-${fraction}`);
    results.push(result);
    console.log(`fração=${fraction.toFixed(2)} | pareados: geral=${result.overallPairedPct.toFixed(1)}% reais=${result.realsPairedPct.toFixed(1)}% bots=${result.botsPairedPct.toFixed(1)}% | duplas ativas=${result.activePartnerships} | regime estável (últimos 6 meses): formados=${result.avgFormedSteady.toFixed(1)}/mês dissolvidos=${result.avgDissolvedSteady.toFixed(1)}/mês`);
  }

  console.log('\n=== tabela resumo (curva) ===');
  console.log('fração\t%pareado_geral\t%pareado_reais\t%pareado_bots\tduplas_ativas\tformados/mês\tdissolvidos/mês');
  for (const r of results) {
    console.log(`${r.fraction.toFixed(2)}\t${r.overallPairedPct.toFixed(1)}\t${r.realsPairedPct.toFixed(1)}\t${r.botsPairedPct.toFixed(1)}\t${r.activePartnerships}\t${r.avgFormedSteady.toFixed(1)}\t${r.avgDissolvedSteady.toFixed(1)}`);
  }
} finally {
  await vite.close();
}
