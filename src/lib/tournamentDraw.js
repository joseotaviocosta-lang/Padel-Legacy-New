// Fase 15.5.4 (complemento — sorteio na data canônica, não no mount do
// modal). Antes desta correção, TournamentModal.jsx criava o
// tournament_run/bracket na primeira vez que o jogador abria a tela do
// torneio — ou seja, o "sorteio" podia acontecer no dia da inscrição,
// semanas antes do primeiro compromisso real, e reabrir/fechar o modal
// nunca revelava nada além do que já existia (mas também nunca escondia
// um adversário que "ainda não deveria" ser conhecido). Esta função move
// a criação para a pipeline temporal da carreira: só é chamada de
// processCalendarEvents (src/lib/calendarSystem.js, dentro de advanceDay),
// nunca de um efeito de render — abrir/fechar o modal do torneio passa a
// apenas LER o que já foi persistido, nunca criar ou recriar o sorteio.
import { localGame } from '@/api/localGameClient.js';
import { daysBetween, generateTournamentOpponent, getPartnerBot, getTournamentRounds } from '@/lib/career';
import { getTeamRank } from '@/lib/teamRanking';
import { resolveCommittedPartnerAthlete } from '@/lib/committedRoster.js';
import { buildPlayerTournamentField } from '@/gameplay/worldTour/WorldTourLifecycle.js';
import { getQualifyingRoundLabels } from '@/gameplay/worldTour/QualifyingManager.js';
import {
  buildTournamentBracketHistory, createTournamentRun, getCurrentTournamentMatch,
} from '@/gameplay/worldTour/TournamentRunManager.js';
import { buildPlayerTournamentBracket, buildSeededDrawSlots } from '@/gameplay/worldTour/tournamentSettlement.js';
import { createKeyedInitializer } from '@/lib/keyedInitialization.js';
import { addTournamentDays, getCanonicalRoundDates } from '@/lib/tournamentSchedule.js';
import { getTournamentTierConfig } from '@/lib/circuitCatalog.js';

// Playthrough 5.26-D — identidade mínima de um atleta REAL do mundo para
// entrar no tournament_run/bracket. Regra do bloco P (save): a entry guarda
// IDENTIDADE, nunca o AthleteProfile inteiro. Estes campos bastam para o
// motor de partida (OVR = overall_rating, mesma autoridade do card), para a
// UI (nome/lado/mão/estilo) e para a resolução canônica de rank por id
// (getCanonicalTeamWorldRank). Nenhum atleta real do mundo tem atributos
// planos; o OVR dele É o campo persistido — não há template parcial a montar.
function fieldMemberIdentity(athlete) {
  if (!athlete) return null;
  const overall = Number(athlete.overall_rating ?? athlete.overall) || 50;
  return {
    id: athlete.id,
    name: athlete.name || athlete.sport_name || 'Atleta',
    sport_name: athlete.sport_name || athlete.name || 'Atleta',
    overall,
    overall_rating: overall,
    form: Number(athlete.form ?? athlete.current_form) || 50,
    position: athlete.position || null,
    preferred_side: athlete.preferred_side || null,
    handedness: athlete.handedness || null,
    play_style: athlete.play_style || null,
    country: athlete.country || null,
  };
}

const normalizeIdentityName = (value) => String(value || '').trim().toLocaleLowerCase('pt-BR');

