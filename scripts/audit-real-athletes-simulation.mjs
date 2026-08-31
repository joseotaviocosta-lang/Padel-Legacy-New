// Auditoria — Atletas reais vs. bots no ecossistema do jogo.
// FASE 0 do plano de correção: harness-JUIZ, instrumentado por
// (temporada × tier), determinístico, e usado para congelar a baseline
// pré-refactor. NÃO reimplementa nenhuma regra de jogo — só chama as
// funções de produção reais e relata o que elas produzem.
//
// Uso:
//   node scripts/audit-real-athletes-simulation.mjs [--seasons=5] [--seed=baseline-v1]
//     [--proceduralAthletes=970] [--proceduralTeams=486] [--stepDays=14] [--out=reports/real-athletes-audit]
//
// Saída: <out>/summary.json (por temporada × tier + cumulativo),
// <out>/tournament-results.csv, <out>/season-tier-table.md.
import { writeFileSync, mkdirSync } from 'node:fs';
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const SEASONS = Math.max(1, Number(args.seasons || 5));
const START_YEAR = 2026;
const OUT_DIR = args.out || 'reports/real-athletes-audit';
const SEED = String(args.seed || 'baseline-v1');
// A camada de storage da carreira clona o blob inteiro a cada leitura/escrita
// de entidade — em escala de produção (1000 atletas, 500 duplas) uma
// temporada simulada leva vários minutos. Reduz a população PROCEDURAL
// (mesma fórmula de rankingPopulation.js, só um corte menor da mesma curva
// por rank) e/ou aumenta o passo de calendário para iteração rápida;
// resolveCompletedWorldTourEvents é idempotente e agrupa por (ano, semana)
// internamente, então um passo maior não perde nenhum torneio concluído, só
// agrupa mais resoluções por chamada. A BASELINE CONGELADA (docs/) usa os
// valores de produção completos (970/486/14) — os defaults abaixo já
// refletem isso; use flags menores só para depuração rápida.
const PROCEDURAL_ATHLETE_SAMPLE = Math.max(1, Number(args.proceduralAthletes || 970));
const PROCEDURAL_TEAM_SAMPLE = Math.max(1, Number(args.proceduralTeams || 486));
const STEP_DAYS = Math.max(1, Number(args.stepDays || 14));

// ═══════════════ Determinismo: mesma seed → mesma saída, sempre ═══════════════
// Auditoria de código (grep em todo o grafo de chamada deste harness:
// WorldTourLifecycle.js, aiPartnershipLifecycle.js, TournamentSelectionAI.js,
// EntryManager.js, circuitCatalog.js, rankingPopulation.js, bots.js,
// teamCompatibility.js, livingCircuitRules.js) confirma ZERO usos de
// Math.random() nesse caminho — toda a "aleatoriedade" do motor já é hash
// determinístico de strings fixas (id, mês, id do torneio). As DUAS únicas
// fontes de não-determinismo são: (1) `CareerEntityRepository.create/
// bulkCreate` gera `id: data.id || makeId(...)` quando o chamador não passa
// um id explícito, e `makeId` usa Date.now()+Math.random(); (2)
// created_date/updated_date usam `new Date().toISOString()` (relógio real).
// Corrigido SEM tocar em nenhum arquivo de jogo: (a) todo AthleteProfile/
// TeamRanking que este harness cria recebe um id explícito e estável
// (bot_id/team_key — nunca deixamos o fallback rodar); (b) Math.random e o
// relógio "atual" são substituídos por versões seedadas só neste processo,
// como rede de segurança para qualquer uso residual que a auditoria não
// tenha capturado (ex.: ids de WorldEvent, que não afetam nenhuma métrica
// medida aqui, mas ficam deterministas mesmo assim).
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

function median(numbers) {
  if (!numbers.length) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function mean(numbers) {
  return numbers.length ? numbers.reduce((s, n) => s + n, 0) / numbers.length : 0;
}
function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}
function addDays(dateString, amount) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);
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

