import { localGame } from '@/api/localGameClient.js';
import { buildWorldRankingSnapshot } from '@/lib/padel.js';
// Fase 15 (Parte 0/1/4/10): auditoria achou 2 fórmulas de career_phase
// conflitantes escrevendo no MESMO campo em cadências diferentes — esta
// (semanal, só idade + peak_age-1) e a de athleteBehavior.js (mensal,
// peak_age ± janela). Consolidado numa só fonte (a de athleteBehavior.js,
// já exportada e mais nuançada por depender de peak_age por atleta, não
// só um corte fixo de idade — Parte 11: "não fazer todos seguirem
// exatamente a mesma curva"); esta função só computa e escreve, nunca
// mais reimplementa a regra.
import { deriveAthleteCareerState, isAthleteRetired } from './livingCircuitRules.js';
import { teamKey, computeCanonicalTeamRankingPoints } from '@/lib/teamRanking.js';
import { resolveTeamRankingMemberPoints } from '@/lib/teamRankingFormula.js';
import { WORLD_RANKING_TARGET, TEAM_RANKING_TARGET } from '@/lib/rankingPopulation.js';
import {
  RANKING_RESULT_ENTITY, RANKING_RESULT_POPULATION_CAP, isResultExpired,
  buildLegacySeedRow, needsLegacySeed, computeRollingPoints, groupResultsByAthlete,
} from './rankingWindow.js';

// Fase 2E.2/2E.4: os dois tetos abaixo cobriam só metade (ou menos) da
// população de 1000 atletas / até 500 duplas possíveis — e de forma
// PERMANENTE, não só truncada: este é o MESMO processo (processWorldCircuit)
// que LÊ pelo corte de ranking_position/ranking_points e DEPOIS escreve de
// volta só pra quem foi lido — quem cai fora nunca mais é recalculado e
// fica excluído para sempre. Confirmado ao investigar o achado #2F (a
// mesma função já precisava do teamKey canônico pra não duplicar linha de
// TeamRanking). Os tetos agora cobrem a população/duplas inteiras com folga.
const ATHLETE_POPULATION_CAP = WORLD_RANKING_TARGET + 100;
// Playthrough 5.5, Parte I — achado: `TEAM_RANKING_TARGET + 100 = 600`
// pressupunha que a população de duplas nunca passaria de ~500 (só a
// semeadura suplementar fixa, rankingPopulation.js). Falso na prática: o
// mercado de parcerias forma MAIS pares ao longo da carreira (qualquer
// atleta que ganha `ai_partner_id` via jogo, não só os 500 seedados),
// então a coleção real cresce além do teto — medido numa temporada: 922
// pares distintos, só 575 visíveis dentro do corte de 600. `updateTeamRankings`
// usa esta leitura só pra montar um mapa de busca por `team_key` (nunca
// pra exibir "top N" — isso é `getTeamRankings`, uma chamada separada,
// sem teto artificial de população) — um par fora do corte fica
// invisível pro `byKey.has(key)`, e toda passada semanal recria uma linha
// nova pro mesmo par em vez de atualizar (achado: duplas fora do top-600
// por pontos acumulavam ~20+ linhas numa única temporada). Elevado com
// folga real (não mais "+100" sobre um teto fixo que a própria dinâmica
// do jogo já violava).
const TEAM_POPULATION_CAP = 5000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function weekKey(date) {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(date || '');
  const first = new Date(parsed.getFullYear(), 0, 1);
  const days = Math.floor((parsed - first) / 86400000);
  return `${parsed.getFullYear()}-W${String(Math.ceil((days + first.getDay() + 1) / 7)).padStart(2, '0')}`;
}

function athleteOverall(athlete) {
  return clamp(athlete?.overall_rating ?? athlete?.overall ?? 55, 1, 99);
}

function isRetired(athlete) {
  return isAthleteRetired(athlete);
}

