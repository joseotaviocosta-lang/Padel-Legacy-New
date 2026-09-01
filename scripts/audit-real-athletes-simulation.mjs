// Auditoria — Atletas reais vs. bots no ecossistema do jogo.
// FASE 0 do plano de correção: harness-JUIZ, instrumentado por
// (temporada × tier), determinístico, e usado para congelar a baseline
// pré-refactor. NÃO reimplementa nenhuma regra de jogo — chama exatamente
// as funções que o CAMINHO REAL de avanço de dia chama (advanceDay +
// processGameStateDay, um dia real por vez — o mesmo par que
// game-core/calendarLifecycle.js:advanceCareerDayWork usa a cada "avançar
// dia" de verdade), sem atalhos. Fase 0.1: uma versão anterior chamava só
// processAiPartnershipMarket + resolveCompletedWorldTourEvents, em lotes de
// vários dias — um teste de paridade (scripts/audit-parity-test.mjs) contra
// este caminho real mostrou 68% dos campeões divergindo na mesma temporada
// com a mesma seed. Corrigido: dia a dia, sem pular nenhum sistema diário
// (simulateWorldDay, processWorldCircuit, etc. — todos os que
// processGameStateDay já chama em produção).
//
// Uso:
//   node scripts/audit-real-athletes-simulation.mjs [--seasons=5] [--seed=baseline-v1]
//     [--proceduralAthletes=970] [--proceduralTeams=486] [--out=reports/real-athletes-audit]
//
// Saída: <out>/summary.json (por temporada × tier + cumulativo),
// <out>/tournament-results.csv, <out>/season-tier-table.md.
//
// Custo: por rodar dia a dia pelo caminho real (não em lotes), este harness
// é MUITO mais caro que a versão anterior — a camada de storage da carreira
// clona o save inteiro a cada escrita de entidade, e processGameStateDay
// escreve várias vezes por dia (até ~80 atletas/dia só em simulateWorldDay).
// Reduza --proceduralAthletes/--proceduralTeams para iteração rápida; a
// baseline oficial usa os valores de produção completos (970/486).
import { writeFileSync, mkdirSync } from 'node:fs';
import worldSeed from '../src/data/worldSeed2025.json' with { type: 'json' };

