// Playthrough 5.1/5.2 — motor de simulação compartilhado. Extraído para que
// diag-tier-choice-rebalance.mjs, diag-tier-capacity-economy.mjs e os
// testes novos destas duas fases usem a MESMA lógica de avanço de mundo e
// a MESMA coleta de métricas — números "antes" e "depois" só são
// comparáveis se vierem exatamente do mesmo procedimento. Nenhuma lógica
// de jogo vive aqui, só orquestração de simulação headless (o mesmo
// padrão manual já usado em test-tier-strength-distribution.mjs/
// test-ranking-full-season-simulation.mjs, generalizado).
//
// Playthrough 5.2, Parte Y — auditoria de performance (diag-tier-choice-
// rebalance.mjs, ~8min/temporada) encontrou a causa real: NÃO é o
// tamanho do mundo crescendo (tournaments/athletes/partnerships ficam
// CONSTANTES ao longo do ano, medido), é processWorldCircuit
// (circuitLifecycle.js) — sua auto-limitação de "uma vez por semana ISO"
// já evita chamadas redundantes, mas CADA passada semanal fica mais cara
// conforme o histórico de AthleteRankingResult cresce (mais linhas pra
// recomputar a janela rolling por atleta a cada nova passada). Medido:
// ~52 passadas semanais custam ~345s no total; uma ÚNICA passada isolada
// no fim do ano (mesmo estado final acumulado) custa só ~2s — o custo
// está em CHAMAR REPETIDAMENTE, não no tamanho dos dados por si.
// circuitLifecycle.js não foi tocado (Parte Z: não reescrever Circuito) —
// em vez disso, `circuitIntervalDays` espaça as chamadas (o próprio
// auto-gate de processWorldCircuit não se importa com o espaçamento
// exato, só detecta "a semana ISO mudou" a cada chamada), reduzindo o
// número de passadas caras sem tocar a função em si. Validado (Parte Y
// exige) contra a cadência diária original em
// diag-tier-capacity-economy.mjs — mesma ordem de força por tier, dentro
// da variância normal entre seeds.
import { createServer } from 'vite';

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(path) { this.directories.add(path); }
  async exists(path) { return this.files.has(path) || this.directories.has(path); }
  async writeText(path, content) { this.files.set(path, String(content)); }
  async readText(path) { if (!this.files.has(path)) { const error = new Error('missing'); error.code = 'FILE_NOT_FOUND'; throw error; } return this.files.get(path); }
  async remove(path) { this.files.delete(path); }
  async rename(source, destination) { this.files.set(destination, this.files.get(source)); this.files.delete(source); }
  async copy(source, destination) { this.files.set(destination, this.files.get(source)); }
  async list(directory = '.') { const prefix = directory === '.' ? '' : `${directory}/`; return [...this.files.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ name: key.slice(prefix.length), isDirectory: false })); }
  async stat(path) { return { size: this.files.get(path)?.length || 0 }; }
}

let globalShimsInstalled = false;
function installGlobalShims(pathname) {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  globalShimsInstalled = true;
}

// Playthrough 5.4, Parte A/B — achado real: `draw_pair_ids` pode conter
// DOIS formatos de ID (WorldTourLifecycle.js:buildCanonicalPairs) — (1)
// o `id` de uma linha real da entidade Partnership (duplas com parceria
// formada pelo mercado de IA), e (2) um ID SINTÉTICO
// `profile-pair:{idA}:{idB}` (ids ordenados) pra atletas com
// `ai_partner_id` já setado no seed mas SEM uma linha Partnership
// formal ainda materializada — o caso exato dos atletas reais
// (Coello/Tapia etc., real_arturo_coello.ai_partner_id=
// real_agustin_tapia, confirmado por auditoria direta, NUNCA ganham uma
// linha Partnership). Toda métrica desta e das fases anteriores (5.1-
// 5.3) que resolvia membros de um par só via `partnershipById.get(pairId)`
// retornava vazio pra esse segundo formato — SEMPRE contava as duplas
// reais como "0 participações", mesmo quando elas realmente jogavam (a
// causa raiz exata do achado "0 participações" da Playthrough 5.3 —
// bug de MEDIÇÃO, não do motor do jogo, confirmado por auditoria direta:
// Coello/Tapia jogaram 4 torneios reais nos primeiros 90 dias de uma
// simulação de teste). Resolve os dois formatos — nenhuma métrica desta
// fase repete o bug.
export function resolvePairMemberIds(pairId) {
  if (typeof pairId !== 'string') return null;
  if (pairId.startsWith('profile-pair:')) {
    const ids = pairId.slice('profile-pair:'.length).split(':').filter(Boolean);
    return ids.length === 2 ? ids : null;
  }
  return null; // não é um ID sintético — resolver via Partnership normalmente.
}

