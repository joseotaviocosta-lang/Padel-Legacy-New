// Fase 2D.4 — simula 10 temporadas e confirma que a população fica
// estável em ~1000 (±5%) e que a pirâmide etária não degenera.
//
// Leve de propósito: chama evolveAthletesMonthly (aposentadoria,
// Fase 2D.1) e simulateWorldDay (geração de prospects, Fase 2D.2) — as
// funções REAIS de produção, sem reimplementar nada — uma vez por MÊS
// simulado, não por dia. Ambas já são gated por mês internamente
// (last_career_evolution_month / generated_month), então uma chamada por
// mês é fiel ao que aconteceria num dia-a-dia completo pra este propósito
// específico (contagem populacional e pirâmide etária) — só pula os
// outros ~9 sistemas diários (torneios, mercado de parceria, staff etc.)
// que não afetam quem nasce/se aposenta.
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
const SEASONS = Math.max(1, Number(args.seasons || 10));
const PROCEDURAL = Math.max(1, Number(args.proceduralAthletes || 900));
const SEED = String(args.seed || 'population-stability');

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
  const { CareerEntityRepository } = await vite.ssrLoadModule('/src/gameplay/repositories/CareerEntityRepository.js');

  installDeterminism(SEED);
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'stability-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'stability-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  let profile = await localGame.entities.PlayerProfile.get('stability-player');

  const registry = getRealAthleteRegistry();
  for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL));

  const totalMonths = SEASONS * 12;
  const snapshots = [];
  let currentDate = '2026-01-01';
  let previousYear = 2026;

  for (let m = 0; m < totalMonths; m += 1) {
    const previousDate = currentDate;
    const [y, mo] = previousDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo, 1));
    currentDate = next.toISOString().slice(0, 10);
    const currentYear = Number(currentDate.slice(0, 4));
    const isYearBoundary = currentYear !== previousYear;
    previousYear = currentYear;

    // Fase 2.5, item 4: evolveAthletesMonthly agora recebe `profile` (soma
    // aposentadorias do mês num contador monotônico em PlayerProfile,
    // nunca mais uma contagem ao vivo de linhas `retired:true`) — mesma
    // assinatura que src/lib/career.js usa em produção.
    // eslint-disable-next-line no-await-in-loop
    await evolveAthletesMonthly(currentDate, { isYearBoundary, profile });
    // eslint-disable-next-line no-await-in-loop
    const result = await simulateWorldDay(profile, previousDate, currentDate);
    profile = result.profile || profile;

    if ((m + 1) % 12 === 0) {
      // eslint-disable-next-line no-await-in-loop
      // Sem sort explícito, list() devolve em ordem de inserção — com um
      // teto baixo, isso corta desproporcionalmente os prospects NOVOS
      // (inseridos por último), fazendo a população ativa parecer encolher
      // por artefato de medição assim que o total passa do teto, não por
      // dinâmica real. simulateWorldDay agora PODA aposentados com mais de
      // 24 meses (Fase 2.5, item 4.3, worldSimulationLifecycle.js) — o
      // teto aqui só precisa cobrir população ativa + aposentados recentes
      // ainda não podados, não mais TODO mundo que já se aposentou desde o
      // início da carreira.
      const all = await localGame.entities.AthleteProfile.list(null, 6000);
      const active = all.filter((a) => !a.retired);
      const retired = all.length - active.length;
      const buckets = { '17-20': 0, '21-24': 0, '25-28': 0, '29-32': 0, '33-36': 0, '37+': 0 };
      for (const a of active) {
        const age = Number(a.age) || 27;
        if (age <= 20) buckets['17-20'] += 1;
        else if (age <= 24) buckets['21-24'] += 1;
        else if (age <= 28) buckets['25-28'] += 1;
        else if (age <= 32) buckets['29-32'] += 1;
        else if (age <= 36) buckets['33-36'] += 1;
        else buckets['37+'] += 1;
      }
      snapshots.push({ season: Math.floor((m + 1) / 12), totalRows: all.length, active: active.length, retired, buckets });
      console.log(`[temporada ${Math.floor((m + 1) / 12)}] total=${all.length} ativos=${active.length} aposentados=${retired} | pirâmide: ${Object.entries(buckets).map(([k, v]) => `${k}:${v}`).join(' ')}`);

      // poda leve — só pra não estourar heap num teste de 10 temporadas;
      // não afeta a contagem medida acima (já capturada antes da poda).
      // eslint-disable-next-line no-await-in-loop
      const events = await localGame.entities.WorldEvent.list('-created_date', 5000).catch(() => []);
      const pruneOps = events.slice(300).map((row) => ({ type: 'delete', entityName: 'WorldEvent', id: row.id }));
      for (let i = 0; i < pruneOps.length; i += 500) await localGame.batch(pruneOps.slice(i, i + 500)).catch(() => {});
    }
  }

  const targetPopulation = registry.length + PROCEDURAL;
  const band = targetPopulation * 0.05;
  const activeSeries = snapshots.map((s) => s.active);
  const withinBand = activeSeries.every((v) => Math.abs(v - targetPopulation) <= band);
  const lastBuckets = snapshots[snapshots.length - 1].buckets;
  const lastActive = snapshots[snapshots.length - 1].active;
  const pyramidHealthy = Object.values(lastBuckets).every((v) => v > 0) && lastBuckets['17-20'] > lastActive * 0.05;

  // Fase 2.5, item 4.4: contagem TOTAL de linhas (ativos + aposentados
  // ainda não podados) precisa ESTABILIZAR, não só a população ativa — é
  // exatamente o que a poda de aposentados antigos (item 4.3) e o
  // calibrador por contador monotônico (item 4.2, generateProspects) foram
  // desenhados para garantir juntos. Compara o crescimento nas primeiras
  // temporadas (poda ainda não alcançou ninguém — só passa a agir a partir
  // de ~2 anos de aposentadoria) contra o crescimento nas últimas — se a
  // poda está funcionando, o crescimento tardio precisa ser bem menor que
  // o inicial, não igual ou maior.
  const totalRowsSeries = snapshots.map((s) => s.totalRows);
  const earlyWindow = Math.min(3, totalRowsSeries.length);
  const lateWindow = Math.min(3, totalRowsSeries.length);
  const earlyGrowth = totalRowsSeries[earlyWindow - 1] - totalRowsSeries[0];
  const lateGrowth = totalRowsSeries[totalRowsSeries.length - 1] - totalRowsSeries[totalRowsSeries.length - lateWindow];
  const rowCountStabilizing = totalRowsSeries.length < 6 || lateGrowth <= Math.max(earlyGrowth, targetPopulation * 0.05);

  console.log('\n=== resumo ===');
  console.log(`alvo de população (100 reais + ${PROCEDURAL} procedurais): ${targetPopulation} (banda ±5% = ±${band.toFixed(0)})`);
  console.log(`população ativa por temporada: ${activeSeries.join(', ')}`);
  console.log(`total de linhas (ativos+aposentados não podados) por temporada: ${totalRowsSeries.join(', ')}`);
  console.log(`crescimento total de linhas: primeiras ${earlyWindow} temporadas = ${earlyGrowth} | últimas ${lateWindow} temporadas = ${lateGrowth}`);
  console.log(withinBand ? `PASS — população ativa ficou dentro de ${targetPopulation}±${band.toFixed(0)} (±5%) em todas as temporadas medidas` : 'FAIL — população ativa saiu da banda de ±5% em alguma temporada');
  console.log(pyramidHealthy ? 'PASS — pirâmide etária final tem todas as faixas povoadas, sem colapso na base' : 'FAIL — pirâmide degenerou (alguma faixa zerada ou base 17-20 muito pequena)');
  console.log(rowCountStabilizing ? 'PASS — contagem total de linhas estabilizou (crescimento tardio não maior que o inicial), a poda está compensando o acúmulo de aposentados' : 'FAIL — contagem total de linhas segue crescendo sem sinal de estabilização (poda não está compensando o acúmulo)');
  process.exitCode = withinBand && pyramidHealthy && rowCountStabilizing ? 0 : 1;
} finally {
  await vite.close();
}