// Playthrough 5.26-D — preenchimento do quadro a partir do CAMPO REAL já
// admitido (field.entrants). O catálogo sintético só entra como FALLBACK
// explícito quando o universo real não cobre o quadro: contado em
// `diagnostics.syntheticFallback`, marcado como synthetic e NUNCA com rank
// canônico. Evita reutilizar a mesma dupla real e evita um template cujo nome
// colida com atleta real já presente (dupla entrada de identidade).
function createFieldFillerFactory({ field, tournament, profile, usedPairIds, usedMemberNames, usedTeamNames, diagnostics }) {
  const queue = (field.entrants || []).filter((pair) => !usedPairIds.has(pair.id));
  let cursor = 1000;
  let guard = 0;
  return (count) => {
    const fillers = [];
    while (fillers.length < count && guard < count * 8 + 40) {
      guard += 1;
      const pair = queue.shift();
      if (pair) {
        if (usedPairIds.has(pair.id)) continue;
        // LOCAL-7E — homônima de uma equipe já na chave fica de fora (ver usedTeamNames).
        if (usedTeamNames.has(normalizeIdentityName(pair.name))) continue;
        usedPairIds.add(pair.id);
        usedTeamNames.add(normalizeIdentityName(pair.name));
        pair.athletes.forEach((athlete) => athlete?.name && usedMemberNames.add(normalizeIdentityName(athlete.name)));
        fillers.push({ name: pair.name, strength: Number(pair.strength) || 0 });
        continue;
      }
      const members = generateTournamentOpponent(tournament, profile, cursor, [...usedPairIds], 0, 'main');
      cursor += 1;
      if (members.length < 2) continue;
      if (members.some((member) => usedMemberNames.has(normalizeIdentityName(member?.name)))) continue;
      members.forEach((member) => member?.id && usedPairIds.add(member.id));
      diagnostics.syntheticFallback += 1;
      usedTeamNames.add(normalizeIdentityName(members.map((member) => member.name).filter(Boolean).join(' & ')));
      fillers.push({
        name: members.map((member) => member.name).filter(Boolean).join(' & '),
        strength: members.reduce((sum, member) => sum + Number(member.overall_rating || 50), 0) / members.length,
        synthetic: true,
      });
    }
    return fillers;
  };
}

export const TOURNAMENT_DRAW_LEAD_DAYS = 3;

// Mesma âncora que createTournamentRun já usava para startDate (o primeiro
// dia competitivo real da campanha, ciente de qualifying) — canônica para
// decidir tanto o calendário de rodadas quanto o momento do sorteio.
export function getTournamentDrawAnchorDate(calendarEvent, tournament) {
  return calendarEvent?.metadata?.original_start_date || calendarEvent?.start_date || tournament?.start_date || null;
}

export function isTournamentDrawDue(calendarEvent, tournament, careerDate) {
  const anchor = getTournamentDrawAnchorDate(calendarEvent, tournament);
  if (!anchor || !careerDate) return false;
  const days = daysBetween(careerDate, anchor);
  // >= 0 é essencial: um evento cuja data já passou (torneio nunca chegou a
  // ser sorteado — ex.: perdido, abandonado, ou um evento de demonstração
  // antigo sem tournament_run) NÃO deve ressuscitar como sorteio novo dias
  // ou semanas depois. Esses casos continuam caindo na checagem de
  // "perdido"/"concluído" já existente em processCalendarEvents, exatamente
  // como se comportavam antes desta pipeline existir.
  return days >= 0 && days <= TOURNAMENT_DRAW_LEAD_DAYS;
}

// Migração de saves anteriores ao schema v2 do tournament_run (campos
// legados metadata.main_draw_state/qualifying_state) — mesma lógica que
// antes vivia só em TournamentModal.jsx; agora usada por quem realmente
// cria o run (abaixo), já que a criação deixou de acontecer lá.
export function normalizeLegacyRun(run, metadata = {}) {
  if (!run || run.meetingsCompleted?.preTournament || !(metadata.main_draw_state?.results?.length || metadata.qualifying_state?.results?.length)) return run;
  const next = JSON.parse(JSON.stringify(run));
  next.meetingsCompleted.preTournament = true;
  const legacyResults = [
    ...(metadata.qualifying_state?.results || []).map((result) => ({ ...result, stage: 'qualifying' })),
    ...(metadata.main_draw_state?.results || []).map((result) => ({ ...result, stage: 'main' })),
  ];
  legacyResults.forEach((result) => {
    const match = next.matches.find((item) => item.stage === result.stage && item.status !== 'completed');
    if (!match) return;
    match.status = 'completed';
    match.preparationCompleted = true;
    match.result = { won: Boolean(result.won), score: result.score || null };
  });
  const nextIndex = next.matches.findIndex((match) => match.status !== 'completed');
  next.currentRound = nextIndex < 0 ? Math.max(0, next.matches.length - 1) : nextIndex;
  if (nextIndex >= 0) next.status = 'between_rounds';
  return next;
}

