// Playthrough 5.2, Parte A/B/C/D/E — diagnóstico de capacidade/economia
// de vagas por tier. Não instrumenta snapshots semanais adicionais da
// população inteira (custaria caro — Parte Y já mediu que o gargalo real
// é processWorldCircuit, não o volume de queries por si) — em vez disso,
// responde as perguntas de capacidade usando dois dados já coletados
// pela simulação real de produção:
//   (1) config estático (TIER_EVENTS_PER_YEAR × mainDrawSize) — vagas
//       anuais reais, nunca hipotéticas;
//   (2) TODAS as participações REAIS do ano (draw_pair_ids resolvido)
//       classificadas por tierPreferenceFit contra CADA tier (qual tier
//       melhor encaixa o rank de cada participante) — responde
//       diretamente "de onde vêm os participantes de Gold" (Parte B.6)
//       sem precisar reconstruir elegibilidade semana a semana.
// "População natural" (Parte B.3/D) é estimada a partir da posição de
// ranking de TODOS os atletas no estado FINAL da simulação (um corte —
// documentado como tal, não uma média ao longo do ano) cruzada com
// Partnership pra contar DUPLAS, não atletas soltos.
import { createServer } from 'vite';
import { runHeadlessWorldSimulation, TIER_ORDER } from './lib/tierRebalanceHarness.mjs';

const years = Number(process.env.PADEL_DIAG_YEARS || 1);
const label = process.env.PADEL_DIAG_LABEL || 'capacity-diag';
const circuitIntervalDays = Number(process.env.PADEL_CIRCUIT_INTERVAL || 14);