// Fase 3: rótulo de NÍVEL DE HABILIDADE do atleta (pontos/overall), não de
// acesso a torneio — distinto de EntryManager.js (que decide elegibilidade
// por posição de ranking, não por esta função). Adiciona Bronze como novo
// piso abaixo de Silver (mesmo ponto de corte que Silver tinha antes,
// deslocado); "Circuit Finals"/"Legacy Finals" não entram aqui de
// propósito — são tipos de EVENTO (acesso por mérito/convite), não um
// degrau contínuo de habilidade.
function categoryFor(points, overall) {
  if (points >= 9000 || overall >= 92) return 'Crown';
  if (points >= 5000 || overall >= 86) return 'Elite';
  if (points >= 2500 || overall >= 80) return 'Masters';
  if (points >= 1100 || overall >= 72) return 'Platinum';
  if (points >= 400 || overall >= 64) return 'Gold';
  if (points >= 100 || overall >= 56) return 'Silver';
  return 'Bronze';
}

async function createWorldEvent(payload) {
  try {
    if (!localGame.entities?.WorldEvent?.create) return null;
    return await localGame.entities.WorldEvent.create({
      author_name: 'Padel Legacy News',
      related_players: [],
      tier: 'normal',
      likes: 0,
      tags: ['circuito'],
      ...payload,
    });
  } catch (error) {
    console.warn('[Game Core 2.4] Evento mundial não criado:', error?.message || error);
    return null;
  }
}