// vite precisa carregar os módulos ANTES do relógio/Math.random serem
// trocados (evita qualquer risco de afetar o próprio pipeline de transform
// do vite) — o patch entra logo depois, antes de qualquer chamada de
// simulação.
const { createServer } = await import('vite');
const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
  const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
  const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
  const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
  const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
  const { buildSupplementalRankingPopulation } = await vite.ssrLoadModule('/src/lib/rankingPopulation.js');
  const { buildSeasonTournaments } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { resolveCompletedWorldTourEvents } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');
  const { generateTournamentOpponent } = await vite.ssrLoadModule('/src/lib/career.js');
  const { BOTS_BY_DIFFICULTY, BOT_DIFFICULTIES } = await vite.ssrLoadModule('/src/lib/bots.js');
  const { getRealAthletes } = await vite.ssrLoadModule('/src/players/realAthletes.js');
  const { evaluateTournamentEntry, buildAthleteEntryContext } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');

  const seedInt = installDeterminism(SEED);
  console.log(`Seed: "${SEED}" (hash ${seedInt}) — Math.random e relógio determinísticos a partir daqui.`);

  // ═══════════════ Setup: carreira sintética só para ter storage/entities ═══════════════
  const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
  activeCareerAdapter.careerManager = manager;
  const { career } = await manager.createCareer({ playerName: 'world-sim' });
  activeCareerAdapter.setActiveCareer(career);
  await activeCareerAdapter.createPlayerProfile({
    id: 'world-sim-player', sport_name: 'World Sim', career_date: `${START_YEAR}-01-01`, birth_date: '2000-01-01',
    level: 'Amador', play_style: 'controle', court_side: 'direita', preferred_side: 'right', handedness: 'right',
    tactical_role: 'controlador', overall: 52, overall_rating: 52, ranking_position: 900, reputation: 55,
    energy: 100, fatigue: 0, coins: 5000, xp: 0, morale: 70, form: 50, weekly_training_enabled: false,
  });
  const profile = await localGame.entities.PlayerProfile.get('world-sim-player');

  // ═══════════════ Seed: pipeline de produção (saveFoundation.js), sem window.dispatchEvent, com ids explícitos ═══════════════
  const realAthleteIds = new Set();
  const realTeamKeys = new Set();
  const historicalDuplas = worldSeed.teams.map((team) => ({
    team_key: team.team_key, player1_id: team.player1_id, player2_id: team.player2_id,
    names: `${team.player1_name} & ${team.player2_name}`,
  }));
  for (const athlete of worldSeed.athletes) {
    await localGame.entities.AthleteProfile.create({ ...athlete, id: athlete.bot_id });
    realAthleteIds.add(athlete.bot_id);
  }
  for (const team of worldSeed.teams) {
    await localGame.entities.TeamRanking.create({ ...team, id: team.team_key });
    realTeamKeys.add(team.team_key);
  }
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const seededTeams = await localGame.entities.TeamRanking.list('-ranking_points', 600);
  const supplementalFull = buildSupplementalRankingPopulation(seededAthletes, seededTeams);
  // Amostra: os primeiros N por rank da MESMA curva de produção (não uma
  // população paralela). Id explícito (bot_id/team_key) em vez de deixar
  // create/bulkCreate cair no fallback makeId() — ver nota de determinismo.
  const supplementalAthletes = supplementalFull.athletes.slice(0, PROCEDURAL_ATHLETE_SAMPLE).map((a) => ({ ...a, id: a.bot_id }));
  const supplementalTeams = supplementalFull.teams.slice(0, PROCEDURAL_TEAM_SAMPLE).map((t) => ({ ...t, id: t.team_key }));
  await localGame.entities.AthleteProfile.bulkCreate(supplementalAthletes);
  await localGame.entities.TeamRanking.bulkCreate(supplementalTeams);
  const totalAthletes = seededAthletes.length + supplementalAthletes.length;
  const totalTeams = seededTeams.length + supplementalTeams.length;

  console.log(`Elenco: ${realAthleteIds.size} atletas reais + ${supplementalAthletes.length} bots procedurais (amostra de ${supplementalFull.athletes.length} gerados pela fórmula de produção) = ${totalAthletes} atletas.`);
  console.log(`Duplas: ${realTeamKeys.size} reais + ${supplementalTeams.length} bots = ${totalTeams} duplas.`);

  // ═══════════════ Simulação de mundo — N temporadas, sem intervenção de jogador ═══════════════
  const tournamentResultsAll = [];
  const perSeason = [];
  const duplaSamplesOverall = new Map(historicalDuplas.map((d) => [d.team_key, []]));

  let cursor = `${START_YEAR}-01-01`;
  let priorTournamentsPlayed = new Map(seededAthletes.concat(supplementalAthletes).map((a) => [a.id, 0]));
  const neverPlayedRunningSet = new Set(realAthleteIds);

  for (let yearIndex = 0; yearIndex < SEASONS; yearIndex += 1) {
    const year = START_YEAR + yearIndex;
    const seasonTournaments = buildSeasonTournaments(year, `season-${year}`);
    // A criação da carreira sintética já popula um calendário de demonstração
    // (localSeed.js) que pode colidir por id com o calendário real gerado
    // aqui para o mesmo ano — evita duplicar, sem alterar nenhum torneio já
    // existente.
    const existingIds = new Set((await localGame.entities.Tournament.list('-start_date', 2000)).map((t) => t.id));
    const newTournaments = seasonTournaments.filter((t) => !existingIds.has(t.id));
    if (newTournaments.length) await localGame.entities.Tournament.bulkCreate(newTournaments);

    // ── Elegibilidade de um jogador ranqueado #1000 (fonte correta e
    // usada de fato pela inscrição do jogador: EntryManager.js, não o
    // chooseTournament interno do World Tour) ──
    const eligibleDates = [];
    for (const tournament of seasonTournaments) {
      const entry = evaluateTournamentEntry(tournament, buildAthleteEntryContext({}, 1000, tournament));
      if (entry.eligible) eligibleDates.push(tournament.start_date);
    }
    eligibleDates.sort();
    let maxGapDays = null;
    for (let i = 1; i < eligibleDates.length; i += 1) {
      const gap = daysBetween(eligibleDates[i - 1], eligibleDates[i]);
      if (maxGapDays === null || gap > maxGapDays) maxGapDays = gap;
    }

    const duplaSamplesThisSeason = new Map(historicalDuplas.map((d) => [d.team_key, []]));
    const tournamentResultsThisSeason = [];

    let lastMonth = cursor.slice(0, 7);
    const stepsPerYear = Math.ceil(366 / STEP_DAYS) + 1;
    for (let step = 1; step <= stepsPerYear; step += 1) {
      const previousCursor = cursor;
      cursor = addDays(cursor, STEP_DAYS);
      if (cursor.slice(0, 4) !== String(year) && step > Math.floor(340 / STEP_DAYS)) break;

      await processAiPartnershipMarket(profile, previousCursor, cursor).catch(() => {});
      const resolution = await resolveCompletedWorldTourEvents(cursor).catch(() => null);
      if (resolution?.tournaments?.length) {
        for (const tournamentUpdate of resolution.tournaments) {
          const tournament = await localGame.entities.Tournament.get(tournamentUpdate.id).catch(() => null);
          const [championPartnership] = await Promise.all([
            tournamentUpdate.champion_partnership_id ? localGame.entities.Partnership.get(tournamentUpdate.champion_partnership_id).catch(() => null) : null,
          ]);
          const championIds = championPartnership ? [championPartnership.athlete_a_id, championPartnership.athlete_b_id] : [];
          const championRealCount = championIds.filter((id) => realAthleteIds.has(id)).length;
          const [athleteA, athleteB] = await Promise.all(championIds.map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)));
          const championOvrAvg = (athleteA && athleteB) ? round((Number(athleteA.overall_rating) + Number(athleteB.overall_rating)) / 2, 1) : null;
          const mainDrawSize = Number(tournament?.main_draw_size) || null;
          const simulatedEntrants = Number(tournamentUpdate.simulated_entrants) || 0;
          const row = {
            year, tournament_id: tournamentUpdate.id, tier: tournament?.tier || 'desconhecido',
            champion_name: tournamentUpdate.champion, champion_ids: championIds.join('|'),
            champion_real_count: championRealCount, champion_ovr_avg: championOvrAvg,
            classification: championIds.length === 0 ? 'desconhecido' : championRealCount === 2 ? '100%_reais' : championRealCount === 1 ? 'mista' : '100%_bots',
            main_draw_size: mainDrawSize, simulated_entrants: simulatedEntrants,
            incomplete: mainDrawSize ? simulatedEntrants < mainDrawSize : null,
          };
          tournamentResultsThisSeason.push(row);
          tournamentResultsAll.push(row);
        }
      }

      const currentMonth = cursor.slice(0, 7);
      if (currentMonth !== lastMonth) {
        lastMonth = currentMonth;
        const partnerLookup = await Promise.all(
          historicalDuplas.map(async (dupla) => {
            const [p1, p2] = await Promise.all([
              localGame.entities.AthleteProfile.get(dupla.player1_id).catch(() => null),
              localGame.entities.AthleteProfile.get(dupla.player2_id).catch(() => null),
            ]);
            return Boolean(p1?.ai_partner_id === dupla.player2_id || p2?.ai_partner_id === dupla.player1_id);
          }),
        );
        historicalDuplas.forEach((dupla, index) => {
          duplaSamplesThisSeason.get(dupla.team_key).push(partnerLookup[index]);
          duplaSamplesOverall.get(dupla.team_key).push(partnerLookup[index]);
        });
      }
    }

    // ── Snapshots de fim de temporada ──
    const allAthletesNow = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
    const top20 = allAthletesNow.slice(0, 20);
    const realInTop20 = top20.filter((a) => realAthleteIds.has(a.id)).length;

    const currentTournamentsPlayed = new Map(allAthletesNow.map((a) => [a.id, Number(a.tournaments_played) || 0]));
    const realDeltas = [];
    const botDeltas = [];
    for (const a of allAthletesNow) {
      const before = priorTournamentsPlayed.get(a.id) || 0;
      const after = currentTournamentsPlayed.get(a.id) || 0;
      const delta = Math.max(0, after - before);
      if (realAthleteIds.has(a.id)) { realDeltas.push(delta); if (after > 0) neverPlayedRunningSet.delete(a.id); }
      else botDeltas.push(delta);
    }
    priorTournamentsPlayed = currentTournamentsPlayed;

    const byTierThisSeason = {};
    for (const row of tournamentResultsThisSeason) {
      byTierThisSeason[row.tier] = byTierThisSeason[row.tier] || { titles: { '100%_reais': 0, mista: 0, '100%_bots': 0, desconhecido: 0 }, championOvrs: [], incompleteCount: 0, total: 0 };
      byTierThisSeason[row.tier].titles[row.classification] = (byTierThisSeason[row.tier].titles[row.classification] || 0) + 1;
      byTierThisSeason[row.tier].total += 1;
      if (row.champion_ovr_avg != null) byTierThisSeason[row.tier].championOvrs.push(row.champion_ovr_avg);
      if (row.incomplete) byTierThisSeason[row.tier].incompleteCount += 1;
    }
    for (const tier of Object.keys(byTierThisSeason)) {
      const entry = byTierThisSeason[tier];
      entry.championOvrAvg = entry.championOvrs.length ? round(mean(entry.championOvrs), 1) : null;
      entry.championOvrMedian = entry.championOvrs.length ? round(median(entry.championOvrs), 1) : null;
      delete entry.championOvrs;
    }

    const seasonRecord = {
      year,
      tournaments: {
        total: tournamentResultsThisSeason.length,
        incomplete: tournamentResultsThisSeason.filter((r) => r.incomplete).length,
        incompleteList: tournamentResultsThisSeason.filter((r) => r.incomplete).map((r) => ({ id: r.tournament_id, tier: r.tier, simulated_entrants: r.simulated_entrants, main_draw_size: r.main_draw_size })),
      },
      byTier: byTierThisSeason,
      top20: top20.map((a, index) => ({ position: index + 1, id: a.id, name: a.name, points: a.world_ranking_points, real: realAthleteIds.has(a.id) })),
      realInTop20,
      tournamentsPlayedThisSeason: {
        real: { mean: round(mean(realDeltas), 2), median: round(median(realDeltas), 2), n: realDeltas.length },
        bots: { mean: round(mean(botDeltas), 2), median: round(median(botDeltas), 2), n: botDeltas.length },
      },
      realAthletesNeverPlayedSoFar: [...neverPlayedRunningSet].map((id) => ({ id, name: realAthleteIds.has(id) ? (worldSeed.athletes.find((a) => a.bot_id === id)?.name || id) : id })),
      historicalDuplasThisSeason: historicalDuplas.map((dupla) => {
        const samples = duplaSamplesThisSeason.get(dupla.team_key);
        return { team_key: dupla.team_key, names: dupla.names, samples: samples.length, pairedRatePct: samples.length ? round((samples.filter(Boolean).length / samples.length) * 100, 1) : null };
      }),
      player1000Eligibility: {
        totalTournamentsInCalendar: seasonTournaments.length,
        eligibleCount: eligibleDates.length,
        maxGapDays,
        eligibleDates,
      },
    };
    perSeason.push(seasonRecord);
    console.log(`Temporada ${year}: Top 20 tem ${realInTop20}/20 reais · #1000 elegível para ${eligibleDates.length}/${seasonTournaments.length} torneios (maior intervalo: ${maxGapDays ?? '—'} dias) · ${seasonRecord.tournaments.incomplete}/${seasonRecord.tournaments.total} chaves incompletas.`);
  }

  // ═══════════════ Cumulativo (toda a corrida) ═══════════════
  const finalAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const finalReal = finalAthletes.filter((a) => realAthleteIds.has(a.id));
  const finalBots = finalAthletes.filter((a) => !realAthleteIds.has(a.id));
  const realTotals = finalReal.map((a) => Number(a.tournaments_played) || 0);
  const botTotals = finalBots.map((a) => Number(a.tournaments_played) || 0);
  const realNeverPlayed = finalReal.filter((a) => !Number(a.tournaments_played)).map((a) => ({ id: a.id, name: a.name }));

  const byClassification = tournamentResultsAll.reduce((acc, row) => { acc[row.classification] = (acc[row.classification] || 0) + 1; return acc; }, {});
  const byTierClassification = {};
  for (const row of tournamentResultsAll) {
    byTierClassification[row.tier] = byTierClassification[row.tier] || {};
    byTierClassification[row.tier][row.classification] = (byTierClassification[row.tier][row.classification] || 0) + 1;
  }
  const historicalDuplasOverall = historicalDuplas.map((dupla) => {
    const samples = duplaSamplesOverall.get(dupla.team_key);
    return { team_key: dupla.team_key, names: dupla.names, samples: samples.length, pairedRatePct: samples.length ? round((samples.filter(Boolean).length / samples.length) * 100, 1) : null };
  });

  // ═══════════════ Amostragem do catálogo de adversários DO JOGADOR (pool separado) ═══════════════
  const catalogRealIds = new Set(getRealAthletes().map((a) => a.id || a.template_id));
  const poolComposition = BOT_DIFFICULTIES.map((tier) => {
    const pool = BOTS_BY_DIFFICULTY[tier.id] || [];
    const real = pool.filter((bot) => catalogRealIds.has(bot.id) || catalogRealIds.has(bot.template_id) || bot.source_type === 'real').length;
    return { tier: tier.id, label: tier.label, total: pool.length, real, fictional: pool.length - real };
  });
  const lendaPool = BOTS_BY_DIFFICULTY.lenda || [];
  const SAMPLES = 500;
  let drawsWithAtLeastOneReal = 0;
  let drawsWithTwoReal = 0;
  for (let i = 0; i < SAMPLES; i += 1) {
    const fakeTournament = { id: `sample-crown-${i}`, tier: 'Crown', start_date: '2026-11-01' };
    const fakeProfile = { id: `sample-player-${i}` };
    const opponents = generateTournamentOpponent(fakeTournament, fakeProfile, 5, [], 0, 'main');
    const realCount = opponents.filter((bot) => catalogRealIds.has(bot.id) || catalogRealIds.has(bot.template_id) || bot.source_type === 'real').length;
    if (realCount >= 1) drawsWithAtLeastOneReal += 1;
    if (realCount === 2) drawsWithTwoReal += 1;
  }

  // ═══════════════ Relatório ═══════════════
  mkdirSync(OUT_DIR, { recursive: true });

  const summary = {
    generatedAt: new Date().toISOString(),
    seed: SEED,
    determinism: {
      note: 'Math.random e o relógio são seedados a partir de --seed só neste processo. Auditoria de código confirma zero Math.random() no caminho de simulação — o motor já é 100% hash determinístico de (id, mês, id do torneio). Ids de AthleteProfile/TeamRanking criados por este harness são sempre explícitos (bot_id/team_key), nunca o fallback aleatório de CareerEntityRepository.js.',
    },
    seasonsSimulated: SEASONS,
    proceduralAthleteSample: PROCEDURAL_ATHLETE_SAMPLE,
    proceduralTeamSample: PROCEDURAL_TEAM_SAMPLE,
    stepDays: STEP_DAYS,
    roster: {
      realAthletes: realAthleteIds.size, proceduralAthletes: supplementalAthletes.length, totalAthletes,
      realTeams: realTeamKeys.size, proceduralTeams: supplementalTeams.length, totalTeams,
    },
    perSeason,
    cumulative: {
      tournamentsResolved: tournamentResultsAll.length,
      byClassification,
      byTierClassification,
      tournamentsPlayed: {
        real: { mean: round(mean(realTotals), 2), median: round(median(realTotals), 2) },
        bots: { mean: round(mean(botTotals), 2), median: round(median(botTotals), 2) },
      },
      realAthletesNeverInAnyDraw: realNeverPlayed,
      realAthletesNeverInAnyDrawCount: realNeverPlayed.length,
      realAthletesTotal: realAthleteIds.size,
      historicalDuplasOverall,
    },
    playerOpponentCatalog: {
      poolComposition,
      lendaSampling: {
        samples: SAMPLES, roundTested: 'Crown, rodada 6 (final)',
        drawsWithAtLeastOneReal, drawsWithAtLeastOneRealPct: round((drawsWithAtLeastOneReal / SAMPLES) * 100, 1),
        drawsWithTwoReal, drawsWithTwoRealPct: round((drawsWithTwoReal / SAMPLES) * 100, 1),
        theoreticalAtLeastOnePct: (() => {
          const total = lendaPool.length; const real = poolComposition.find((p) => p.tier === 'lenda')?.real || 0; const bots = total - real;
          if (total < 2) return null;
          const c2 = (n) => (n * (n - 1)) / 2;
          return round((1 - c2(bots) / c2(total)) * 100, 1);
        })(),
      },
    },
  };

  writeFileSync(`${OUT_DIR}/summary.json`, JSON.stringify(summary, null, 2));

  const csvRows = ['year,tournament_id,tier,champion_name,champion_ids,champion_real_count,champion_ovr_avg,classification,main_draw_size,simulated_entrants,incomplete'];
  for (const row of tournamentResultsAll) {
    csvRows.push([row.year, row.tournament_id, row.tier, JSON.stringify(row.champion_name || ''), row.champion_ids, row.champion_real_count, row.champion_ovr_avg ?? '', row.classification, row.main_draw_size ?? '', row.simulated_entrants, row.incomplete].join(','));
  }
  writeFileSync(`${OUT_DIR}/tournament-results.csv`, csvRows.join('\n'));

  // ── Tabela temporada × tier em markdown ──
  const TIERS_ORDER = ['Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown'];
  const mdLines = [
    `# Baseline — temporada × tier (seed: \`${SEED}\`, ${SEASONS} temporadas, ${PROCEDURAL_ATHLETE_SAMPLE} bots)`,
    '',
    '| Temporada | Tier | Títulos 100% reais | Mistos | 100% bots | OVR médio do campeão | Chaves incompletas |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const season of perSeason) {
    for (const tier of TIERS_ORDER) {
      const t = season.byTier[tier];
      if (!t) continue;
      mdLines.push(`| ${season.year} | ${tier} | ${t.titles['100%_reais'] || 0} | ${t.titles.mista || 0} | ${t.titles['100%_bots'] || 0} | ${t.championOvrAvg ?? '—'} | ${t.incompleteCount}/${t.total} |`);
    }
  }
  mdLines.push('', '## #1000 — elegibilidade e cadência', '', '| Temporada | Eventos elegíveis | Total no calendário | Maior intervalo (dias) |', '|---|---|---|---|');
  for (const season of perSeason) mdLines.push(`| ${season.year} | ${season.player1000Eligibility.eligibleCount} | ${season.player1000Eligibility.totalTournamentsInCalendar} | ${season.player1000Eligibility.maxGapDays ?? '—'} |`);
  mdLines.push('', '## Duplas históricas — % pareadas por temporada', '', `| Dupla | ${perSeason.map((s) => s.year).join(' | ')} |`, `|---|${perSeason.map(() => '---').join('|')}|`);
  for (const dupla of historicalDuplas) {
    mdLines.push(`| ${dupla.names} | ${perSeason.map((s) => `${s.historicalDuplasThisSeason.find((d) => d.team_key === dupla.team_key)?.pairedRatePct ?? '—'}%`).join(' | ')} |`);
  }
  writeFileSync(`${OUT_DIR}/season-tier-table.md`, mdLines.join('\n'));

  console.log('\n=== RESUMO CUMULATIVO ===');
  console.log(`Torneios resolvidos (mundo, sem o jogador): ${tournamentResultsAll.length}`);
  console.log('Classificação dos campeões:', byClassification);
  console.log(`Torneios disputados — reais: média ${summary.cumulative.tournamentsPlayed.real.mean} / mediana ${summary.cumulative.tournamentsPlayed.real.median} · bots: média ${summary.cumulative.tournamentsPlayed.bots.mean} / mediana ${summary.cumulative.tournamentsPlayed.bots.median}`);
  console.log(`Atletas reais que NUNCA apareceram em nenhuma chave: ${realNeverPlayed.length}/${realAthleteIds.size}`);
  console.log(`\nRelatório salvo em ${OUT_DIR}/summary.json, ${OUT_DIR}/tournament-results.csv e ${OUT_DIR}/season-tier-table.md`);
} finally {
  await vite.close();
}