const args = Object.fromEntries(process.argv.slice(2).map((v) => v.replace(/^--/, '').split('=')));
const SEASONS = Math.max(1, Number(args.seasons || 5));
const START_YEAR = 2026;
const OUT_DIR = args.out || 'reports/real-athletes-audit';
const SEED = String(args.seed || 'baseline-v1');
const PROCEDURAL_ATHLETE_SAMPLE = Math.max(1, Number(args.proceduralAthletes || 970));
const PROCEDURAL_TEAM_SAMPLE = Math.max(1, Number(args.proceduralTeams || 486));

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
// Corrigido SEM tocar em nenhum arquivo de jogo: Math.random e o relógio
// "atual" são substituídos por versões seedadas ANTES de qualquer criação de
// entidade, e todo AthleteProfile/TeamRanking é criado SEM id explícito —
// deixando o próprio fallback `makeId()` de produção rodar (agora
// determinístico graças ao patch acima). Fase 0.1 (achado crítico):
// uma versão anterior FORÇAVA `id: athlete.bot_id`/`id: team.team_key` —
// isso parecia mais "limpo", mas produz um formato/comprimento de string
// diferente do que produção realmente usa (nem worldSeed2025.json nem
// buildSupplementalRankingPopulation incluem `id`), e a seleção por hash em
// aiPartnershipLifecycle.js (selectPair) não é robusta a essa variação —
// trocar só o FORMATO do id (sem tocar em nenhuma lógica) mudou o resultado
// de ~0% para ~90%+ de pareamento real-real no ano 1 (ver
// scripts/diag-pairing-mechanism.mjs). bot_id/team_key nunca viram o `.id`
// real aqui — só chaves de leitura para agrupar as 12 duplas históricas no
// relatório.
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
  const { generateTournamentOpponent, advanceDay } = await vite.ssrLoadModule('/src/lib/career.js');
  const { processGameStateDay } = await vite.ssrLoadModule('/src/game-core/gameStateLifecycle.js');
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
    trainings_today: 0, practice_matches_today: 0, tournament_matches_today: 0,
  });
  const profile = await localGame.entities.PlayerProfile.get('world-sim-player');

  // ═══════════════ Seed: pipeline de produção (saveFoundation.js), sem window.dispatchEvent ═══════════════
  // Fase 0.1 (achado crítico): nem worldSeed2025.json nem
  // buildSupplementalRankingPopulation incluem um campo `id` — em PRODUÇÃO,
  // create()/bulkCreate() sempre caem no fallback `makeId()`
  // (CareerEntityRepository.js: `${prefix}-${Date.now()}-${Math.random()...}`),
  // gerando um id "comprido" tanto para atletas reais quanto procedurais.
  // `bot_id`/`team_key` são só chaves de upsert — NUNCA o `.id` real da
  // entidade. Uma versão anterior deste harness usava `id: athlete.bot_id`
  // diretamente (mais curto, mesmo formato para todo real) por engano —
  // isso mudava DRASTICAMENTE o resultado da seleção por hash em
  // aiPartnershipLifecycle.js (selectPair), porque o hash FNV-1a usado ali
  // não é robusto a variação de comprimento/forma de string entre grupos
  // (confirmado empiricamente em scripts/diag-pairing-mechanism.mjs: o MESMO
  // código, só trocando o formato do id, vai de ~0 para ~22/24 reais
  // pareados no ano 1). Corrigido: NÃO passar `id` explícito — o
  // Math.random/relógio já determinísticos (installDeterminism, acima)
  // fazem o PRÓPRIO fallback de produção gerar ids no MESMO formato real,
  // de forma reproduzível.
  const realAthleteIds = new Set();
  const realTeamKeys = new Set();
  const botIdToAssignedId = new Map(); // bot_id/team_key (chave do seed) -> id real atribuído pelo makeId()
  const assignedIdToName = new Map();
  for (const athlete of worldSeed.athletes) {
    const created = await localGame.entities.AthleteProfile.create({ ...athlete });
    realAthleteIds.add(created.id);
    botIdToAssignedId.set(athlete.bot_id, created.id);
    assignedIdToName.set(created.id, created.name);
  }
  for (const team of worldSeed.teams) {
    const created = await localGame.entities.TeamRanking.create({
      ...team,
      player1_id: botIdToAssignedId.get(team.player1_id) || team.player1_id,
      player2_id: botIdToAssignedId.get(team.player2_id) || team.player2_id,
    });
    realTeamKeys.add(created.id);
  }
  const historicalDuplas = worldSeed.teams.map((team) => ({
    team_key: team.team_key,
    player1_id: botIdToAssignedId.get(team.player1_id) || team.player1_id,
    player2_id: botIdToAssignedId.get(team.player2_id) || team.player2_id,
    names: `${team.player1_name} & ${team.player2_name}`,
  }));
  const seededAthletes = await localGame.entities.AthleteProfile.list('-world_ranking_points', 1100);
  const seededTeams = await localGame.entities.TeamRanking.list('-ranking_points', 600);
  const supplementalFull = buildSupplementalRankingPopulation(seededAthletes, seededTeams);
  // Amostra: os primeiros N por rank da MESMA curva de produção (não uma
  // população paralela). Sem id explícito — mesmo motivo do bloco acima.
  const supplementalAthletesPayload = supplementalFull.athletes.slice(0, PROCEDURAL_ATHLETE_SAMPLE);
  const supplementalTeamsPayload = supplementalFull.teams.slice(0, PROCEDURAL_TEAM_SAMPLE);
  const supplementalAthletes = await localGame.entities.AthleteProfile.bulkCreate(supplementalAthletesPayload);
  const supplementalTeams = await localGame.entities.TeamRanking.bulkCreate(supplementalTeamsPayload);
  const totalAthletes = seededAthletes.length + supplementalAthletes.length;
  const totalTeams = seededTeams.length + supplementalTeams.length;

  console.log(`Elenco: ${realAthleteIds.size} atletas reais + ${supplementalAthletes.length} bots procedurais (amostra de ${supplementalFull.athletes.length} gerados pela fórmula de produção) = ${totalAthletes} atletas.`);
  console.log(`Duplas: ${realTeamKeys.size} reais + ${supplementalTeams.length} bots = ${totalTeams} duplas.`);

  // ═══════════════ Simulação de mundo — N temporadas, dia a dia, pelo CAMINHO REAL de produção ═══════════════
  // Fase 0.1 (achado crítico #2): a versão anterior deste harness chamava só
  // processAiPartnershipMarket + resolveCompletedWorldTourEvents, em passos
  // de 14 dias — um teste de paridade contra o caminho real (advanceDay +
  // processGameStateDay, dia a dia — o par exato que
  // game-core/calendarLifecycle.js:advanceCareerDayWork chama a cada
  // "avançar dia" real) mostrou 21/31 campeões DIFERENTES (68%) numa mesma
  // temporada com a mesma seed (scripts/audit-parity-test.mjs). Causa:
  // simulateWorldDay (game-core/worldSimulationLifecycle.js) muda
  // overall_rating/form/energia (e pode lesionar) até 80 atletas por dia —
  // entra direto em athleteScore/pairScore (WorldTourLifecycle.js) e não
  // tem equivalente em lotes de 14 dias. Corrigido: o harness agora chama
  // exatamente advanceDay + processGameStateDay, TODO dia, como o jogo
  // realmente faz — nenhum atalho. O calendário de torneios também deixa de
  // ser criado por este script: createPlayerProfile já popula o primeiro
  // ano (mesmo bootstrap de uma carreira real), e advanceDay chama
  // ensureFutureTournaments sozinho a cada virada de mês, como em produção.
  const tournamentResultsAll = [];
  const perSeason = [];
  const duplaSamplesOverall = new Map(historicalDuplas.map((d) => [d.team_key, []]));
  const recordedTournamentIds = new Set();

  let priorTournamentsPlayed = new Map(seededAthletes.concat(supplementalAthletes).map((a) => [a.id, 0]));
  const neverPlayedRunningSet = new Set(realAthleteIds);

  async function recordNewlyFinalizedTournaments(year, bucket) {
    const finalized = (await localGame.entities.Tournament.list('-start_date', 2000))
      .filter((t) => t.world_tour_event && t.status === 'finalizado' && !recordedTournamentIds.has(t.id));
    for (const tournament of finalized) {
      recordedTournamentIds.add(tournament.id);
      const championPartnership = tournament.champion_partnership_id
        ? await localGame.entities.Partnership.get(tournament.champion_partnership_id).catch(() => null) : null;
      const championIds = championPartnership ? [championPartnership.athlete_a_id, championPartnership.athlete_b_id] : [];
      const championRealCount = championIds.filter((id) => realAthleteIds.has(id)).length;
      const [athleteA, athleteB] = await Promise.all(championIds.map((id) => localGame.entities.AthleteProfile.get(id).catch(() => null)));
      const championOvrAvg = (athleteA && athleteB) ? round((Number(athleteA.overall_rating) + Number(athleteB.overall_rating)) / 2, 1) : null;
      const mainDrawSize = Number(tournament.main_draw_size) || null;
      const simulatedEntrants = Number(tournament.simulated_entrants) || 0;
      const row = {
        year, tournament_id: tournament.id, tier: tournament.tier || 'desconhecido',
        champion_name: tournament.champion, champion_ids: championIds.join('|'),
        champion_real_count: championRealCount, champion_ovr_avg: championOvrAvg,
        classification: championIds.length === 0 ? 'desconhecido' : championRealCount === 2 ? '100%_reais' : championRealCount === 1 ? 'mista' : '100%_bots',
        main_draw_size: mainDrawSize, simulated_entrants: simulatedEntrants,
        incomplete: mainDrawSize ? simulatedEntrants < mainDrawSize : null,
      };
      bucket.push(row);
      tournamentResultsAll.push(row);
    }
  }

  let currentProfile = profile;
  let oldDate = currentProfile.career_date;
  let currentYear = Number(oldDate.slice(0, 4));
  let tournamentResultsThisSeason = [];
  let duplaSamplesThisSeason = new Map(historicalDuplas.map((d) => [d.team_key, []]));
  let lastSampledMonth = oldDate.slice(0, 7);
  const finalYear = START_YEAR + SEASONS - 1;

  async function finalizeSeasonRecord(year) {
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

    // Elegibilidade de um jogador #1000 — lida do calendário REAL desta
    // temporada (o que ensureFutureTournaments efetivamente criou), não de
    // uma reconstrução paralela via buildSeasonTournaments.
    const seasonTournaments = (await localGame.entities.Tournament.list('-start_date', 2000))
      .filter((t) => t.world_tour_event && String(t.year || t.start_date?.slice(0, 4)) === String(year));
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
      realAthletesNeverPlayedSoFar: [...neverPlayedRunningSet].map((id) => ({ id, name: assignedIdToName.get(id) || id })),
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

  dayLoop:
  for (let day = 0; day < SEASONS * 367; day += 1) {
    try {
      currentProfile = await advanceDay(currentProfile, {});
    } catch (error) {
      console.warn(`[Universo produção] advanceDay bloqueado em ${oldDate}:`, error?.message || error);
      break;
    }
    const newDate = currentProfile.career_date;
    const result = await processGameStateDay(currentProfile, oldDate, newDate).catch((error) => {
      console.warn(`[Universo produção] processGameStateDay falhou em ${newDate}:`, error?.message || error);
      return null;
    });
    currentProfile = result?.profile || currentProfile;
    oldDate = newDate;

    await recordNewlyFinalizedTournaments(currentYear, tournamentResultsThisSeason);

    const sampledMonth = newDate.slice(0, 7);
    if (sampledMonth !== lastSampledMonth) {
      lastSampledMonth = sampledMonth;

      // Fase 0.1 (achado C — memória): nada em produção jamais APAGA
      // WorldEvent (expireMacroEvents só marca is_active:false). Isso é uma
      // característica real do jogo, não um bug deste harness — mas como a
      // camada de storage clona a carreira INTEIRA a cada escrita, e este
      // harness roda ~1800 dias reais em vez dos poucos avanços manuais de
      // uma sessão normal, a coleção cresce sem limite e cada escrita
      // seguinte fica mais cara, até estourar a memória (~3 temporadas,
      // confirmado empiricamente). Poda só o WorldEvent (nunca lido por
      // nenhuma métrica deste relatório) para manter o custo por escrita
      // aproximadamente constante — não simula nada, só evita que o
      // harness pague um custo de memória que uma sessão real de jogador
      // (poucos dias por vez, não milhares seguidos) nunca paga de uma vez.
      // Fase 0.1 — diagnóstico confirmou que WorldEvent NÃO é a única coleção
      // sem poda: CareerMessage, TeamRanking e Partnership também crescem
      // linearmente pelo mesmo motivo (nenhum sistema de produção jamais
      // apaga uma dupla dissolvida ou uma mensagem antiga — só marca status).
      // Nenhuma dessas três é lida por nenhuma métrica deste harness depois
      // do mês em que é criada (TeamRanking nunca é lido no loop diário;
      // Partnership só é lido no mesmo mês em que um torneio termina, via
      // recordNewlyFinalizedTournaments, ANTES desta poda rodar). Podar é
      // seguro para as métricas e necessário para não estourar memória.
      const pruneOps = [];
      const recentEvents = await localGame.entities.WorldEvent.list('-created_date', 5000).catch(() => []);
      recentEvents.slice(300).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'WorldEvent', id: row.id }));
      const recentMessages = await localGame.entities.CareerMessage.list('-created_date', 5000).catch(() => []);
      recentMessages.slice(50).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'CareerMessage', id: row.id }));
      const allTeamRankings = await localGame.entities.TeamRanking.list(null, 20000).catch(() => []);
      allTeamRankings.filter((row) => !realTeamKeys.has(row.id)).forEach((row) => pruneOps.push({ type: 'delete', entityName: 'TeamRanking', id: row.id }));
      const allPartnerships = await localGame.entities.Partnership.list(null, 20000).catch(() => []);
      allPartnerships.filter((row) => row.status !== 'ativa').forEach((row) => pruneOps.push({ type: 'delete', entityName: 'Partnership', id: row.id }));
      // Torneios de anos já processados e distantes (o horizonte de
      // ensureFutureTournaments nunca olha para trás) — mantém o ano atual e
      // o anterior por segurança.
      const allTournaments = await localGame.entities.Tournament.list(null, 20000).catch(() => []);
      allTournaments
        .filter((row) => recordedTournamentIds.has(row.id) && Number(row.year || String(row.start_date).slice(0, 4)) < Number(sampledMonth.slice(0, 4)) - 1)
        .forEach((row) => pruneOps.push({ type: 'delete', entityName: 'Tournament', id: row.id }));
      for (let i = 0; i < pruneOps.length; i += 500) {
        await localGame.batch(pruneOps.slice(i, i + 500)).catch(() => {});
      }
      if (process.env.DIAG_SIZES) {
        const names = ['WorldEvent', 'CareerMessage', 'Tournament', 'AthleteProfile', 'TeamRanking', 'Partnership', 'MonthlyCareerReport', 'AnnualCareerReport', 'PressArticle', 'Post', 'HistoryEntry', 'FinancialTransaction', 'TournamentRegistration', 'CalendarEvent'];
        const sizes = {};
        for (const name of names) {
          try { sizes[name] = (await localGame.entities[name].list(null, 20000)).length; } catch { sizes[name] = 'n/a'; }
        }
        console.log(`[DIAG ${newDate}] tamanhos:`, JSON.stringify(sizes));
      }

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

    const newYear = Number(newDate.slice(0, 4));
    if (newYear !== currentYear) {
      await finalizeSeasonRecord(currentYear);
      if (currentYear >= finalYear) break dayLoop;
      currentYear = newYear;
      tournamentResultsThisSeason = [];
      duplaSamplesThisSeason = new Map(historicalDuplas.map((d) => [d.team_key, []]));
    }
  }
  if (perSeason.length < SEASONS && perSeason[perSeason.length - 1]?.year !== currentYear) {
    await finalizeSeasonRecord(currentYear);
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
      note: 'Math.random e o relógio são seedados a partir de --seed só neste processo, ANTES de qualquer criação de entidade. Ids de AthleteProfile/TeamRanking são deixados para o PRÓPRIO fallback makeId() de produção (nunca sobrescritos com bot_id/team_key — isso mudava a forma da string e enviesava a seleção por hash de aiPartnershipLifecycle.js, achado da Fase 0.1) — como Math.random/Date.now já são determinísticos aqui, makeId() produz o MESMO formato de produção de forma reproduzível. bot_id/team_key continuam existindo só como chaves de agrupamento para leitura deste relatório (duplas históricas), nunca como o id real da entidade.',
    },
    seasonsSimulated: SEASONS,
    proceduralAthleteSample: PROCEDURAL_ATHLETE_SAMPLE,
    proceduralTeamSample: PROCEDURAL_TEAM_SAMPLE,
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