async function updateTeamRankings(athletes, currentDate, playerContext = null) {
  if (!localGame.entities?.TeamRanking?.list || !localGame.entities?.TeamRanking?.create) return { processed: 0 };
  const byId = new Map(athletes.map((athlete) => [athlete.id, athlete]));
  const existing = (await localGame.entities.TeamRanking.list('-ranking_points', TEAM_POPULATION_CAP)) || [];
  const byKey = new Map(existing.map((team) => [team.team_key, team]));
  const processed = new Set();
  // Cada par de dupla gerava seu próprio create/update individual. Acumula
  // as operações e grava tudo em uma única transação via localGame.batch.
  const operations = [];

  for (const athlete of athletes) {
    const partnerId = athlete.ai_partner_id;
    if (!partnerId || !byId.has(partnerId)) continue;
    // Fase 2F: team_key precisa ser SEMPRE derivado assim (ids reais,
    // ordenados) — inclusive na semeadura das duplas históricas
    // (saveFoundation.js), senão a mesma dupla ganha uma segunda linha de
    // TeamRanking na primeira vez que este laço rodar (achado #2F).
    const key = teamKey(athlete.id, partnerId);
    if (processed.has(key)) continue;
    processed.add(key);
    const partner = byId.get(partnerId);
    // Playthrough 5.11, Parte S — fórmula única em teamRanking.js.
    const points = computeCanonicalTeamRankingPoints(
      safeNumber(athlete.world_ranking_points, 0), safeNumber(partner.world_ranking_points, 0));
    const payload = {
      team_key: key,
      player1_id: athlete.id,
      player1_name: athlete.name,
      player2_id: partner.id,
      player2_name: partner.name,
      ranking_points: points,
      // Playthrough 5.13, Partes N/O — estas três linhas são o que a aba
      // Duplas exibe como "V · D · títulos". NÃO são um ledger da dupla:
      // são uma ESTIMATIVA derivada dos contadores de carreira INDIVIDUAIS
      // dos dois membros (a dupla não mantém histórico compartilhado
      // próprio para pares de IA).
      //
      // Como estavam, a estimativa era internamente incoerente: as partidas
      // vinham de UM membro só, as vitórias do `min` dos dois e as derrotas
      // do `max` — misturando membros e direções. Resultado medido numa
      // temporada: 2 linhas do Top20 com V+D MAIOR que o total de partidas
      // (ex.: 27V + 18D sobre 17 partidas), um número que a tela mostrava
      // ao jogador como se fosse fato.
      //
      // Agora as três grandezas são coerentes POR CONSTRUÇÃO: vitórias e
      // derrotas usam a mesma redução conservadora (`min`, o que os dois
      // plausivelmente disputaram juntos) e as partidas são a soma delas.
      // Continua uma estimativa — mas uma estimativa que nunca se
      // contradiz. Um par sem contadores segue em 0/0/0, que é honesto:
      // significa "sem histórico compartilhado registrado", não "zero
      // falso".
      season_id: currentDate.slice(0, 4),
    };
    const current = byKey.get(key);

    // Playthrough 5.17, Parte J — V/D/títulos saíram DAQUI.
    //
    // A estimativa acima (min dos contadores individuais) era o motivo de a
    // tela mostrar "0V · 0D" em duplas com milhares de pontos: os pontos
    // vinham de um caminho real e as partidas de uma derivação que
    // frequentemente dava zero. Pior, ela SOBRESCREVIA o número a cada
    // passada do circuito, de modo que nenhum ledger real sobreviveria.
    //
    // Agora quem escreve esses campos é o settlement do World Tour, com o
    // resultado real da dupla (WorldTourLifecycle: pairLedger). Aqui eles
    // são apenas PRESERVADOS. Uma linha que nunca passou pelo ledger fica
    // marcada como histórico indisponível — honesto, e distinguível de uma
    // dupla que realmente jogou zero partidas.
    if (current?.stats_source === 'ledger') {
      payload.wins = safeNumber(current.wins, 0);
      payload.losses = safeNumber(current.losses, 0);
      payload.matches_played = safeNumber(current.matches_played, 0);
      payload.stats_source = 'ledger';
    } else if (current) {
      payload.stats_source = current.stats_source || 'unavailable';
    } else {
      payload.stats_source = 'unavailable';
    }
    if (current?.id && localGame.entities.TeamRanking.update) {
      operations.push({ type: 'update', entityName: 'TeamRanking', id: current.id, data: payload });
    } else {
      operations.push({ type: 'create', entityName: 'TeamRanking', data: payload });
    }
  }
  // Playthrough 5.10, critério 3 — o laço acima só percorre atletas com
  // `ai_partner_id`, ou seja, PARCERIAS REAIS. As duplas da semeadura
  // suplementar (rankingPopulation.js) são pareadas por índice e não
  // correspondem a nenhuma parceria, então nunca passavam por aqui: o valor
  // escrito na criação do mundo ficava CONGELADO para sempre, enquanto os
  // rolling points dos seus membros seguiam mudando. Medido antes desta
  // passada: 423 de 921 linhas (45,9%) fora da fórmula canônica ao fim de
  // uma temporada — a "escala paralela" que esta fase precisa eliminar.
  //
  // Esta segunda passada reprojeta QUALQUER linha remanescente cujos dois
  // membros sejam resolvíveis, usando exatamente a MESMA fórmula. Não cria
  // linha nova, não inventa membro e não toca em estatísticas — só mantém
  // `ranking_points` na unidade única da tabela.
  //
  // Playthrough 5.12 (continuação), Partes A/D/E — antes os membros eram
  // resolvidos só no índice de ATLETAS, então a dupla do JOGADOR
  // (PlayerProfile + AthleteProfile) nunca resolvia e ficava fora da
  // reprojeção: guardava os pontos de quando a linha foi escrita até o
  // próximo torneio (medido: 0 guardado contra 6000 canônico). Agora a
  // resolução passa por `resolveTeamRankingMemberPoints`, que conhece os
  // dois tipos de membro. O jogador continua sendo PlayerProfile — nenhum
  // AthleteProfile é criado para ele.
  const memberContext = { athletesById: byId, playerId: playerContext?.id || null, playerPoints: playerContext?.points };
  for (const team of existing) {
    if (!team?.id || processed.has(team.team_key)) continue;
    const a = resolveTeamRankingMemberPoints(team.player1_id, memberContext);
    const b = resolveTeamRankingMemberPoints(team.player2_id, memberContext);
    if (a === null || b === null) continue;
    const points = computeCanonicalTeamRankingPoints(a, b);
    if (points === safeNumber(team.ranking_points, -1)) continue;
    processed.add(team.team_key);
    operations.push({ type: 'update', entityName: 'TeamRanking', id: team.id, data: { ranking_points: points } });
  }

  if (operations.length) await localGame.batch(operations);
  return { processed: operations.length };
}