// Playthrough 4.6, itens 6/7/9 — causa exata do adversário inicial do
// jogador ficar sempre numa faixa fixa (#493 antes da Fase 4.5A, #232
// depois): o "rank" sintético de cada rodada vinha de uma fórmula LINEAR
// desconectada de qualquer seeding real — `playerRank - (rodada+1)*8` —
// nunca uma posição de chave de verdade. Corrigido reusando o MESMO motor
// de seeding do AI-only (buildCanonicalTournamentBracket, que já implementa
// buildSeededDrawSlots corretamente, Playthrough 4.6 item 1-5): monta um
// campo sintético do TAMANHO REAL do tier (`drawSize`), insere o jogador na
// sua posição real (rank atual, ou o pior slot se ainda sem ranking — item
// 7: mal ranqueado pode pegar um seed cedo, exatamente como aconteceria de
// verdade), deixa o motor decidir quem ele "encontraria" a cada rodada se
// seguisse vencendo — a MESMA lógica de seed/bye que protege os cabeças de
// chave da IA, sem tratamento especial pro jogador (item 7: única diferença
// é controle humano, não regra esportiva).
// Usa buildSeededDrawSlots diretamente (posicionamento puro, sem resolver
// partida nenhuma) — nunca "força" o jogador a vencer inflando força
// artificialmente (isso o tornaria o seed nº1 por construção, o oposto do
// que se quer simular para um jogador mal ranqueado). Projeta o adversário
// de cada rodada k assumindo "seeding se confirma": é sempre o melhor seed
// do bloco-espelho de tamanho 2^k que se funde com o bloco do jogador
// naquela rodada — a mesma matemática de blocos que o próprio
// buildCanonicalTournamentBracket usa internamente pra propagar vencedores.
// Playthrough 5.0, Parte H — causa raiz confirmada empiricamente (simulação
// direta: um jogador sem ranking real, `effectiveRank = size` antes desta
// correção, recebia rank=2 no round 0 e rank=1 na final — dificuldade
// INVERTIDA, o pior caso possível logo na primeira rodada). O motivo é
// estrutural, não um bug de fórmula: `buildSeededDrawSlots` (nunca
// alterado aqui — protege os MELHORES seeds corretamente, exatamente como
// deve) sempre casa o slot mais FRACO do campo sintético com o slot mais
// FORTE na primeira rodada — é assim que qualquer seeding de proteção
// funciona (1 vs. size, 2 vs. size-1, ...). Colocar um jogador SEM ranking
// no slot MAIS fraco (`size`) o torna, por construção, o adversário
// "perfeito" do seed nº1 logo de cara — o oposto do que se quer para um
// iniciante. A correção não mexe no motor de seeding (Parte K/Z): só
// escolhe, para quem ainda não tem ranking real, uma posição sintética
// plausível de "sem-ranking real" (fraca, mas não o extremo estrutural que
// colide com a proteção do seed nº1) — um novato de verdade não é
// tecnicamente o "pior classificável do planeta", é apenas alguém sem
// histórico ainda.
const UNRANKED_SYNTHETIC_RANK_PERCENTILE = 0.75;

function computeSeededOpponentRanksForMainDraw({ tournamentId, drawSize, playerRank }) {
  const size = Math.max(2, Number(drawSize) || 16);
  const effectiveRank = Number(playerRank) > 0
    ? Math.min(Math.round(Number(playerRank)), size)
    : Math.max(1, Math.min(size - 1, Math.round(size * UNRANKED_SYNTHETIC_RANK_PERCENTILE)));
  const entrants = Array.from({ length: size }, (_, i) => {
    const rank = i + 1;
    return { name: rank === effectiveRank ? '__player__' : `rank-${rank}`, strength: size - rank + 1, rank };
  });
  const { slots } = buildSeededDrawSlots({ entrants, tournamentId: `${tournamentId || 'tournament'}:seed-preview` });
  const playerSlot = slots.findIndex((entrant) => entrant?.name === '__player__');
  if (playerSlot < 0) return [];

  const roundCount = Math.ceil(Math.log2(size));
  const ranksByRound = [];
  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    const blockSize = 2 ** roundIndex;
    const blockStart = Math.floor(playerSlot / blockSize) * blockSize;
    const siblingStart = (Math.floor(blockStart / blockSize) % 2 === 0) ? blockStart + blockSize : blockStart - blockSize;
    const siblingEntrants = slots.slice(siblingStart, siblingStart + blockSize).filter(Boolean);
    if (!siblingEntrants.length) { ranksByRound.push(null); continue; } // bloco-espelho inteiro fantasma — bye nesta rodada.
    const bestSeed = siblingEntrants.reduce((best, entrant) => (entrant.rank < best.rank ? entrant : best));
    ranksByRound.push(bestSeed.rank);
  }
  return ranksByRound;
}