console.log(`\n=== diag-tier-capacity-economy — ${years} temporada(s), label=${label}, circuitIntervalDays=${circuitIntervalDays} ===\n`);
const sim = await runHeadlessWorldSimulation({ years, label, trackWeeklyDraws: true, circuitIntervalDays });

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { TOURNAMENT_TIER_CONFIG, isRankInTierDiagnosticCore, TIER_EVENTS_PER_YEAR } = await vite.ssrLoadModule('/src/lib/circuitCatalog.js');
  const { eligibleForTier } = await vite.ssrLoadModule('/src/gameplay/worldTour/EntryManager.js');

  // Vagas anuais usam a config AUTORITATIVA (TIER_EVENTS_PER_YEAR,
  // exportada nesta fase só pra leitura — igual getWeekProgram na 5.1),
  // não uma recontagem da simulação: `sim.tournaments` inclui todo
  // torneio já GERADO pro horizonte de agendamento (que passa de um ano
  // pra frente, Fase 4.4), não só os que caem dentro da janela de 1 ano
  // medida — recontar de lá infla o número real. `resolvedCount` abaixo é
  // só informativo (quantos REALMENTE foram sorteados/resolvidos dentro
  // da janela simulada, útil pra Parte U/ocupação).
  const TIER_EVENTS_PER_YEAR_READ = { ...TIER_EVENTS_PER_YEAR };
  const resolvedCountByTier = {};
  for (const tier of TIER_ORDER) {
    resolvedCountByTier[tier] = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion).length;
  }

  const athleteById = new Map(sim.athletes.map((a) => [a.id, a]));
  const partnershipById = new Map(sim.partnerships.map((p) => [p.id, p]));

  function canonicalPairRank(partnership) {
    const ranks = [partnership.athlete_a_id, partnership.athlete_b_id].filter(Boolean)
      .map((id) => Number(athleteById.get(id)?.ranking_position) || 0).filter((r) => r > 0);
    return ranks.length ? ranks.reduce((s, v) => s + v, 0) / ranks.length : 0;
  }

  // Parte B.3/D — população natural: duplas canônicas ATIVAS no corte
  // final cujo rank cai DENTRO da faixa factual natural do tier
  // (nunca uma comparação "qual tier vence" entre todos — essa
  // abordagem foi tentada e DESCARTADA na Playthrough 5.1
  // (test-tier-field-quality.mjs, primeira versão): o platô sem teto de
  // Bronze/Silver empata com o platô estreito de Gold/Platinum em
  // fronteiras sobrepostas, e o desempate por ordem favorece quem é
  // checado primeiro (Bronze/Silver) — "população natural de Gold"
  // saía sempre zero, um bug de medição, não um achado real. Medir
  // pertencimento à PRÓPRIA faixa factual do tier é
  // inequívoco e não sofre desse problema.
  const activePairs = sim.partnerships.filter((p) => p.status === 'ativa' || !p.status);
  function tierOfRank(rank) {
    // Tier cuja faixa factual contém este rank. Faixas só se tocam em
    // pontos de fronteira isolados (ex.: Gold [320,450] e Platinum
    // [230,320] compartilham só o rank 320) — na rara colisão exata,
    // prioriza o tier de corte mais ESTREITO/específico (menor
    // minRanking>0; tiers abertos, minRanking=0, ficam por último).
    const matches = TIER_ORDER.filter((tier) => isRankInTierDiagnosticCore(rank, tier));
    if (!matches.length) return null;
    return matches.sort((a, b) => {
      const ma = TOURNAMENT_TIER_CONFIG[a].minRanking; const mb = TOURNAMENT_TIER_CONFIG[b].minRanking;
      if (ma === 0 && mb === 0) return 0;
      if (ma === 0) return 1;
      if (mb === 0) return -1;
      return ma - mb;
    })[0];
  }
  const naturalPopulationByTier = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  for (const partnership of activePairs) {
    const rank = canonicalPairRank(partnership);
    if (rank <= 0) continue;
    const tier = tierOfRank(rank);
    if (tier) naturalPopulationByTier[tier] += 1;
  }

  // Parte B.6/C — de onde vêm as participações REAIS de cada tier (todo o
  // ano, não um corte): "ideal" = rank do entrante dentro do PRÓPRIO
  // platô do torneio; "vizinho" = dentro do platô de um tier adjacente na
  // escada; "fora da faixa" = nem um nem outro (mesma lógica não-
  // comparativa acima, sem o bug de desempate).
  const resolvedTournamentsByTier = {};
  for (const tier of TIER_ORDER) {
    resolvedTournamentsByTier[tier] = sim.tournaments.filter((t) => t.tier === tier && Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length && t.champion);
  }
  const tierIndex = Object.fromEntries(TIER_ORDER.map((t, i) => [t, i]));
  const originBreakdown = {};
  const distinctPairsByTier = {};
  const eligibleButNotIdealCount = {};
  for (const tier of TIER_ORDER) {
    const breakdown = { ideal: 0, adjacent: 0, farOff: 0, total: 0 };
    const distinctPairIds = new Set();
    let eligibleNotIdeal = 0;
    for (const tournament of resolvedTournamentsByTier[tier]) {
      for (const pairId of tournament.draw_pair_ids) {
        distinctPairIds.add(pairId);
        const partnership = partnershipById.get(pairId);
        if (!partnership) continue;
        const rank = canonicalPairRank(partnership);
        if (rank <= 0) continue;
        breakdown.total += 1;
        const inOwnPlateau = isRankInTierDiagnosticCore(rank, tier);
        const inNeighborPlateau = !inOwnPlateau && TIER_ORDER.some((other) => Math.abs(tierIndex[other] - tierIndex[tier]) === 1 && isRankInTierDiagnosticCore(rank, other));
        if (inOwnPlateau) breakdown.ideal += 1;
        else if (inNeighborPlateau) breakdown.adjacent += 1;
        else breakdown.farOff += 1;
        const eligible = eligibleForTier(rank, tier);
        if (eligible && !inOwnPlateau) eligibleNotIdeal += 1;
      }
    }
    originBreakdown[tier] = breakdown;
    distinctPairsByTier[tier] = distinctPairIds.size;
    eligibleButNotIdealCount[tier] = eligibleNotIdeal;
  }

  // Parte B.3/D, versão robusta — "população natural" a partir de UM
  // corte final é frágil pra bandas de trânsito rápido (Silver/Crown
  // saíam 0 mesmo tendo participação real o ano inteiro — rank é móvel,
  // um corte pontual facilmente erra o momento). Substitui/complementa
  // pelo censo de TODAS as duplas distintas que jogaram QUALQUER torneio
  // real no ano (não só do próprio tier) e cujo rank NAQUELE momento
  // caiu dentro da faixa factual de cada tier — um "quantas duplas
  // diferentes já passaram por esta faixa em algum momento do ano" bem
  // mais robusto que o corte único.
  const allEntrantSightings = new Map(); // pairId -> Set(tiers onde teve rank dentro do platô)
  for (const tier of TIER_ORDER) {
    for (const tournament of resolvedTournamentsByTier[tier]) {
      for (const pairId of tournament.draw_pair_ids) {
        const partnership = partnershipById.get(pairId);
        if (!partnership) continue;
        const rank = canonicalPairRank(partnership);
        if (rank <= 0) continue;
        if (!allEntrantSightings.has(pairId)) allEntrantSightings.set(pairId, new Set());
        for (const t of TIER_ORDER) {
          if (isRankInTierDiagnosticCore(rank, t)) allEntrantSightings.get(pairId).add(t);
        }
      }
    }
  }
  const naturalPopulationRealized = Object.fromEntries(TIER_ORDER.map((t) => [t, 0]));
  for (const tiersSeen of allEntrantSightings.values()) {
    for (const t of tiersSeen) naturalPopulationRealized[t] += 1;
  }

  console.log('=== capacidade estática (config real: TIER_EVENTS_PER_YEAR × mainDrawSize) ===');
  const capacityRows = {};
  for (const tier of TIER_ORDER) {
    const config = TOURNAMENT_TIER_CONFIG[tier];
    const events = TIER_EVENTS_PER_YEAR_READ[tier];
    const slotsPerEvent = config.mainDrawSize;
    const annualSlots = events * slotsPerEvent;
    const naturalPopSnapshot = naturalPopulationByTier[tier];
    const naturalPop = naturalPopulationRealized[tier];
    const distinctPairs = distinctPairsByTier[tier];
    const repetition = distinctPairs > 0 ? annualSlots / distinctPairs : null;
    capacityRows[tier] = { events, slotsPerEvent, annualSlots, naturalPop, naturalPopSnapshot, distinctPairs, repetition };
    console.log(`${tier}: eventos/ano(config)=${events} eventos_resolvidos_na_janela=${resolvedCountByTier[tier]} vagas/evento=${slotsPerEvent} vagas/ano=${annualSlots} duplas_naturais(censo do ano)=${naturalPop} duplas_naturais(corte final)=${naturalPopSnapshot} duplas_distintas_que_jogaram=${distinctPairs} repeticao_media=${repetition?.toFixed(2)}`);
  }

  console.log('\n=== origem real das participações (Parte B.6/C) — % ideal / vizinho / fora da faixa ===');
  for (const tier of TIER_ORDER) {
    const b = originBreakdown[tier];
    if (!b.total) { console.log(`${tier}: sem amostra`); continue; }
    console.log(`${tier}: total=${b.total} ideal=${b.ideal}(${(b.ideal / b.total * 100).toFixed(1)}%) vizinho=${b.adjacent}(${(b.adjacent / b.total * 100).toFixed(1)}%) fora_da_faixa=${b.farOff}(${(b.farOff / b.total * 100).toFixed(1)}%) — elegível-mas-não-ideal=${eligibleButNotIdealCount[tier]}`);
  }

  // Parte D — capacityPressure canônica: vagas anuais / (população
  // natural × repetição de referência). Referência derivada dos PRÓPRIOS
  // dados: a repetição média real observada em Elite+Crown (tiers cuja
  // população naturalmente pequena já reflete o teto realista de
  // "quantos torneios do PRÓPRIO tier uma dupla aceita jogar por ano" —
  // Parte E, nunca um número inventado).
  const referenceRepetition = (() => {
    const samples = ['Elite', 'Crown'].map((t) => capacityRows[t].repetition).filter((v) => Number.isFinite(v));
    return samples.length ? samples.reduce((s, v) => s + v, 0) / samples.length : 4;
  })();
  console.log(`\n=== capacityPressure (Parte D) — referência de repetição/ano derivada de Elite+Crown: ${referenceRepetition.toFixed(2)} ===`);
  for (const tier of TIER_ORDER) {
    const row = capacityRows[tier];
    const sustainableAnnualSlots = row.naturalPop * referenceRepetition;
    const pressure = sustainableAnnualSlots > 0 ? row.annualSlots / sustainableAnnualSlots : null;
    console.log(`${tier}: vagas_anuais=${row.annualSlots} pop_natural×repeticao_ref=${sustainableAnnualSlots.toFixed(0)} capacityPressure=${pressure?.toFixed(2)} ${pressure > 1.3 ? '← SOBRECARREGADO' : pressure < 0.7 ? '← SUBUTILIZADO' : '(equilibrado)'}`);
  }

  console.log(`\n=== mobilidade entre tiers (informativo) ===`);
  console.log(`pares_rastreados=${sim.weeklyDrawSnapshots.length} snapshots de sorteio`);

  console.log('\n=== fim do diagnóstico ===\n');
} finally {
  await vite.close();
}
