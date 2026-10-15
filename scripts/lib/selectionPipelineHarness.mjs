// Playthrough 5.18-F, Partes J/K/L/N — INSTRUMENTAÇÃO DO PIPELINE DE SELEÇÃO.
//
// A 5.18-E fechou a causa do Problema A (mercado inerte) e reduziu o Problema
// B a "6 lacunas de abertura de mundo", mas parou antes de atribuir cada
// semana ociosa a uma ETAPA do pipeline competitivo. A pergunta que ficou em
// aberto era: uma dupla Top10, ativa, saudável e com evento na semana — ela
// não entra no pool? é inelegível? escolhe descansar? ou é cortada?
//
// Este harness responde isso chamando as MESMAS funções exportadas de
// produção sobre o MESMO estado, semana a semana:
//   buildCanonicalPairs   -> o pool de candidatos
//   evaluateTournamentEntry -> elegibilidade por torneio
//   chooseTournament      -> a decisão da dupla
//   assignPairsForWeek    -> a atribuição (inclui fallback de tier)
//
// Nada aqui reimplementa regra de negócio, com DUAS exceções necessárias e
// documentadas, porque as funções correspondentes não são exportadas por
// WorldTourLifecycle.js:
//   - `pairEntryRank`  (espelha WorldTourLifecycle.js:85-89)
//   - o `representative` de assignPairsForWeek (espelha :813-818)
// Se qualquer uma das duas divergir da produção, a Parte N do teste falha,
// porque a etapa observada não bateria com a atribuição real.
//
// Vive só em scripts/ — nada é persistido em produção.
import { createServer } from 'vite';

/** Parte K — estágios do pipeline. Toda semana ociosa recebe exatamente um. */
export const PIPELINE_STAGES = Object.freeze({
  NOT_IN_CANDIDATE_POOL: 'NOT_IN_CANDIDATE_POOL',
  INELIGIBLE: 'INELIGIBLE',
  NO_EVENT: 'NO_EVENT',
  CHOOSE_NONE: 'CHOOSE_NONE',
  SELECTED_EVENT: 'SELECTED_EVENT',
  CUT_BY_CAPACITY: 'CUT_BY_CAPACITY',
  RESCUED: 'RESCUED',
  PLAYED: 'PLAYED',
  CONFLICT: 'CONFLICT',
});

class MemoryStorage {
  constructor() { this.files = new Map(); this.directories = new Set(); }
  isSupported() { return true; }
  async initialize() {}
  getDataDirectoryDescription() { return 'headless-memory'; }
  async ensureDirectory(p) { this.directories.add(p); }
  async exists(p) { return this.files.has(p) || this.directories.has(p); }
  async writeText(p, c) { this.files.set(p, String(c)); }
  async readText(p) { if (!this.files.has(p)) { const e = new Error('missing'); e.code = 'FILE_NOT_FOUND'; throw e; } return this.files.get(p); }
  async remove(p) { this.files.delete(p); }
  async rename(s, d) { this.files.set(d, this.files.get(s)); this.files.delete(s); }
  async copy(s, d) { this.files.set(d, this.files.get(s)); }
  async list(dir = '.') { const p = dir === '.' ? '' : `${dir}/`; return [...this.files.keys()].filter((k) => k.startsWith(p)).map((k) => ({ name: k.slice(p.length), isDirectory: false })); }
  async stat() { return { size: 0 }; }
}

export function installGlobalShims(pathname = '/selection-pipeline') {
  globalThis.location = { hostname: '127.0.0.1', pathname, search: '' };
  globalThis.window = { location: globalThis.location, dispatchEvent() {} };
  globalThis.CustomEvent = class CustomEvent { constructor(t, i = {}) { this.type = t; this.detail = i.detail; } };
}

export const addDays = (date, days) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const weekOf = (date) => Math.floor(new Date(`${String(date).slice(0, 10)}T00:00:00Z`).getTime() / 604800000);
export const pairKey = (a, b) => [a, b].sort().join('_');