async function createDrawnRun({ profile, tournament, calendarEvent }) {
  const entities = /** @type {any} */ (localGame.entities);
  // Playthrough 5.19, Partes L/M — O SORTEIO CONGELAVA O PARCEIRO ATUAL.
  //
  // Este é o caminho D-3, o que PERSISTE `bracket_history` e o bracket
  // canônico. Ele usava `getPartnerBot(profile)`, o parceiro ATUAL, e gravava
  // esse nome na chave. No playtest o jogador se inscreveu em Casablanca com
  // Pedro, o contrato terminou, ele firmou com Andrea, e o sorteio (posterior
  // à troca) gravou "ze & Andrea Ricci" — enquanto a partida e o settlement,
  // que resolvem o roster comprometido, seguiam com Pedro. A chave guardava a
  // identidade errada de forma permanente.
  //
  // Para um torneio já inscrito o roster é o da INSCRIÇÃO. Mesma autoridade do
  // motor e da campanha (`resolveCommittedPartnerAthlete`): identidade fixa,
  // atributos vivos. Sem inscrição, ela devolve o parceiro atual.
  const partner = await resolveCommittedPartnerAthlete({
    profile,
    tournamentId: tournament?.id,
    calendarEvents: calendarEvent ? [calendarEvent] : [],
  }).catch(() => getPartnerBot(profile));
  const rank = partner ? await getTeamRank(profile, partner) : { rank: 0, total: 0 };
  const mainRounds = getTournamentRounds(tournament);
  const qualifyingRequired = Boolean(calendarEvent.metadata?.qualifying_required);
  const qualifyingRounds = qualifyingRequired
    ? getQualifyingRoundLabels(tournament).map((label) => ({ label, short: 'Q' }))
    : [];
  const tierConfig = getTournamentTierConfig(tournament?.tier);
  const mainDrawSize = Math.max(2, Number(tournament?.main_draw_size) || tierConfig.mainDrawSize || 16);
  const playerTeam = `${profile?.sport_name || profile?.name || 'Jogador'} & ${partner?.name || 'Parceiro'}`;

  // ── Playthrough 5.26-D — CAMPO REAL (Blocos A/B/C/G/H) ────────────────
  // O main draw deixa de nascer do catálogo sintético: as duplas adversárias
  // vêm do universo real (buildPlayerTournamentField → buildCanonicalPairs),
  // com identidade canônica, TeamRanking real e OVR canônico. A autoridade de
  // admissão (blendedCutScore), o drawSize, os BYEs e o roster comprometido
  // ficam intactos. O catálogo só preenche lacuna explícita (fallback), nunca
  // com rank falso.
  const field = await buildPlayerTournamentField({
    tournament, profile, playerRank: rank.rank, playerTeamName: playerTeam,
    partnerAthleteId: partner?.id || null, qualifyingRoundCount: qualifyingRounds.length,
  }).catch(() => null);
  const usedPairIds = new Set();
  const usedMemberNames = new Set();
  if (partner?.name) usedMemberNames.add(normalizeIdentityName(partner.name));
  // LOCAL-7E — a chave do jogador identifica equipes por NOME (propagação de
  // vencedor, cascata, saída no qualifying). Duas duplas REAIS distintas com o
  // mesmo nome de exibição (o gerador não garante nomes únicos) seriam
  // indistinguíveis ali. Dentro de uma mesma chave, nenhuma equipe repete o
  // nome de outra: a homônima de quem já entrou fica de fora do preenchimento
  // ou cede a vaga ao fallback, como o catálogo sintético já fazia por membro.
  // A escolha dos adversários do qualifying não muda; os nomes deles só entram
  // como já usados.
  const usedTeamNames = new Set([normalizeIdentityName(playerTeam)]);
  const diagnostics = field?.diagnostics || { syntheticFallback: 0, realSelected: 0, candidatePool: 0 };
  const seededMainOpponentRanks = computeSeededOpponentRanksForMainDraw({
    tournamentId: tournament?.id, drawSize: mainDrawSize, playerRank: rank.rank,
  });

  // Qualifying: usa as duplas REAIS mais fracas do campo elegível (mesma
  // identidade/rank/OVR); só cai no catálogo se o universo real não cobrir.
  const qualifyingOpponents = qualifyingRounds.map((round, index) => {
    const pairId = field?.qualifyingOpponentIds?.[index] || null;
    const pair = pairId ? field.pairsById.get(pairId) : null;
    if (pair) {
      usedPairIds.add(pair.id);
      usedTeamNames.add(normalizeIdentityName(pair.name));
      pair.athletes.forEach((athlete) => athlete?.name && usedMemberNames.add(normalizeIdentityName(athlete.name)));
      return {
        members: pair.athletes.map(fieldMemberIdentity).filter(Boolean),
        rank: field.rankByPairId.get(pair.id) || 0, pairId: pair.id, source: 'world-pair',
      };
    }
    const opponentRank = Math.max(1, Number(rank.rank || 240) - (index + 1) * 3);
    let members = generateTournamentOpponent(tournament, profile, index, [partner?.id].filter(Boolean), opponentRank, 'qualifying');
    if (members.length < 2) members = generateTournamentOpponent(tournament, profile, index + 300, [partner?.id].filter(Boolean), opponentRank, 'qualifying');
    members.forEach((item) => item?.name && usedMemberNames.add(normalizeIdentityName(item.name)));
    usedTeamNames.add(normalizeIdentityName(members.map((item) => item?.name).filter(Boolean).join(' & ')));
    return { members, rank: opponentRank, pairId: null, source: 'synthetic-qualifying' };
  });

  // Main draw: adversário real projetado pelo MESMO motor de seed da IA.
  const mainEntries = mainRounds.map((round, index) => {
    const pairId = field?.mainOpponentIds?.[index] || null;
    const pair = pairId ? field.pairsById.get(pairId) : null;
    if (pair && !usedTeamNames.has(normalizeIdentityName(pair.name))) {
      usedPairIds.add(pair.id);
      usedTeamNames.add(normalizeIdentityName(pair.name));
      pair.athletes.forEach((athlete) => athlete?.name && usedMemberNames.add(normalizeIdentityName(athlete.name)));
      return {
        name: pair.name,
        members: pair.athletes.map(fieldMemberIdentity).filter(Boolean),
        rank: field.rankByPairId.get(pair.id) || 0,
        pairId: pair.id,
        source: 'world-pair',
      };
    }
    // Fallback EXPLÍCITO: o universo real não cobriu esta rodada. O catálogo
    // entra sem rank canônico (null) — nunca fingindo posição.
    const opponentRank = seededMainOpponentRanks[index] ?? mainDrawSize;
    const exclude = [...usedPairIds, ...[partner?.id].filter(Boolean)];
    let members = generateTournamentOpponent(tournament, profile, index, exclude, opponentRank, 'main');
    if (members.some((member) => usedMemberNames.has(normalizeIdentityName(member?.name)))) {
      members = generateTournamentOpponent(tournament, profile, index + 500, exclude, opponentRank, 'main');
    }
    members.forEach((item) => item?.name && usedMemberNames.add(normalizeIdentityName(item.name)));
    usedTeamNames.add(normalizeIdentityName(members.map((item) => item?.name).filter(Boolean).join(' & ')));
    diagnostics.syntheticFallback = (diagnostics.syntheticFallback || 0) + 1;
    return {
      name: members.map((item) => item.name).filter(Boolean).join(' & ') || `Adversário ${index + 1}`,
      members, rank: null, pairId: null, source: 'fallback-synthetic',
    };
  });
  const opponents = [...qualifyingOpponents, ...mainEntries].map((entry) => ({
    members: entry.members, rank: entry.rank, pair_id: entry.pairId || null, source: entry.source || null,
  }));
  let tournamentRun = createTournamentRun({
    tournament,
    profileId: profile.id,
    startDate: getTournamentDrawAnchorDate(calendarEvent, tournament),
    qualifyingRounds,
    mainRounds,
    qualifyingRequired,
    opponents,
  });
  tournamentRun = normalizeLegacyRun(tournamentRun, calendarEvent.metadata || {});
  const savedEvent = await entities.CalendarEvent.update(calendarEvent.id, {
    title: `${tournament.name} — ${getCurrentTournamentMatch(tournamentRun)?.round || 'Torneio'}`,
    start_date: getCurrentTournamentMatch(tournamentRun)?.date || calendarEvent.start_date,
    end_date: getCurrentTournamentMatch(tournamentRun)?.date || calendarEvent.end_date,
    requires_decision: !['eliminated', 'champion', 'finished'].includes(tournamentRun.status),
    metadata: { ...(calendarEvent.metadata || {}), tournament_run: tournamentRun, tournament_run_schema_version: 2 },
  });
  // Playthrough 4.2, item 1/8 — a chave persistida deixa de ser só o
  // caminho da dupla do jogador (`buildTournamentBracketHistory`, mantida
  // abaixo só como fallback) e passa a ser a chave COMPLETA do main draw,
  // com todos os confrontos que não envolvem o jogador já decididos pelo
  // motor determinístico do AI-only. `bracket_schema_version` marca saves
  // novos para a leitura em tournamentLifecycle.js/TournamentModal.jsx
  // saber qual formato está lendo (item 9 — nunca reinterpreta uma chave
  // legada como se fosse completa).
  //
  // 5.26-D — `mainOpponents` são as duplas REAIS projetadas pelo seeding e o
  // preenchimento também vem do campo real (createFieldFillerFactory); o
  // catálogo só entra como fallback explícito.
  const mainOpponents = mainEntries.map((entry) => ({ name: entry.name }));
  const fillerFactory = createFieldFillerFactory({
    field: field || { entrants: [] }, tournament, profile, usedPairIds, usedMemberNames, usedTeamNames, diagnostics,
  });
  let canonicalBracket = null;
  try {
    // Item 2 — a rodada 0 do main draw começa depois de todas as rodadas de
    // qualifying (mesma âncora usada por `createTournamentRun`/`opponents`
    // acima, index flat = qualifyingRounds.length); cada rodada seguinte
    // consome +1 dia de carreira, real desta vez, não o único `date` do
    // sorteio repetido em toda a chave.
    const mainDrawStartDate = addTournamentDays(getTournamentDrawAnchorDate(calendarEvent, tournament), qualifyingRounds.length);
    canonicalBracket = buildPlayerTournamentBracket({
      tournamentId: tournament.id,
      date: getTournamentDrawAnchorDate(calendarEvent, tournament),
      roundDates: getCanonicalRoundDates(mainDrawStartDate, mainOpponents.length),
      playerTeamName: playerTeam,
      mainOpponents,
      fillerFactory,
    });
  } catch (error) {
    canonicalBracket = null;
  }

  // Bloco D (5.26-D) — identidade do CAMPO persistida no bracket. Somente
  // duplas REAIS entram em `draw_pair_ids` (a MESMA chave usada pela
  // exclusividade de agenda da IA); o snapshot guarda rank/pontos/membros do
  // instante do sorteio (nunca recalculado depois). Fallback sintético é
  // contado, nunca recebe rank.
  const realUsedPairIds = [...usedPairIds].filter((id) => field?.pairsById?.has(id));
  const drawRankingSnapshot = realUsedPairIds.map((id) => {
    const pair = field.pairsById.get(id);
    return {
      pair_id: id,
      name: pair?.name || null,
      rank: Number(field.rankByPairId.get(id)) || null,
      points: Number(field.pointsByPairId.get(id)) || 0,
      member_ids: (pair?.athletes || []).map((athlete) => athlete?.id).filter(Boolean),
    };
  });
  const drawFieldPatch = {
    draw_pair_ids: realUsedPairIds,
    draw_ranking_snapshot: drawRankingSnapshot,
    draw_field_origin_version: diagnostics.fieldOrigin || 'world-pairs-v526d',
    draw_fallback_pair_count: Number(diagnostics.syntheticFallback) || 0,
    draw_real_pair_count: realUsedPairIds.length,
    draw_participant_count: realUsedPairIds.length + (Number(diagnostics.syntheticFallback) || 0),
  };
  // Playthrough 4.6C, item 3/13 — a trilha do jogador nunca atualizava
  // `Tournament.status`/`draw_date`/`draw_pending_reason` (ficava
  // 'inscricoes' para sempre, mesmo com a chave já persistida), diferente
  // da trilha AI-only (ensureWorldTourDraws), que sempre grava
  // status:'chaveamento'/draw_date/draw_pending_reason:null no momento do
  // sorteio. Sem essa paridade, qualquer leitura de `tournament.status`
  // (diagnóstico, getTournamentDrawState) via a trilha errada via o
  // torneio do jogador como "nunca sorteado". Mesma fonte factual pras
  // duas trilhas (item 13) — nunca resolve a partida do jogador aqui,
  // só marca que o sorteio (que já aconteceu, acima) está registrado.
  await entities.Tournament.update(tournament.id, canonicalBracket ? {
    bracket_history: canonicalBracket,
    bracket_schema_version: 2,
    current_phase: tournamentRun.status,
    status: 'chaveamento',
    draw_date: profile.career_date,
    draw_pending_reason: null,
    ...drawFieldPatch,
  } : {
    bracket_history: buildTournamentBracketHistory(tournamentRun, playerTeam),
    current_phase: tournamentRun.status,
    status: 'chaveamento',
    draw_date: profile.career_date,
    draw_pending_reason: null,
  }).catch(() => {});
  return { run: tournamentRun, event: savedEvent };
}

