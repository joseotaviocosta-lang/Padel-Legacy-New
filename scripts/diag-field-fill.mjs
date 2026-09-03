// Fase 2.5, item 1.4 — diagnóstico (não corrige nada): confirma se a
// montagem de campo de torneio (WorldTourLifecycle.js) deixa vagas vazias
// (entrants < main_draw_size) enquanto existem duplas ELEGÍVEIS que não
// foram convocadas, independente do teto de draw_size (achado #16b, já
// conhecido e adiado pra Fase 3).
//
// ATENÇÃO: depende de um bloco de instrumentação TEMPORÁRIO gated por
// `process.env.DIAGNOSE_FIELD_FILL`, inserido e revertido dentro de
// WorldTourLifecycle.js só pra esta medição (mesmo padrão do antes/depois
// de RANKING_PROXIMITY_STRENGTH na Fase 2H) — o arquivo de produção NÃO
// carrega mais esse bloco (revertido via git checkout após medir). Pra
// rerodar este script, reaplique o bloco documentado no relatório
// (FASE-2.5-RELATORIO.md, item 1) logo antes de
// `const ordered = entrants.sort(...).slice(0, drawSize)` em
// resolveCompletedWorldTourEvents, rode, e reverta de novo.
//
// Leve de propósito: semeia a população real de produção (100 reais + 27
// pares + 900 procedurais), roda processAiPartnershipMarket (função REAL)
// por alguns meses pra ter um estado de parceria plausível, semeia o
// calendário de temporada inteiro via buildSeasonTournaments (a MESMA
// função de produção — não reimplementa a grade), aproxima ranking_position
// pela ordem de world_ranking_points (processWorldCircuit não roda aqui, de
// propósito, pelo mesmo motivo do diag de proximidade de ranking: rápido e
// suficiente pra esta pergunta específica), e chama
// resolveCompletedWorldTourEvents (a função REAL de produção) UMA VEZ pra
// resolver a temporada inteira — instrumentado via DIAGNOSE_FIELD_FILL=1
// (bloco temporário em WorldTourLifecycle.js, revertido após esta medição).
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