/**
 * Espelha WorldTourLifecycle.js:85-89 (`pairEntryRank`, não exportada).
 * ATENÇÃO: é a média dos ranks INDIVIDUAIS dos dois atletas — nunca o
 * TeamRanking da dupla. Essa distinção é o objeto da Parte N.
 */
export function mirrorPairEntryRank(pair, resolveEntryRank) {
  const ranks = pair.athletes.map((a) => resolveEntryRank(a)).filter((v) => v > 0);
  if (!ranks.length) return 0;
  return Math.round(ranks.reduce((s, v) => s + v, 0) / ranks.length);
}

/** Espelha o `representative` de WorldTourLifecycle.js:813-818. */
export function mirrorRepresentative(pair, resolveEntryRank) {
  const pairRank = mirrorPairEntryRank(pair, resolveEntryRank);
  return {
    ...pair.athletes[0],
    overall_rating: pair.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / 2,
    ...(pairRank > 0 ? { rank: pairRank, ranking_position: pairRank } : {}),
  };
}

function tournamentsOfWeek(tournaments, date) {
  const w = weekOf(date);
  return tournaments.filter((t) => t.start_date && weekOf(t.start_date) === w);
}

/**
 * Roda `years` temporadas com paridade de produção e, a cada semana, registra
 * para cada dupla observada a etapa do pipeline em que ela parou.
 *
 * `watch` é uma função (pairs, ctx) => chaves a observar; por padrão observa o
 * Top `cohortSize` do TeamRanking no início.
 */