export function membersOfCanonicalPair(pairId, partnershipById, athleteById) {
  const syntheticIds = resolvePairMemberIds(pairId);
  if (syntheticIds) return syntheticIds.map((id) => athleteById.get(id)).filter(Boolean);
  const partnership = partnershipById.get(pairId);
  if (!partnership) return [];
  return [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean).map((id) => athleteById.get(id)).filter(Boolean);
}

export function canonicalPairAthleteIds(pairId, partnershipById) {
  const syntheticIds = resolvePairMemberIds(pairId);
  if (syntheticIds) return syntheticIds;
  const partnership = partnershipById.get(pairId);
  if (!partnership) return [];
  return [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean);
}

export const TIER_ORDER = Object.freeze(['Bronze', 'Silver', 'Gold', 'Platinum', 'Masters', 'Elite', 'Crown']);
const TIER_STRENGTH_RANK = Object.fromEntries(TIER_ORDER.map((tier, index) => [tier, index]));
export function tierStrengthDelta(fromTier, toTier) {
  const a = TIER_STRENGTH_RANK[fromTier]; const b = TIER_STRENGTH_RANK[toTier];
  if (a == null || b == null) return 0;
  return b - a; // positivo = subiu de tier, negativo = desceu.
}

function addDays(dateStr, days) {
  const next = new Date(`${dateStr}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * Roda uma simulação headless completa (mundo real, sem UI, sem jogador
 * disputando nada — o mesmo caminho AI-only que os pares canônicos usam de
 * verdade em produção) por `years` anos a partir de 2026-01-01, avançando
 * ensureWorldTourDraws + resolveCompletedWorldTourEvents todo dia (esses
 * dois NUNCA são espaçados — são o sistema sob teste, precisam do
 * relógio real dia a dia) e processWorldCircuit a cada
 * `circuitIntervalDays` dias (default 14 — Parte Y, ver comentário do
 * arquivo; passe 1 pra cadência diária/semanal original, usada só pra
 * validação de que o espaçamento não muda os números).
 *
 * Cada execução deste processo Node é uma "seed" na prática: não existe
 * parâmetro de RNG seedável neste pipeline (a escolha de torneio é
 * determinística por hash de id, mas o resultado das PARTIDAS usa
 * Math.random() de verdade, então cada rodada produz um mundo diferente;
 * documentado explicitamente, Parte P/X).
 *
 * Devolve os dados brutos (tournaments/athletes/partnerships) — quem
 * chama decide que métrica extrair (computeTierFieldMetrics abaixo, ou
 * algo mais específico).
 */
/**
 * Playthrough 5.18-B — PARIDADE COM PRODUÇÃO.
 *
 * Falha metodológica descoberta na 5.18: este harness rodava apenas
 * ensureWorldTourDraws + resolveCompletedWorldTourEvents + processWorldCircuit.
 * A produção (gameStateLifecycle.js) roda, por dia, também:
 *   - simulateWorldDay        -> evolução/lesões/ganhos da população, e no
 *                                virar do mês gera prospects e poda aposentados;
 *   - processAiPartnershipMarket -> o mercado MENSAL de duplas de IA.
 *
 * Sem essas duas, o mundo headless ficava congelado no estado de seed:
 * 994/1000 atletas pareados e ~6 agentes livres para sempre. Medido: com o
 * mercado ligado a mesma temporada termina com ~270 livres. Toda conclusão de
 * ecologia tirada do harness antigo media um universo que o jogador nunca vê.
 *
 * `worldLifecycles` liga essa paridade e é o DEFAULT, porque representar o
 * mundo real é a razão de existir do harness. Um teste que precise
 * deliberadamente de um mundo congelado (por exemplo, para isolar o efeito de
 * uma única autoridade) passa `worldLifecycles: false` e assume esse viés
 * explicitamente.
 */
export async function runHeadlessWorldSimulation({ years = 1, label = 'seed', trackWeeklyDraws = true, circuitIntervalDays = 14, includeRankingResults = false, onBeforeClose = null, worldLifecycles = true } = {}) {
  if (!globalShimsInstalled) installGlobalShims(`/tier-rebalance-${label}`);
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { GameStorage } = await vite.ssrLoadModule('/src/storage/GameStorage.js');
    const { CareerRepository } = await vite.ssrLoadModule('/src/careers/CareerRepository.js');
    const { CareerManager } = await vite.ssrLoadModule('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await vite.ssrLoadModule('/src/gameplay/services/runtime.js');
    const { localGame } = await vite.ssrLoadModule('/src/api/localGameClient.js');
    const { ensureWorldSeed2025 } = await vite.ssrLoadModule('/src/lib/saveFoundation.js');
    const { ensureFutureTournaments } = await vite.ssrLoadModule('/src/lib/career.js');
    const { resolveCompletedWorldTourEvents, ensureWorldTourDraws } = await vite.ssrLoadModule('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const { processWorldCircuit } = await vite.ssrLoadModule('/src/game-core/circuitLifecycle.js');
    // Paridade com produção (5.18-B): as duas autoridades de POPULAÇÃO que
    // faltavam. Carregadas sempre; executadas só quando `worldLifecycles`.
    const { processAiPartnershipMarket } = await vite.ssrLoadModule('/src/game-core/aiPartnershipLifecycle.js');
    const { simulateWorldDay } = await vite.ssrLoadModule('/src/game-core/worldSimulationLifecycle.js');

    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: `Tier Rebalance ${label}`, playerName: `TierRebalance${label}` });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `tier-rebalance-player-${label}`, sport_name: `TierRebalance${label}`, career_date: '2026-01-01',
      birth_date: '2001-01-01', level: 'Amador', coins: 1000, xp: 0,
    });

    await ensureWorldSeed2025();
    await ensureFutureTournaments('2026-01-01');

    let circuitAnchorDate = '2026-01-01';
    let date = '2026-01-01';
    const end = addDays('2026-01-01', years * 365);
    let dayIndex = 0;
    const lifecycleStats = { marketMonths: 0, formed: 0, dissolved: 0, worldDays: 0 };
    while (date < end) {
      const previousDate = date;
      date = addDays(date, 1);
      dayIndex += 1;
      if (process.env.PADEL_SIM_PROGRESS === '1' && dayIndex % 30 === 0) {
        console.log(`[tier-harness:${label}] dia ${dayIndex}/${years * 365} (${date})`);
      }
      await ensureWorldTourDraws(date).catch(() => null);
      await resolveCompletedWorldTourEvents(date).catch(() => null);
      if (worldLifecycles) {
        // MESMA ORDEM da produção (gameStateLifecycle): mundo antes do
        // mercado de duplas, porque o mercado lê forma/química que o dia do
        // mundo acabou de atualizar.
        const worldResult = await simulateWorldDay(profile, previousDate, date).catch(() => null);
        if (worldResult?.profile) profile = worldResult.profile;
        if (worldResult && !worldResult.skipped) lifecycleStats.worldDays += 1;
        const marketResult = await processAiPartnershipMarket(profile, previousDate, date).catch(() => null);
        if (marketResult?.profile) profile = marketResult.profile;
        if (marketResult && !marketResult.skipped) {
          lifecycleStats.marketMonths += 1;
          lifecycleStats.formed += Number(marketResult.formed) || 0;
          lifecycleStats.dissolved += Number(marketResult.dissolved) || 0;
        }
      }
      if (circuitIntervalDays <= 1 || dayIndex % circuitIntervalDays === 0) {
        const circuitResult = await processWorldCircuit(profile, circuitAnchorDate, date).catch(() => null);
        if (circuitResult?.profile) profile = circuitResult.profile;
        circuitAnchorDate = date;
      }
    }
    // Passada final garantida — mesmo se `years*365` não cair num múltiplo
    // exato de `circuitIntervalDays`, o snapshot final de ranking_position
    // precisa refletir os últimos resultados antes de qualquer medição.
    if (circuitAnchorDate !== date) {
      const circuitResult = await processWorldCircuit(profile, circuitAnchorDate, date).catch(() => null);
      if (circuitResult?.profile) profile = circuitResult.profile;
    }

    // Playthrough 5.4, Parte X — hook opcional pra testes de idempotência/
    // recarregamento que precisam chamar processWorldCircuit (ou reler
    // localGame.entities) MAIS UMA VEZ dentro da MESMA sessão vite/estado em
    // memória, antes de tudo fechar — sem duplicar aqui o setup inteiro de
    // CareerManager/GameStorage/localGame usado só por este harness.
    if (typeof onBeforeClose === 'function') {
      // `vite` vai junto para que o hook possa carregar OUTROS módulos de
      // produção (ssrLoadModule) dentro desta MESMA sessão/estado em memória.
      await onBeforeClose({ localGame, profile, processWorldCircuit, date, vite, activeCareerAdapter });
    }

    const [tournaments, athletes, partnerships, rankingResultRows, teamRankings] = await Promise.all([
      localGame.entities.Tournament.list('start_date', 5000),
      localGame.entities.AthleteProfile.list(null, 5000),
      localGame.entities.Partnership.list(null, 5000).catch(() => []),
      includeRankingResults ? localGame.entities.AthleteRankingResult.list(null, 60000).catch(() => []) : Promise.resolve([]),
      includeRankingResults ? localGame.entities.TeamRanking.list(null, 5000).catch(() => []) : Promise.resolve([]),
    ]);
    // Reconstrói a "linha do tempo de sorteios" (Parte A — promoção/
    // rebaixamento entre aparições consecutivas de cada dupla) a partir do
    // `draw_date` já persistido em cada Tournament, em vez de consultar o
    // banco todo dia durante o laço acima (mais rápido — zero queries
    // extras — e mais correto: `draw_date` é a data real gravada por
    // ensureWorldTourDraws, nunca perdida por causa de uma amostragem
    // periódica desalinhada).
    const byDrawDate = new Map();
    for (const t of tournaments) {
      if (!t.draw_date || !Array.isArray(t.draw_pair_ids) || !t.draw_pair_ids.length) continue;
      if (!byDrawDate.has(t.draw_date)) byDrawDate.set(t.draw_date, []);
      byDrawDate.get(t.draw_date).push({ id: t.id, tier: t.tier, draw_pair_ids: t.draw_pair_ids });
    }
    const weeklyDrawSnapshots = trackWeeklyDraws
      ? [...byDrawDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([drawDate, list]) => ({ date: drawDate, tournaments: list }))
      : [];
    return {
      label, years, tournaments, athletes, partnerships, weeklyDrawSnapshots,
      finalDate: date, rankingResultRows, teamRankings,
      // 5.18-B: prova auditável de que os lifecycles de população rodaram.
      lifecycleStats: { ...lifecycleStats, worldLifecycles },
    };
  } finally {
    await vite.close();
  }
}

/**
 * A partir do resultado bruto de runHeadlessWorldSimulation, calcula as
 * métricas por tier pedidas na Parte A — mesma fonte (draw_pair_ids
 * resolvido via Partnership -> AthleteProfile, nunca por nome) que o
 * diagnóstico original da Playthrough 5.0 usava, estendida com
 * percentis/seeds/promoção-rebaixamento.
 */
export function computeTierFieldMetrics({ tournaments, athletes, partnerships, weeklyDrawSnapshots = [] }, { tiers = TIER_ORDER } = {}) {
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const partnershipById = new Map(partnerships.map((p) => [p.id, p]));

  const resolvedByTier = {};
  for (const tier of tiers) {
    resolvedByTier[tier] = tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length > 0 && t.champion);
  }

  function membersOfPair(pairId) {
    return membersOfCanonicalPair(pairId, partnershipById, athleteById);
  }

  const tierStats = {};
  for (const tier of tiers) {
    const ranks = []; const ovrs = [];
    const perTournamentEntrantCounts = [];
    for (const tournament of resolvedByTier[tier]) {
      for (const pairId of tournament.draw_pair_ids) {
        for (const athlete of membersOfPair(pairId)) {
          const rank = Number(athlete.ranking_position) || 0;
          const ovr = Number(athlete.overall_rating) || 0;
          if (rank > 0) ranks.push(rank);
          if (ovr > 0) ovrs.push(ovr);
        }
      }
      perTournamentEntrantCounts.push(tournament.draw_pair_ids.length);
    }
    ranks.sort((a, b) => a - b);
    ovrs.sort((a, b) => a - b);
    const avg = (arr) => arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
    const median = (arr) => arr.length ? (arr.length % 2 ? arr[(arr.length - 1) / 2] : (arr[arr.length / 2 - 1] + arr[arr.length / 2]) / 2) : null;
    const percentile = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : null;
    const pctBelow = (arr, threshold) => arr.length ? (arr.filter((v) => v <= threshold).length / arr.length) * 100 : null;
    const pctAbove = (arr, threshold) => arr.length ? (arr.filter((v) => v > threshold).length / arr.length) * 100 : null;
    tierStats[tier] = {
      tournaments: resolvedByTier[tier].length,
      avgEntrants: avg(perTournamentEntrantCounts),
      avgRank: avg(ranks), medianRank: median(ranks), bestRank: ranks[0] ?? null, worstRank: ranks[ranks.length - 1] ?? null,
      p25Rank: percentile(ranks, 0.25), p50Rank: percentile(ranks, 0.5), p75Rank: percentile(ranks, 0.75),
      avgOVR: avg(ovrs), medianOVR: median(ovrs), bestOVR: ovrs[ovrs.length - 1] ?? null, worstOVR: ovrs[0] ?? null,
      p25OVR: percentile(ovrs, 0.25), p50OVR: percentile(ovrs, 0.5), p75OVR: percentile(ovrs, 0.75),
      pctTop10: pctBelow(ranks, 10), pctTop25: pctBelow(ranks, 25), pctTop50: pctBelow(ranks, 50),
      pctTop100: pctBelow(ranks, 100), pctTop250: pctBelow(ranks, 250), pctOutsideTop500: pctAbove(ranks, 500),
      rankedEntrantSampleSize: ranks.length, ovrEntrantSampleSize: ovrs.length,
    };
  }

  // Promoção/rebaixamento entre aparições consecutivas de cada dupla
  // (ordenado por data do snapshot semanal em que apareceu).
  const pairTierTimeline = new Map();
  for (const snapshot of weeklyDrawSnapshots) {
    for (const t of snapshot.tournaments) {
      if (!tiers.includes(t.tier)) continue;
      for (const pairId of t.draw_pair_ids) {
        if (!pairTierTimeline.has(pairId)) pairTierTimeline.set(pairId, []);
        pairTierTimeline.get(pairId).push({ date: snapshot.date, tier: t.tier });
      }
    }
  }
  let repeatedTier = 0; let promoted = 0; let demoted = 0; let transitions = 0;
  for (const timeline of pairTierTimeline.values()) {
    timeline.sort((a, b) => (a.date < b.date ? -1 : 1));
    for (let i = 1; i < timeline.length; i += 1) {
      transitions += 1;
      const delta = tierStrengthDelta(timeline[i - 1].tier, timeline[i].tier);
      if (delta === 0) repeatedTier += 1;
      else if (delta > 0) promoted += 1;
      else demoted += 1;
    }
  }

  return { tierStats, tierMobility: { pairsTracked: pairTierTimeline.size, transitions, repeatedTier, promoted, demoted } };
}

/**
 * Playthrough 5.2 — classificação de origem (ideal/vizinho/fora da
 * faixa) e capacityPressure, reaproveitada por diag-tier-capacity-
 * economy.mjs e pelos testes de capacidade novos (Partes B/C/D/J/W).
 * Abre sua própria instância vite curta (só carrega circuitCatalog.js/
 * EntryManager.js, computação pura sobre dados já coletados — nenhuma
 * chamada de motor de jogo, por isso é rápida, ~1-2s).
 */
export async function computeCapacityMetrics({ tournaments, athletes, partnerships }, { tiers = TIER_ORDER } = {}) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { isRankInTierDiagnosticCore } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');

    const athleteById = new Map(athletes.map((a) => [a.id, a]));
    const partnershipById = new Map(partnerships.map((p) => [p.id, p]));
    const tierIndex = Object.fromEntries(tiers.map((t, i) => [t, i]));

    function canonicalPairRank(pairId) {
      const ranks = canonicalPairAthleteIds(pairId, partnershipById)
        .map((id) => Number(athleteById.get(id)?.ranking_position) || 0).filter((r) => r > 0);
      return ranks.length ? ranks.reduce((s, v) => s + v, 0) / ranks.length : 0;
    }

    const resolvedTournamentsByTier = {};
    for (const tier of tiers) {
      resolvedTournamentsByTier[tier] = tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
    }

    const originBreakdown = {};
    const distinctPairsByTier = {};
    for (const tier of tiers) {
      const breakdown = { ideal: 0, adjacent: 0, farOff: 0, total: 0 };
      const distinctPairIds = new Set();
      for (const tournament of resolvedTournamentsByTier[tier]) {
        for (const pairId of tournament.draw_pair_ids) {
          distinctPairIds.add(pairId);
          const rank = canonicalPairRank(pairId);
          if (rank <= 0) continue;
          breakdown.total += 1;
          const inOwnPlateau = isRankInTierDiagnosticCore(rank, tier);
          const inNeighborPlateau = !inOwnPlateau && tiers.some((other) => Math.abs(tierIndex[other] - tierIndex[tier]) === 1 && isRankInTierDiagnosticCore(rank, other));
          if (inOwnPlateau) breakdown.ideal += 1;
          else if (inNeighborPlateau) breakdown.adjacent += 1;
          else breakdown.farOff += 1;
        }
      }
      originBreakdown[tier] = breakdown;
      distinctPairsByTier[tier] = distinctPairIds.size;
    }

    return { originBreakdown, distinctPairsByTier, resolvedTournamentsByTier };
  } finally {
    await vite.close();
  }
}

/**
 * Playthrough 5.3, Parte E — classificação em camadas CORE/NEAR/STRETCH/
 * EMERGENCY, reaproveitando as MESMAS fontes já canônicas (nunca uma
 * quarta noção de "adequação"): CORE = dentro da faixa factual natural
 * do tier; NEAR = faixa vizinha ou rede normal de qualifying; STRETCH =
 * fora da admissão normal, mas ainda com rankingFit positivo para rescue;
 * EMERGENCY = rescue com fit zero.
 */
export async function classifyFieldLayers({ tournaments, athletes, partnerships }, { tiers = TIER_ORDER } = {}) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  try {
    const { classifyTierEntryLayer } = await vite.ssrLoadModule('/src/gameplay/worldTour/tierEntryDiagnostics.js');

    const athleteById = new Map(athletes.map((a) => [a.id, a]));
    const partnershipById = new Map(partnerships.map((p) => [p.id, p]));

    function canonicalPairRank(pairId) {
      const ranks = canonicalPairAthleteIds(pairId, partnershipById)
        .map((id) => Number(athleteById.get(id)?.ranking_position) || 0).filter((r) => r > 0);
      return ranks.length ? ranks.reduce((s, v) => s + v, 0) / ranks.length : 0;
    }

    const layersByTier = {};
    for (const tier of tiers) {
      const resolved = tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
      const counts = { CORE: 0, NEAR: 0, STRETCH: 0, EMERGENCY: 0, total: 0 };
      for (const tournament of resolved) {
        for (const pairId of tournament.draw_pair_ids) {
          const rank = canonicalPairRank(pairId);
          if (rank <= 0) continue;
          counts[classifyTierEntryLayer(rank, tier, tiers)] += 1;
          counts.total += 1;
        }
      }
      layersByTier[tier] = {
        ...counts,
        pctCORE: counts.total ? (counts.CORE / counts.total) * 100 : null,
        pctNEAR: counts.total ? (counts.NEAR / counts.total) * 100 : null,
        pctSTRETCH: counts.total ? (counts.STRETCH / counts.total) * 100 : null,
        pctEMERGENCY: counts.total ? (counts.EMERGENCY / counts.total) * 100 : null,
      };
    }
    return layersByTier;
  } finally {
    await vite.close();
  }
}

export function formatTierStatsTable(tierStats, tiers = TIER_ORDER) {
  const lines = [];
  for (const tier of tiers) {
    const s = tierStats[tier];
    if (!s || !s.tournaments) { lines.push(`${tier}: sem torneios resolvidos na amostra`); continue; }
    lines.push(
      `${tier}: torneios=${s.tournaments} avgEntrants=${s.avgEntrants?.toFixed(1)} avgRank=${s.avgRank?.toFixed(0)} medianRank=${s.medianRank} bestRank=${s.bestRank} worstRank=${s.worstRank} `
      + `avgOVR=${s.avgOVR?.toFixed(1)} medianOVR=${s.medianOVR} bestOVR=${s.bestOVR} worstOVR=${s.worstOVR} `
      + `top10=${s.pctTop10?.toFixed(1)}% top25=${s.pctTop25?.toFixed(1)}% top50=${s.pctTop50?.toFixed(1)}% top100=${s.pctTop100?.toFixed(1)}% top250=${s.pctTop250?.toFixed(1)}% outTop500=${s.pctOutsideTop500?.toFixed(1)}%`
    );
  }
  return lines.join('\n');
}