process.env.DIAGNOSE_FIELD_FILL = '1';

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const PROCEDURAL = Math.max(1, Number(args.proceduralAthletes || 900));
const PAIRING_MONTHS = Math.max(1, Number(args.pairingMonths || 6));
const SEED = String(args.seed || 'field-fill-diag');

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
  const { resolveCompletedWorldTourEvents } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { teamKey } = await vite.ssrLoadModule('/src/lib/teamRanking.js');

  installDeterminism(SEED);
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'field-fill-diag' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'field-fill-player', sport_name: 'Diag', career_date: '2026-01-01', birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });

  const registry = getRealAthleteRegistry();
  for (const athlete of registry) await localGame.entities.AthleteProfile.create({ ...athlete });
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const supplemental = buildSupplementalRankingPopulation(seededAthletes, []);
  await localGame.entities.AthleteProfile.bulkCreate(supplemental.athletes.slice(0, PROCEDURAL));

  // Semeia os 27 pares conhecidos como Partnership ativas (mesmo padrão de
  // saveFoundation.js / audit-real-athletes-simulation.mjs) — sem isso,
  // processAiPartnershipMarket levaria vários meses só pra "descobrir" os
  // pares já conhecidos via ensureCanonicalPartnerships.
  const lockedPairs = [...getConfirmedRealPairs().map((p) => ({ ...p, locked: true })), ...getProbableRealPairs().map((p) => ({ ...p, locked: false }))];
  const athleteUpdates = [];
  for (const pair of lockedPairs) {
    const a = await localGame.entities.AthleteProfile.get(pair.a);
    const b = await localGame.entities.AthleteProfile.get(pair.b);
    if (!a || !b) continue;
    const common = { ai_partnership_status: 'ativa', ai_partnership_start_date: '2026-01-01', ai_partnership_months: 0, ai_partnership_chemistry: pair.locked ? 88 : 60, ai_partnership_protected: pair.locked, market_status: 'contratado' };
    athleteUpdates.push({ id: a.id, ...common, ai_partner_id: b.id, ai_partner_name: b.name });
    athleteUpdates.push({ id: b.id, ...common, ai_partner_id: a.id, ai_partner_name: a.name });
  }
  if (athleteUpdates.length) await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates);

  // Roda o mercado real (processAiPartnershipMarket) por alguns meses pra
  // formar pares orgânicos entre bots (e materializar os 27 pares
  // conhecidos como linhas de Partnership, via ensureCanonicalPartnerships)
  // ANTES de resolver a temporada — sem isso, quase ninguém teria Partnership
  // ativa e a "pool elegível" ficaria artificialmente pequena.
  let profile = {};
  let currentDate = '2026-01-01';
  for (let m = 0; m < PAIRING_MONTHS; m += 1) {
    const previousDate = currentDate;
    const [y, mo] = currentDate.split('-').map(Number);
    const next = new Date(Date.UTC(y, mo, 1));
    currentDate = next.toISOString().slice(0, 10);
    // eslint-disable-next-line no-await-in-loop
    const result = await processAiPartnershipMarket(profile, previousDate, currentDate);
    profile = result.profile || profile;
  }

  // ranking_position só é definido de verdade por processWorldCircuit (não
  // roda aqui, de propósito — mesmo atalho já usado no diag de proximidade
  // de ranking): aproxima pela ordem de world_ranking_points.
  const allAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1200);
  const rankUpdates = allAthletes.map((a, index) => ({ id: a.id, ranking_position: index + 1 }));
  await localGame.entities.AthleteProfile.bulkUpdate(rankUpdates);

  // Calendário da temporada inteira, MESMA função de produção — sem
  // reimplementar a grade de semanas/tiers. createCareer já semeia um
  // horizonte rolante de torneios a partir de career_date (src/lib/career.js)
  // — evita duplicar id: só cria os que ainda não existem (mesmo critério de
  // dedupe que career.js usa, por circuit_code+ano).
  const existingTournaments = await localGame.entities.Tournament.list(null, 2000);
  const existingCodes = new Set(existingTournaments.map((t) => t.circuit_code));
  const tournaments = buildSeasonTournaments(2026, 'diag-season');
  const missing = tournaments.filter((t) => !existingCodes.has(t.circuit_code));
  if (missing.length) await localGame.entities.Tournament.bulkCreate(missing);

  const result = await resolveCompletedWorldTourEvents('2027-01-01');
  const diag = globalThis.__FIELD_FILL_DIAG__ || [];

  console.log(`=== diagnóstico de montagem de campo (${PROCEDURAL} procedurais, pareamento por ${PAIRING_MONTHS} meses) ===`);
  console.log(`temporada resolvida: ${result.resolved}/${tournaments.length} torneios`);
  console.log(`torneios com entrants < main_draw_size (entrants>=2, fora do fallback de emergência): ${diag.length}`);
  for (const row of diag.sort((a, b) => a.week - b.week)) {
    console.log(`  semana ${row.week} [${row.concurrentEvents === 1 ? 'semana só com este torneio' : `${row.concurrentEvents} torneios concorrentes`}] ${row.id} (${row.tier}): entrants_brutos=${row.entrants} main_draw_size=${row.mainDrawSize} teto_drawSize=${row.drawSizeCap} teto_atuou=${row.capBinding} — pares elegíveis ociosos não convocados: ${row.idleEligible}`);
  }
  // Separar os dois mecanismos: teto de drawSize=32 atuando (achado #16b,
  // já conhecido) vs. sub-preenchimento com o teto folgado e pares
  // elegíveis sobrando (mecanismo NOVO — pergunta do item 1.4).
  const capBindingCases = diag.filter((row) => row.capBinding);
  const genuineGapCases = diag.filter((row) => !row.capBinding && row.idleEligible > 0);
  console.log(`\ntorneios onde o teto de drawSize=32 já explica o sub-preenchimento (achado #16b, conhecido): ${capBindingCases.length}/${diag.length}`);
  console.log(`torneios com teto FOLGADO (entrants_brutos <= drawSize) mas AINDA assim sub-preenchidos, com pares elegíveis ociosos: ${genuineGapCases.length}/${diag.length}`);
  console.log(genuineGapCases.length ? 'CONFIRMADO: existe um mecanismo de sub-preenchimento INDEPENDENTE do draw_size — a montagem de campo não convoca pares elegíveis ociosos mesmo quando o teto não é o limitante.' : 'NÃO confirmado nesta rodada — todo o sub-preenchimento observado é explicado pelo teto de drawSize (achado #16b).');
} finally {
  await vite.close();
}