export async function processWorldCircuit(profile, previousDate, currentDate) {
  const currentWeek = weekKey(currentDate);
  if (!currentWeek || profile?.last_circuit_week === currentWeek) {
    return { profile, skipped: true, week: currentWeek, athletesProcessed: 0, events: [] };
  }

  const athletes = ((await localGame.entities.AthleteProfile.list('ranking_position', ATHLETE_POPULATION_CAP)) || [])
    .filter((athlete) => athlete?.id && !isRetired(athlete));

  // Ranking é uma ladder global: processar só os 160 maiores OVR deixava
  // posições antigas no restante da população. O patch final continua em
  // um único bulkUpdate, portanto ordenar até 500 atletas é barato.
  const selected = athletes;

  // Fase 4 (ranking rolling de 52 semanas): esta é a ÚNICA passada que lê a
  // população inteira toda semana (achado #18 já a identificava como tal),
  // então é o único lugar que também PODA resultados expirados — não faz
  // sentido duplicar a lógica de poda em WorldTourLifecycle.js, que só
  // recalcula quem jogou nesta chamada. Leitura ÚNICA de toda a coleção de
  // resultados (não uma por atleta) — mesmo padrão de "1 leitura, N
  // gravações" que o resto desta função já usa.
  const existingResultRows = (await localGame.entities[RANKING_RESULT_ENTITY].list(null, RANKING_RESULT_POPULATION_CAP)) || [];
  const resultsByAthlete = groupResultsByAthlete(existingResultRows);
  const rankingResultUpserts = [];
  const rankingResultDeleteIds = [];

  const results = [];
  for (const athlete of selected) {
    // O World Tour/Tournament é a fonte canônica de resultado e pontos. A
    // versão anterior simulava um segundo torneio invisível toda semana,
    // concedendo pontos, títulos e dinheiro em paralelo ao calendário real.
    const result = {
      performance: clamp(athlete.form ?? athlete.current_form ?? 60, 0, 100),
      wonEvent: false,
      reachedFinal: false,
      reachedSemi: false,
      wonMatches: 0,
      lostMatches: 0,
      pointsGain: 0,
      prizeMoney: 0,
    };
    // Fase 4: generalPoints deixa de ser o total vitalício congelado
    // (`decay = 0` de antes, um no-op disfarçado) — agora é recalculado do
    // ZERO toda semana, pra QUALQUER atleta, tenha ele jogado ou não nesta
    // semana. É esta recomputação — não um decaimento incremental — que
    // faz um atleta que parou de jogar cair de posição: resultados antigos
    // saem da janela de 364 dias sozinhos, sem nenhuma escrita sobre eles.
    const priorRows = resultsByAthlete.get(athlete.id) || [];
    const lifetimeFallback = Math.max(0, safeNumber(athlete.world_ranking_points ?? athlete.ranking_points, athleteOverall(athlete) * 25));
    const seedRow = needsLegacySeed(priorRows, lifetimeFallback) ? buildLegacySeedRow(athlete.id, lifetimeFallback, currentDate) : null;
    if (seedRow) rankingResultUpserts.push(seedRow);
    const rowsForAthlete = seedRow ? [...priorRows, seedRow] : priorRows;
    for (const row of rowsForAthlete) {
      if (isResultExpired(row, currentDate)) rankingResultDeleteIds.push(row.id);
    }
    const generalPoints = computeRollingPoints(rowsForAthlete, [], currentDate);
    const oldRace = Math.max(0, safeNumber(athlete.race_points, 0));
    const racePoints = oldRace; // Fase 4A.3: Race não entra na janela — acumulador simples do ano civil, sem mudança.
    const history = Array.isArray(athlete.ranking_history) ? athlete.ranking_history.slice(-51) : [];
    // gained/decayed viram um delta assinado contra o total da semana
    // passada, em vez de sempre 0 — o dado que 4C.4 (defesa de pontos)
    // pede que exista e seja consultável, mesmo sem UI ainda.
    const previousPoints = Math.max(0, safeNumber(athlete.world_ranking_points ?? athlete.ranking_points, 0));
    const delta = generalPoints - previousPoints;
    history.push({ date: currentDate, week: currentWeek, points: generalPoints, race_points: racePoints, gained: Math.max(0, delta), decayed: Math.max(0, -delta) });
    results.push({ athlete, result, generalPoints, racePoints, history });
  }

  const ordered = [...results].sort((a, b) => b.generalPoints - a.generalPoints);
  const raceOrdered = [...results].sort((a, b) => b.racePoints - a.racePoints);
  const racePositions = new Map(raceOrdered.map((entry, index) => [entry.athlete.id, index + 1]));

  // Uma gravação individual por atleta classificado gerava até 160 escritas
  // completas do save toda semana. Acumula os patches e grava tudo em uma
  // única bulkUpdate ao final do laço.
  //
  // Fase 4.0, item 2A (achado #18): ranking_history saiu do AthleteProfile
  // (documento quente, clonado em toda transação de escrita — achado #18)
  // pra uma coleção própria, AthleteRankingHistory. Busca em todo `src/`
  // não encontrou NENHUM consumidor de leitura pra este campo (write-only,
  // autorreferente — só lê pra truncar/anexar o próprio histórico) — mas
  // como existe intenção futura plausível (gráfico de evolução de ranking),
  // os dados são preservados numa coleção separada, não descartados.
  // world_ranking/ranking_history entram como `undefined` no payload abaixo
  // pra migrar saves existentes: o merge de bulkUpdate só sobrescreve uma
  // chave se ela EXISTIR no patch (mesmo com valor undefined) — omitir a
  // chave deixaria o valor antigo intacto. Como este bulkUpdate já toca
  // toda a população TODA semana, a migração não custa nenhuma escrita a
  // mais — reaproveita a única que já existia.
  const athleteUpdates = [];
  const rankingHistoryUpdates = [];
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const athlete = entry.athlete;
    const oldPosition = safeNumber(athlete.ranking_position, index + 1);
    const newPosition = index + 1;
    const careerState = deriveAthleteCareerState(athlete, currentDate);

    athleteUpdates.push({
      id: athlete.id,
      world_ranking_points: entry.generalPoints,
      ranking_points: entry.generalPoints,
      race_points: entry.racePoints,
      ranking_position: newPosition,
      race_position: racePositions.get(athlete.id),
      ranking_previous_position: oldPosition,
      ranking_trend: newPosition < oldPosition ? 'subindo' : newPosition > oldPosition ? 'caindo' : 'estavel',
      circuit_category: categoryFor(entry.generalPoints, athleteOverall(athlete)),
      // Migração (ver comentário acima): remove os dois campos mortos de
      // saves existentes na próxima vez que este atleta for tocado.
      world_ranking: undefined,
      ranking_history: undefined,
      career_stage: careerState.stage,
      career_phase: careerState.legacyPhase,
      last_circuit_update: currentDate,
      // Fase 2.6, item 3: melhor posição já alcançada, pra linha-resumo de
      // aposentadoria (AthleteCareerLegacy) — reaproveita esta MESMA
      // gravação semanal, nenhuma transação nova.
      best_ranking_position: Math.min(newPosition, safeNumber(athlete.best_ranking_position, newPosition)),
    });
    rankingHistoryUpdates.push({ id: athlete.id, history: entry.history });
  }
  if (athleteUpdates.length) {
    await localGame.entities.AthleteProfile.bulkUpdate(athleteUpdates);
  }
  if (rankingHistoryUpdates.length) {
    await localGame.entities.AthleteRankingHistory.bulkUpdate(rankingHistoryUpdates);
  }

  // Fase 4: o jogador entra no MESMO mecanismo de expiração que os
  // atletas de IA — sem isso, o total dele nunca decairia mesmo parado,
  // quebrando a comparação na mesma tabela (Ranking.jsx mescla os dois via
  // buildWorldRankingSnapshot). PlayerProfile é uma coleção separada de
  // AthleteProfile (não entra no `athletes` lido acima), mas reaproveita a
  // MESMA leitura de AthleteRankingResult já feita nesta chamada — nenhuma
  // consulta extra.
  //
  // Conhecido e aceito: o TeamRanking da dupla do PRÓPRIO jogador (linha
  // única, diferente das duplas de IA que updateTeamRankings já recalcula
  // toda semana abaixo) só é atualizado quando ele termina um torneio
  // (tournamentLifecycle.js) — não decai passivamente semana a semana se
  // ele para de jogar. Gap pequeno e cosmético (afeta só a aba Duplas pra
  // uma única linha), não o "topo vitalício" que esta fase ataca — não
  // corrigido agora.
  let playerRankingPatch = {};
  if (profile?.id) {
    const playerPriorRows = resultsByAthlete.get(profile.id) || [];
    const playerLifetimeFallback = Math.max(0, safeNumber(profile.rank_points ?? profile.world_ranking_points, 0));
    const playerSeed = needsLegacySeed(playerPriorRows, playerLifetimeFallback) ? buildLegacySeedRow(profile.id, playerLifetimeFallback, currentDate) : null;
    if (playerSeed) rankingResultUpserts.push(playerSeed);
    const playerRows = playerSeed ? [...playerPriorRows, playerSeed] : playerPriorRows;
    for (const row of playerRows) {
      if (isResultExpired(row, currentDate)) rankingResultDeleteIds.push(row.id);
    }
    const playerPoints = computeRollingPoints(playerRows, [], currentDate);
    playerRankingPatch = { rank_points: playerPoints, world_ranking_points: playerPoints };
  }

  if (rankingResultUpserts.length || rankingResultDeleteIds.length) {
    await localGame.batch([
      ...rankingResultUpserts.map((row) => ({ type: 'upsert', entityName: RANKING_RESULT_ENTITY, id: row.id, data: row })),
      ...rankingResultDeleteIds.map((id) => ({ type: 'delete', entityName: RANKING_RESULT_ENTITY, id })),
    ]);
  }

  // Fase 15 (Parte 24/28/37): marcos de ranking dos bots — MESMA escada
  // unificada já usada pelo jogador (careerStory.js/achievementsData.js),
  // nunca uma nova. Reaproveita oldPosition/newPosition JÁ calculados no
  // laço acima (nenhuma consulta extra). Detector de transição real
  // (cruzou agora, não "já está"), mesmo princípio de
  // rankingMilestoneCrossed (gameStateLifecycle.js) — só o degrau mais
  // exclusivo cruzado gera história, e no máximo 3 histórias de marco por
  // semana (Parte 37: não temos garantia de quantos atletas cruzam ao
  // mesmo tempo com ~1000 no circuito).
  const RANKING_LADDER = [1, 3, 5, 10, 20, 30, 50, 100, 250, 500];
  const MAX_MILESTONE_STORIES_PER_WEEK = 3;
  let milestoneStories = 0;
  // athleteUpdates e ordered têm o MESMO comprimento e ordem (o laço acima
  // gera 1 update por entry, na mesma sequência) — zipar por índice evita
  // qualquer busca O(n) por atleta (Parte 37: nada de O(n²) com ~1000
  // atletas).
  const milestoneCandidates = athleteUpdates
    .map((update, idx) => {
      const crossed = RANKING_LADDER.filter((tier) => update.ranking_position <= tier && update.ranking_previous_position > tier);
      return crossed.length ? { athlete: ordered[idx]?.athlete, milestone: Math.min(...crossed), position: update.ranking_position } : null;
    })
    .filter((item) => item?.athlete)
    .sort((a, b) => a.milestone - b.milestone); // mais exclusivo primeiro
  for (const { athlete, milestone, position } of milestoneCandidates) {
    if (milestoneStories >= MAX_MILESTONE_STORIES_PER_WEEK) break;
    const age = safeNumber(athlete.age, 24);
    const title = milestone === 1
      ? `${athlete.name} é o novo número 1 do mundo`
      : `${age <= 22 ? `Aos ${age} anos, ` : ''}${athlete.name} entra no Top ${milestone} do ranking mundial${age <= 22 ? ' pela primeira vez' : ''}`;
    const event = await createWorldEvent({
      event_type: 'ranking',
      title,
      content: `Com a posição #${position}, ${athlete.name} consolida sua ascensão no circuito profissional.`,
      related_players: [athlete.name],
      tier: milestone <= 10 ? 'destaque' : 'normal',
      event_date: currentDate,
      tags: ['ranking', 'marco', athlete.country || athlete.nationality || 'internacional'],
    });
    if (event) milestoneStories += 1;
  }

  const events = [];
  const champion = results.filter((entry) => entry.result.wonEvent).sort((a, b) => b.result.performance - a.result.performance)[0];
  if (champion) {
    const event = await createWorldEvent({
      event_type: 'noticia',
      title: `${champion.athlete.name} conquista título no circuito`,
      content: `${champion.athlete.name} venceu o principal torneio da semana e somou ${champion.result.pointsGain.toLocaleString('pt-BR')} pontos no ranking mundial.`,
      related_players: [champion.athlete.name],
      tier: athleteOverall(champion.athlete) >= 88 ? 'destaque' : 'normal',
      event_date: currentDate,
      tags: ['circuito', 'campeão', champion.athlete.country || champion.athlete.nationality || 'internacional'],
    });
    if (event) events.push(event);
  }

  const newNumberOne = ordered[0];
  if (newNumberOne && safeNumber(newNumberOne.athlete.ranking_position, 99) !== 1) {
    const event = await createWorldEvent({
      event_type: 'ranking',
      title: `${newNumberOne.athlete.name} assume o número 1 do mundo`,
      content: `Com ${newNumberOne.generalPoints.toLocaleString('pt-BR')} pontos, ${newNumberOne.athlete.name} chegou ao topo do ranking mundial.`,
      related_players: [newNumberOne.athlete.name],
      tier: 'breaking',
      event_date: currentDate,
      tags: ['ranking', 'número 1'],
    });
    if (event) events.push(event);
  }

  const upset = results
    .filter((entry) => athleteOverall(entry.athlete) <= 72 && entry.result.reachedFinal)
    .sort((a, b) => b.result.performance - a.result.performance)[0];
  if (upset) {
    const event = await createWorldEvent({
      event_type: 'promessa',
      title: `Grande surpresa: ${upset.athlete.name} brilha no circuito`,
      content: `${upset.athlete.name} superou as expectativas, chegou às fases decisivas e ganhou ${upset.result.pointsGain} pontos.`,
      related_players: [upset.athlete.name],
      tier: 'destaque',
      event_date: currentDate,
      tags: ['zebra', 'promessa', 'circuito'],
    });
    if (event) events.push(event);
  }

  // Playthrough 5.12 (continuação) — o contexto do jogador entra junto para
  // que a dupla dele participe da mesma reprojeção das duplas de IA. Usa os
  // pontos ROLLING recém-recalculados acima (`playerRankingPatch`), não o
  // valor antigo do perfil.
  const teamRanking = await updateTeamRankings(
    ordered.map((entry) => ({ ...entry.athlete, world_ranking_points: entry.generalPoints })),
    currentDate,
    profile?.id
      ? { id: profile.id, points: safeNumber(playerRankingPatch.world_ranking_points ?? profile.world_ranking_points ?? profile.rank_points, 0) }
      : null,
  );

  const summary = {
    week: currentWeek,
    athletesProcessed: ordered.length,
    numberOne: ordered[0]?.athlete?.name || null,
    raceLeader: raceOrdered[0]?.athlete?.name || null,
    events: events.length,
    teamsUpdated: teamRanking.processed,
  };

  let updatedProfile = profile;
  if (profile?.id) {
    // Playthrough 5.26-B — posição do jogador no ranking. Loja, estágio de
    // patrocínio, missões, treinadores, mercado de duplas etc. leem
    // `profile.ranking_position` de forma síncrona, mas NADA a gravava para o
    // jogador: todos o tratavam como #9999/#2000 para sempre (loja travada em
    // "incomum", patrocínio nunca passava do estágio regional). A posição vem
    // da MESMA autoridade da tela de Ranking (buildWorldRankingSnapshot), com
    // os pontos que acabaram de ser recalculados, na mesma escrita semanal
    // do circuito. Sem ranking (sem pontos/partidas oficiais) → null.
    const snapshot = await buildWorldRankingSnapshot({ ...profile, ...playerRankingPatch }).catch(() => null);
    const rankingPosition = snapshot && !snapshot.unranked && snapshot.playerRank > 0 ? snapshot.playerRank : null;
    updatedProfile = await localGame.entities.PlayerProfile.update(profile.id, {
      last_circuit_week: currentWeek,
      last_circuit_update: currentDate,
      last_circuit_summary: summary,
      game_state_version: '2.4.0',
      ...playerRankingPatch,
      ranking_position: rankingPosition,
    });
  }

  return { profile: updatedProfile, skipped: false, ...summary, events };
}

export async function getCircuitSnapshot() {
  const athletes = (await localGame.entities.AthleteProfile.list('ranking_position', 200)) || [];
  const active = athletes.filter((athlete) => !isRetired(athlete));
  return {
    general: [...active].sort((a, b) => safeNumber(b.world_ranking_points ?? b.ranking_points, 0) - safeNumber(a.world_ranking_points ?? a.ranking_points, 0)),
    race: [...active].sort((a, b) => safeNumber(b.race_points, 0) - safeNumber(a.race_points, 0)),
  };
}
