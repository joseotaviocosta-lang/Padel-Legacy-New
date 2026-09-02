// Fase 0.3, item 2 — Diagnóstico de processAiPartnershipMarket
// (src/game-core/aiPartnershipLifecycle.js). SÓ DIAGNÓSTICO — nenhum
// arquivo de jogo é alterado. Intercepta no nível do repositório-singleton
// (CareerEntityRepository, usado por TODO adapter de entidade via
// src/gameplay/adapters/EntityAdapter.js) porque localGame.entities é um
// Proxy que cria um adapter NOVO a cada acesso de propriedade — não dá pra
// interceptar `entities.AthleteProfile.list` diretamente de fora, ele
// nunca é o mesmo objeto duas vezes. O repositório, sim, é um singleton de
// módulo — patchear os métodos do PROTÓTIPO intercepta toda chamada real
// do jogo sem tocar em nenhum arquivo de gameplay.
//
// Roda processAiPartnershipMarket isoladamente (sem os outros ~9 estágios
// diários) mês a mês por uma temporada inteira, contra a população real de
// produção (24 reais + 970 procedurais, ids no formato real de makeId()) —
// rápido o bastante pra rodar duas variantes (ordem normal vs. ordem
// invertida) na mesma execução.
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

const PROCEDURAL_ATHLETE_SAMPLE = Math.max(1, Number(process.argv.find((a) => a.startsWith('--proceduralAthletes='))?.split('=')[1] || 970));
const PROCEDURAL_TEAM_SAMPLE = Math.max(1, Number(process.argv.find((a) => a.startsWith('--proceduralTeams='))?.split('=')[1] || 486));
const MONTHS = Math.max(1, Number(process.argv.find((a) => a.startsWith('--months='))?.split('=')[1] || 12));
const SEED = String(process.argv.find((a) => a.startsWith('--seed='))?.split('=')[1] || 'market-diag');

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