// Colapsa apenas chamadas CONCORRENTES para o mesmo CalendarEvent dentro da
// mesma sessão (ex.: o dia de avanço e uma leitura do sino de notificações
// disputando o mesmo instante) — não é a garantia real de idempotência
// entre reloads/sessões diferentes, essa vem do guard de
// `metadata.tournament_run` em ensureTournamentDraw, abaixo.
const singleFlight = createKeyedInitializer(createDrawnRun);

// Ponto único e idempotente de criação do sorteio. Chamado exclusivamente
// pela pipeline de avanço de dia (processCalendarEvents, dentro de
// advanceDay) — nunca por um efeito de montagem de componente. Um
// `tournament_run` já persistido é tratado como estado legado válido:
// nunca é apagado, resorteado ou tem adversários trocados, mesmo que
// tenha sido criado pela implementação antiga (no mount do modal, antes
// deste hotfix).
export async function ensureTournamentDraw({ profile, tournament, calendarEvent }) {
  if (calendarEvent?.metadata?.tournament_run) {
    return { run: calendarEvent.metadata.tournament_run, event: calendarEvent, created: false, drawn: true };
  }
  if (!tournament || !calendarEvent || !profile?.id) {
    return { run: null, event: calendarEvent || null, created: false, drawn: false };
  }
  // Fase 15.6 (achado real — QA físico, "primeiro torneio" bloqueando o
  // calendário sem inscrição): todo CalendarEvent do tipo 'tournament' criado
  // por um registro real (registerTournament, tournamentRegistration.js)
  // grava `metadata.registration_id`. O seed de demonstração
  // (src/local/localSeed.js, CalendarEvent 'cal-002') é um evento
  // event_type:'tournament'/status:'scheduled'/related_id válido só para
  // ilustrar o calendário — nunca teve inscrição real (is_mandatory:false,
  // sem metadata). Sem este guard, esta pipeline sorteava esse evento de
  // demonstração como se fosse uma campanha real assim que sua data
  // chegasse, e a escrita de `requires_decision:true` (abaixo) o
  // transformava numa decisão obrigatória bloqueando advanceDay para
  // QUALQUER carreira nova — mesmo sem o jogador nunca ter se inscrito em
  // nada. Nenhum sorteio deve nascer sem uma inscrição real por trás.
  if (!calendarEvent.metadata?.registration_id) {
    return { run: null, event: calendarEvent, created: false, drawn: false };
  }
  if (!isTournamentDrawDue(calendarEvent, tournament, profile.career_date)) {
    return { run: null, event: calendarEvent, created: false, drawn: false };
  }
  const { run, event } = await singleFlight(calendarEvent.id, { profile, tournament, calendarEvent });
  return { run, event, created: true, drawn: true };
}