export async function runPipelineInstrumentedRun({
  label = 'pipeline', years = 1, cohortSize = 20, extraWatchKeys = [], onWeek = null, census = false,
} = {}) {
  installGlobalShims(`/selection-pipeline-${label}`);
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
  const mod = (p) => vite.ssrLoadModule(p);
  try {
    const { GameStorage } = await mod('/src/storage/GameStorage.js');
    const { CareerRepository } = await mod('/src/careers/CareerRepository.js');
    const { CareerManager } = await mod('/src/careers/CareerManager.js');
    const { activeCareerAdapter } = await mod('/src/gameplay/services/runtime.js');
    const { localGame } = await mod('/src/api/localGameClient.js');
    const { ensureWorldSeed2025 } = await mod('/src/lib/saveFoundation.js');
    const { ensureFutureTournaments } = await mod('/src/lib/career.js');
    const wt = await mod('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const { ensureWorldTourDraws, resolveCompletedWorldTourEvents, buildCanonicalPairs, assignPairsForWeek } = wt;
    const { evaluateTournamentEntry, resolveEntryRank } = await mod('/src/gameplay/worldTour/EntryManager.js');
    const { chooseTournament } = await mod('/src/gameplay/worldTour/TournamentSelectionAI.js');
    const { getTournamentTierConfig } = await mod('/src/lib/circuitCatalog.js');
    const { processWorldCircuit } = await mod('/src/game-core/circuitLifecycle.js');
    const { processAiPartnershipMarket } = await mod('/src/game-core/aiPartnershipLifecycle.js');
    const { simulateWorldDay } = await mod('/src/game-core/worldSimulationLifecycle.js');

    const START = '2026-01-01';
    const manager = new CareerManager(new CareerRepository(new GameStorage(new MemoryStorage())));
    activeCareerAdapter.careerManager = manager;
    activeCareerAdapter.clearActiveCareer();
    const { career } = await manager.createCareer({ saveName: label, playerName: label });
    activeCareerAdapter.setActiveCareer(career);
    let profile = await activeCareerAdapter.createPlayerProfile({
      id: `pipe-${label}`, sport_name: label, career_date: START, birth_date: '2001-01-01',
      level: 'Amador', coins: 1000, xp: 0,
    });
    await ensureWorldSeed2025();
    await ensureFutureTournaments(START);

    const initialTeams = await localGame.entities.TeamRanking.list('-ranking_points', 5000);
    const cohort = initialTeams.slice(0, cohortSize).map((t, i) => ({
      key: pairKey(t.player1_id, t.player2_id), a: t.player1_id, b: t.player2_id,
      name: `${t.player1_name}/${t.player2_name}`, initialRank: i + 1,
    }));
    // ATENÇÃO: IDs de atleta CONTÊM underscore (`real_arturo_coello`), então
    // a chave composta NUNCA pode ser desmontada por split('_') — os dois
    // ids andam junto com ela. (Medido: split('_') devolvia 6 pedaços para
    // uma chave de 2 atletas, e toda leitura por id falhava em silêncio,
    // zerando `mutual` e os ranks individuais de todas as linhas.)
    const watched = new Map(cohort.map((c) => [c.key, { a: c.a, b: c.b }]));
    for (const entry of extraWatchKeys) {
      if (typeof entry === 'string') continue; // sem os ids não há o que observar
      if (entry?.key && entry.a && entry.b) watched.set(entry.key, { a: entry.a, b: entry.b });
    }

    const weekly = [];
    const drawSizeOf = (t) => {
      const cfg = getTournamentTierConfig(t?.tier);
      return Math.max(2, Number(t.main_draw_size) || cfg.mainDrawSize || 16);
    };

    let circuitAnchor = START;
    let date = START;
    const totalDays = years * 365;

    for (let i = 0; i < totalDays; i += 1) {
      const previous = date;
      date = addDays(date, 1);
      await ensureWorldTourDraws(date).catch(() => null);
      await resolveCompletedWorldTourEvents(date).catch(() => null);
      const world = await simulateWorldDay(profile, previous, date).catch(() => null);
      if (world?.profile) profile = world.profile;
      const market = await processAiPartnershipMarket(profile, previous, date).catch(() => null);
      if (market?.profile) profile = market.profile;
      if ((i + 1) % 14 === 0) {
        const c = await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
        if (c?.profile) profile = c.profile;
        circuitAnchor = date;
      }
      if ((i + 1) % 60 === 0) await ensureFutureTournaments(date).catch(() => null);

      if ((i + 1) % 7 !== 0) continue;

      // --- SNAPSHOT SEMANAL COM ETAPA DE PIPELINE ---
      const [athletes, partnerships, tournaments, teams] = await Promise.all([
        localGame.entities.AthleteProfile.list(null, 5000),
        localGame.entities.Partnership.list(null, 5000).catch(() => []),
        localGame.entities.Tournament.list('start_date', 5000),
        localGame.entities.TeamRanking.list('-ranking_points', 5000),
      ]);
      const byId = new Map(athletes.map((a) => [a.id, a]));
      const teamRankByKey = new Map();
      const teamPointsByKey = new Map();
      const teamRowByKey = new Map();
      teams.forEach((t, idx) => {
        const k = pairKey(t.player1_id, t.player2_id);
        teamRankByKey.set(k, idx + 1);
        teamPointsByKey.set(k, Number(t.ranking_points) || 0);
        teamRowByKey.set(k, t);
      });

      const pairs = buildCanonicalPairs(partnerships, athletes);
      const pairByKey = new Map();
      for (const p of pairs) pairByKey.set(pairKey(p.athletes[0].id, p.athletes[1].id), p);

      const weekTournaments = tournamentsOfWeek(tournaments, date);
      const assignments = weekTournaments.length
        ? assignPairsForWeek(weekTournaments, pairs)
        : new Map();

      // Quem realmente foi sorteado nesta semana (fonte: draw_pair_ids).
      const drawnPairIds = new Set();
      for (const t of weekTournaments) {
        for (const id of (Array.isArray(t.draw_pair_ids) ? t.draw_pair_ids : [])) drawnPairIds.add(id);
      }
      // Parte M — indisponibilidade por COMPROMISSO. Uma dupla sorteada num
      // torneio cuja janela [start,end] cruza esta semana não está livre para
      // ser sorteada de novo (mesma regra de `committedPairIdsForWindow`).
      // Sem isto, ela apareceria como "preterida" numa semana em que já
      // estava jogando outro evento — e uma dupla de elite em campanha longa
      // vira falsa inversão toda semana.
      const weekStart = date;
      const weekEnd = addDays(date, 6);
      const committedPairIds = new Set();
      for (const t of tournaments) {
        const s = t.start_date;
        const e = t.end_date || t.start_date;
        if (!s || !(s <= weekEnd && weekStart <= e)) continue;
        for (const id of (Array.isArray(t.draw_pair_ids) ? t.draw_pair_ids : [])) committedPairIds.add(id);
      }
      // Só é possível afirmar "não foi sorteada em lugar nenhum" numa semana
      // em que TODOS os torneios já têm chave. Os sorteios saem em D-3: num
      // snapshot anterior a isso, um torneio ainda sem chave faz toda dupla
      // alocada a ele parecer preterida nos outros.
      const allDrawn = weekTournaments.length > 0
        && weekTournaments.every((t) => Array.isArray(t.draw_pair_ids) && t.draw_pair_ids.length > 0);

      const rows = [];
      for (const [key, { a: ida, b: idb }] of watched) {
        const A = byId.get(ida);
        const B = byId.get(idb);
        const pair = pairByKey.get(key);
        const mutual = Boolean(A && B && A.ai_partner_id === idb && B.ai_partner_id === ida);
        const injured = Boolean((A?.injured_until && A.injured_until >= date) || (B?.injured_until && B.injured_until >= date));

        const base = {
          key,
          date,
          week: weekOf(date),
          mutual,
          injured,
          exists: Boolean(pair),
          team_rank: teamRankByKey.get(key) || null,
          team_points: teamPointsByKey.get(key) ?? null,
          individual_rank_a: A ? resolveEntryRank(A) : null,
          individual_rank_b: B ? resolveEntryRank(B) : null,
          overall_a: Number(A?.overall_rating || A?.overall || 0) || null,
          overall_b: Number(B?.overall_rating || B?.overall || 0) || null,
          pair_entry_rank: null,
          events_this_week: weekTournaments.length,
          eligible_events: 0,
          candidate_events: 0,
          choose_decision: null,
          choose_reason: null,
          selected_event: null,
          selected_tier: null,
          capacity_position: null,
          capacity_size: null,
          draw_size: null,
          played: false,
          stage: null,
        };

        if (!pair) {
          base.stage = PIPELINE_STAGES.NOT_IN_CANDIDATE_POOL;
          // Parte Q — POR QUE ficou fora do pool. `buildCanonicalPairs`
          // consome primeiro as linhas de Partnership ativas, marcando os
          // membros como já vistos; só depois o fallback por `ai_partner_id`
          // roda, e ele PULA quem já foi consumido. Uma dupla mutuamente
          // declarada cujo membro está preso a outra linha ativa nunca se
          // forma — e fica invisível ao sorteio sem nenhum sinal de erro.
          base.shadow_pair_a = null;
          base.shadow_pair_b = null;
          for (const p of pairs) {
            const ids = p.athletes.map((x) => x.id);
            if (ids.includes(ida)) base.shadow_pair_a = { pid: p.id, name: p.name };
            if (ids.includes(idb)) base.shadow_pair_b = { pid: p.id, name: p.name };
          }
          rows.push(base);
          continue;
        }
        base.pair_entry_rank = mirrorPairEntryRank(pair, resolveEntryRank);

        if (drawnPairIds.has(pair.id)) {
          base.played = true;
          base.stage = PIPELINE_STAGES.PLAYED;
        }

        if (!weekTournaments.length) {
          base.stage = base.stage || PIPELINE_STAGES.NO_EVENT;
          rows.push(base);
          continue;
        }

        const representative = mirrorRepresentative(pair, resolveEntryRank);
        const entries = weekTournaments.map((t) => ({
          t, entry: evaluateTournamentEntry(t, representative, { aiFieldContext: true }),
        }));
        base.eligible_events = entries.filter((e) => e.entry.eligible).length;
        base.ineligible_reasons = [...new Set(entries.filter((e) => !e.entry.eligible).map((e) => e.entry.reason))];

        const choice = chooseTournament(weekTournaments, representative, {
          strategy: representative.careerStrategy,
          currentRegion: representative.currentRegion,
          aiFieldContext: true,
        });
        base.choose_decision = choice?.decision || null;
        base.choose_reason = choice?.reason || null;
        base.candidate_events = (choice?.options || []).length;
        base.choose_scores = (choice?.options || []).slice(0, 5).map((o) => ({
          tier: o.tournament?.tier, id: o.tournament?.id, score: o.score,
          expectedPoints: o.expectedPoints, prestige: o.prestige, titleChance: o.titleChance,
          fatigue: o.fatigueIncrease, path: o.entry?.path,
        }));
        base.rest_score = choice?.restScore ?? null;

        // Onde a atribuição real o colocou.
        let assignedTo = null;
        for (const [tid, list] of assignments) {
          if (list.some((p) => p.id === pair.id)) { assignedTo = { tid, list }; break; }
        }
        if (assignedTo) {
          const t = weekTournaments.find((x) => x.id === assignedTo.tid);
          base.selected_event = assignedTo.tid;
          base.selected_tier = t?.tier || null;
          base.capacity_size = assignedTo.list.length;
          base.draw_size = t ? drawSizeOf(t) : null;
        }

        if (base.stage === PIPELINE_STAGES.PLAYED) { rows.push(base); continue; }
        if (base.eligible_events === 0) base.stage = PIPELINE_STAGES.INELIGIBLE;
        else if (choice?.decision !== 'play') base.stage = PIPELINE_STAGES.CHOOSE_NONE;
        else if (assignedTo) base.stage = PIPELINE_STAGES.SELECTED_EVENT;
        else base.stage = PIPELINE_STAGES.CUT_BY_CAPACITY;
        rows.push(base);
      }

      // Parte G/H — censo leve de TODAS as duplas do mundo (sem
      // chooseTournament, que é caro): o suficiente para medir "quando esta
      // dupla existiu pela primeira vez" e "quando ela apareceu num sorteio
      // pela primeira vez", que é a latência até o primeiro evento.
      let censusRows = null;
      if (census) {
        censusRows = pairs.map((p) => {
          const k = pairKey(p.athletes[0].id, p.athletes[1].id);
          return {
            pid: p.id,
            key: k,
            name: p.name,
            entry_rank: mirrorPairEntryRank(p, resolveEntryRank),
            team_rank: teamRankByKey.get(k) || null,
            team_points: teamPointsByKey.get(k) ?? 0,
            // Parte B/C — o que distingue "dupla sem standing" de "dupla que
            // já tem posição no circuito". Duas heranças são legítimas e
            // seriam indistinguíveis de ponto inventado sem estes campos:
            //   - dupla RE-formada (os mesmos dois atletas já foram parceiros,
            //     separaram e voltaram) reencontra a própria linha, com os
            //     pontos que ELA conquistou -> matches_played > 0;
            //   - linha do seed do mundo (`origin: 'seed-*'`), que nasce com
            //     pontos e matches_played=0 por construção: é a posição de
            //     largada, não um resultado.
            // (`tournaments_played` não existe na entidade — conferido contra
            // um mundo recém-semeado.)
            team_matches: Math.max(0, Number(teamRowByKey.get(k)?.matches_played) || 0),
            team_origin: teamRowByKey.get(k)?.origin || null,
            team_stats_source: teamRowByKey.get(k)?.stats_source || null,
            // A terceira origem legítima de pontos de uma dupla, além do
            // ledger próprio e do seed: a FÓRMULA CANÔNICA (SOMA dos pontos
            // individuais dos dois membros, circuitLifecycle.js — 5.22-E).
            // Sem os pontos individuais não dá para distinguir "ponto
            // derivado de resultado real dos membros" de "ponto inventado".
            member_points_a: Math.max(0, Number(p.athletes[0]?.world_ranking_points ?? p.athletes[0]?.ranking_points) || 0),
            member_points_b: Math.max(0, Number(p.athletes[1]?.world_ranking_points ?? p.athletes[1]?.ranking_points) || 0),
            ovr: Math.round(p.athletes.reduce((s, a) => s + Number(a.overall_rating || a.overall || 50), 0) / 2),
            age: Math.round(p.athletes.reduce((s, a) => s + Number(a.age || 25), 0) / 2),
            ranked_members: p.athletes.filter((a) => resolveEntryRank(a) > 0).length,
            played: drawnPairIds.has(p.id),
          };
        });
      }

      // Parte M/N — ordem de admissão.
      //
      // A 1ª versão comparava `assignPairsForWeek` recomputado AGORA contra
      // `draw_pair_ids` gravado no sorteio (D-3, dias antes). Os dois lados
      // vinham de instantes diferentes — que é exatamente o que a Parte M
      // proíbe — e o resultado era absurdo: 84% das admissões "fora de
      // ordem", com duplas #2 aparecendo como excluídas de um Platinum. Não
      // era o jogo: era a comparação.
      //
      // Esta versão usa UMA fonte só, gravada num mesmo instante pela
      // produção: `draw_pair_ids` de TODOS os torneios da semana. "Admitida"
      // = sorteada neste torneio; "preterida" = não sorteada em NENHUM
      // torneio da semana, embora elegível a este. A elegibilidade é
      // calculada com a mesma função de produção sobre o estado da semana.
      // Uma chamada por dupla: `options` já vem filtrado por elegibilidade, e
      // `decision` diz se ela sequer quis jogar. Quem escolheu descansar não
      // foi preterida — optou por não concorrer, e contá-la como preterida
      // inflaria a inversão com decisão própria da dupla.
      const eligibleByPair = new Map();
      const wantsToPlay = new Set();
      // Disponibilidade física e de carreira. `chooseTournament` não conhece
      // lesão nem aposentadoria — quem filtra isso é o mundo, antes do
      // sorteio. Sem esta exclusão, uma dupla de elite lesionada aparece como
      // "preterida" em todas as semanas da lesão.
      const unavailable = (p) => p.athletes.some((a) => (
        (a.injured_until && a.injured_until >= date) || a.retired || a.is_retired || a.status === 'aposentado'
      ));
      for (const p of pairs) {
        if (unavailable(p)) continue;
        const rep = mirrorRepresentative(p, resolveEntryRank);
        const choice = chooseTournament(weekTournaments, rep, {
          strategy: rep.careerStrategy, currentRegion: rep.currentRegion, aiFieldContext: true,
        });
        eligibleByPair.set(p.id, (choice?.options || []).map((o) => o.tournament?.id).filter(Boolean));
        if (choice?.decision === 'play') wantsToPlay.add(p.id);
      }
      // Ser ELEGÍVEL a um torneio não é o mesmo que DISPUTAR vaga nele.
      // `chooseTournament` escolhe UM evento; a fila de cada torneio é a
      // saída de `assignPairsForWeek` (que já inclui a cadeia de fallback de
      // tier). Uma dupla que escolheu o Masters e não foi sorteada não foi
      // preterida pelo Platinum — ela nunca entrou na fila dele. Medir por
      // elegibilidade fazia a #2 do mundo aparecer como excluída de um
      // Platinum em que ela nunca se inscreveu.
      const queuedByTournament = new Map();
      for (const [tid, list] of assignments) queuedByTournament.set(tid, new Set(list.map((p) => p.id)));

      const capacity = weekTournaments.map((t) => {
        const drawn = new Set(Array.isArray(t.draw_pair_ids) ? t.draw_pair_ids : []);
        const queue = queuedByTournament.get(t.id) || new Set();
        const admitted = [];
        const passedOver = [];
        let drift = 0;
        for (const p of pairs) {
          const rank = mirrorPairEntryRank(p, resolveEntryRank) || null;
          const row = { pid: p.id, entry_rank: rank, window: Number(p.priorityWindowRemaining) || 0 };
          if (drawn.has(p.id)) {
            admitted.push(row);
            // Sorteada sem estar na fila recomputada agora = deriva entre o
            // instante do sorteio (D-3) e este snapshot. É a medida honesta
            // do quanto a reconstrução externa diverge da produção.
            if (!queue.has(p.id)) drift += 1;
            continue;
          }
          if (!queue.has(p.id)) continue;                 // não disputou ESTA vaga
          if (committedPairIds.has(p.id)) continue;       // já comprometida na janela
          if (!wantsToPlay.has(p.id)) continue;           // optou por descansar
          passedOver.push(row);
        }
        return {
          id: t.id, tier: t.tier, draw: drawSizeOf(t),
          admitted, passedOver, drawn_total: drawn.size, all_drawn: allDrawn,
          queue_size: queue.size, drift,
        };
      });

      const snap = { week: weekOf(date), date, rows, census: censusRows, capacity, weekTournaments: weekTournaments.map((t) => ({ id: t.id, tier: t.tier, draw: drawSizeOf(t), drawn: (t.draw_pair_ids || []).length })) };
      weekly.push(snap);
      if (typeof onWeek === 'function') await onWeek(snap, { localGame, profile, date });
    }

    await processWorldCircuit(profile, circuitAnchor, date).catch(() => null);
    const [tournaments, athletes, partnerships, teams] = await Promise.all([
      localGame.entities.Tournament.list('start_date', 5000),
      localGame.entities.AthleteProfile.list(null, 5000),
      localGame.entities.Partnership.list(null, 5000).catch(() => []),
      localGame.entities.TeamRanking.list('-ranking_points', 5000),
    ]);
    return { label, finalDate: date, weekly, cohort, tournaments, athletes, partnerships, teams };
  } finally {
    await vite.close();
  }
}

/** Sequências consecutivas de semanas sem jogar, só enquanto a dupla existe. */
export function findGaps(rows) {
  const gaps = [];
  let cur = null;
  const flush = () => { if (cur && cur.length) gaps.push(cur); cur = null; };
  // ATENÇÃO: `exists` (estar no pool canônico) NÃO pode interromper a
  // contagem. Uma dupla mutuamente declarada que ficou de fora do pool
  // continua sendo uma dupla que não compete — e essa é justamente a lacuna
  // que interessa. A 1ª versão desta função descartava essas semanas e por
  // isso via 0 lacunas extremas onde a instrumentação da 5.18-E via 6.
  // Só a reciprocidade (`mutual`) delimita a existência da dupla.
  for (const r of rows) {
    if (r.played || !r.mutual) { flush(); continue; }
    if (!cur) cur = { start: r.date, end: r.date, length: 0, weeks: [] };
    cur.end = r.date;
    cur.length += 1;
    cur.weeks.push(r);
  }
  flush();
  return gaps;
}

/** Histograma de estágios sobre um conjunto de semanas. */
export function stageHistogram(rows) {
  const h = {};
  for (const r of rows) h[r.stage || 'NULL'] = (h[r.stage || 'NULL'] || 0) + 1;
  return h;
}