function addMonths(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
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
  const { CareerEntityRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');

  // ═══ instrumentação: patch no PROTÓTIPO do repositório-singleton ═══
  const stats = { listCalls: [], writeCallsByMonth: [], sortComparisons: 0 };
  let sortCounting = false;
  let currentMonthWrites = null;
  let orderTransform = null; // (rows) => rows — só pra variante B (ordem invertida)

  const originalList = CareerEntityRepository.prototype.list;
  CareerEntityRepository.prototype.list = async function patchedList(entityName, sort, limit) {
    const rows = await originalList.call(this, entityName, sort, limit);
    if (entityName === 'AthleteProfile' && sort === 'ranking_position') {
      stats.listCalls.push({ returned: rows.length, limitRequested: limit });
      if (orderTransform) return orderTransform([...rows]);
    }
    return rows;
  };
  for (const method of ['update', 'upsert', 'bulkUpdate']) {
    const original = CareerEntityRepository.prototype[method];
    CareerEntityRepository.prototype[method] = async function patchedWrite(entityName, ...rest) {
      if (currentMonthWrites && (entityName === 'AthleteProfile' || entityName === 'Partnership')) {
        const key = `${entityName}.${method}`;
        currentMonthWrites[key] = (currentMonthWrites[key] || 0) + 1;
      }
      return original.call(this, entityName, ...rest);
    };
  }
  const originalSort = Array.prototype.sort;
  // eslint-disable-next-line no-extend-native
  Array.prototype.sort = function patchedSort(cmp) {
    if (sortCounting && cmp) {
      const wrapped = (a, b) => { stats.sortComparisons += 1; return cmp(a, b); };
      return originalSort.call(this, wrapped);
    }
    return originalSort.call(this, cmp);
  };

  async function seedPopulation(seedString) {
    installDeterminism(seedString);
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    const { career } = await manager.createCareer({ playerName: 'market-diag' });
    activeCareerAdapter.setActiveCareer(career);
    await activeCareerAdapter.createPlayerProfile({
      id: 'diag-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
      level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
      tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
      energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
      trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
    });

    const realAthleteIds = new Set();
    for (const athlete of worldSeed.athletes) {
      const created = await localGame.entities.AthleteProfile.create({ ...athlete });
      realAthleteIds.add(created.id);
    }
    const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
    const supplementalFull = buildSupplementalRankingPopulation(seededAthletes, []);
    const supplementalAthletesPayload = supplementalFull.athletes.slice(0, PROCEDURAL_ATHLETE_SAMPLE);
    await localGame.entities.AthleteProfile.bulkCreate(supplementalAthletesPayload);
    void PROCEDURAL_TEAM_SAMPLE; // não precisamos de TeamRanking pra este mercado — só AthleteProfile/Partnership
    return { realAthleteIds };
  }

  async function runVariant(label, transform) {
    orderTransform = transform;
    const { realAthleteIds } = await seedPopulation(`${SEED}-${label}`);
    const monthly = [];
    let profile = {};
    let currentDate = '2026-01-01';
    for (let m = 0; m < MONTHS; m += 1) {
      const previousDate = currentDate;
      currentDate = addMonths(currentDate, 1);
      currentMonthWrites = {};
      stats.listCalls.length = 0;
      stats.sortComparisons = 0;
      sortCounting = true;
      // eslint-disable-next-line no-await-in-loop
      const result = await processAiPartnershipMarket(profile, previousDate, currentDate);
      sortCounting = false;
      profile = result.profile || profile;
      const listCall = stats.listCalls[0] || { returned: 0, limitRequested: null };
      monthly.push({
        month: currentDate.slice(0, 7),
        formed: result.formed,
        dissolved: result.dissolved,
        athleteProfileListReturned: listCall.returned,
        athleteProfileListLimit: listCall.limitRequested,
        sortComparatorCalls: stats.sortComparisons,
        writes: { ...currentMonthWrites },
        totalWrites: Object.values(currentMonthWrites).reduce((s, v) => s + v, 0),
      });
    }
    // pareamento real-real final
    const finalReals = await Promise.all([...realAthleteIds].map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)));
    let realRealPairs = 0;
    let realsPaired = 0;
    let realsPairedWithBot = 0;
    for (const athlete of finalReals) {
      if (!athlete) continue;
      const partnerId = athlete.ai_partner_id || athlete.partner_athlete_id;
      if (!partnerId) continue;
      realsPaired += 1;
      if (realAthleteIds.has(partnerId)) realRealPairs += 1;
      else realsPairedWithBot += 1;
    }
    realRealPairs = realRealPairs / 2; // cada par contado duas vezes (uma por lado)
    return { label, monthly, realsPaired, realRealPairs, realsPairedWithBot, totalReals: realAthleteIds.size };
  }

  console.log(`Seed base: "${SEED}" — ${MONTHS} meses, ${PROCEDURAL_ATHLETE_SAMPLE} bots procedurais.\n`);

  const variantA = await runVariant('normal-order', null);
  const variantB = await runVariant('reversed-order', (rows) => rows.reverse());
  const variantC = await runVariant('shuffled-order', (rows) => {
    const rand = mulberry32(hashSeed(`${SEED}-shuffle`));
    const copy = [...rows];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  });

  function printVariant(v) {
    console.log(`=== ${v.label} ===`);
    console.log(`  reais pareados: ${v.realsPaired}/${v.totalReals} (real-real: ${v.realRealPairs}, real-bot: ${v.realsPairedWithBot})`);
    const totalSort = v.monthly.reduce((s, m) => s + m.sortComparatorCalls, 0);
    const totalWrites = v.monthly.reduce((s, m) => s + m.totalWrites, 0);
    console.log(`  comparações de sort (todas as chamadas de Array.sort dentro do mês, somadas): ${totalSort} ao longo de ${MONTHS} meses`);
    console.log(`  escritas individuais (update/upsert/bulkUpdate) em AthleteProfile+Partnership: ${totalWrites} ao longo de ${MONTHS} meses`);
    console.log(`  AthleteProfile.list('ranking_position',500) retornou (1º mês → último mês): ${v.monthly[0]?.athleteProfileListReturned} → ${v.monthly[v.monthly.length - 1]?.athleteProfileListReturned}`);
    console.log(`  escritas por mês (1º → último): ${v.monthly[0]?.totalWrites} → ${v.monthly[v.monthly.length - 1]?.totalWrites}`);
    console.log(`  sort-comparisons por mês (1º → último): ${v.monthly[0]?.sortComparatorCalls} → ${v.monthly[v.monthly.length - 1]?.sortComparatorCalls}`);
    console.log('');
  }
  printVariant(variantA);
  printVariant(variantB);
  printVariant(variantC);

  const fs = await import('node:fs/promises');
  const outDir = 'reports/real-athletes-audit';
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(`${outDir}/partnership-market-diagnostic.json`, JSON.stringify({ seed: SEED, months: MONTHS, proceduralAthletes: PROCEDURAL_ATHLETE_SAMPLE, variants: [variantA, variantB, variantC] }, null, 2));
  console.log(`Relatório completo: ${outDir}/partnership-market-diagnostic.json`);

  Array.prototype.sort = originalSort;
  CareerEntityRepository.prototype.list = originalList;
} finally {
  await vite.close();
}
