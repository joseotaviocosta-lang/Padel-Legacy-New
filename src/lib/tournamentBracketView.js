const COMPLETED_TOURNAMENT_STATUSES = new Set(['finalizado', 'completed', 'concluido', 'finished', 'champion']);
const TERMINAL_MATCH_STATUSES = new Set(['completed', 'finished', 'played', 'concluido', 'finalizado']);

function normalizeDate(value) {
  const date = String(value || '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function teamName(value) {
  if (Array.isArray(value)) return value.map((member) => member?.name || member).filter(Boolean).join(' & ') || null;
  const name = String(value || '').trim();
  return name || null;
}

function rawTeam(match, side) {
  return teamName(side === 'a' ? (match?.team_a || match?.a) : (match?.team_b || match?.b));
}

function winnerMatchesEntrant(match) {
  const winner = teamName(match?.winner);
  return Boolean(winner && [rawTeam(match, 'a'), rawTeam(match, 'b')].includes(winner));
}

function matchHasReachedCareerDate(match, round, careerDate) {
  const today = normalizeDate(careerDate);
  const matchDate = normalizeDate(match?.date || round?.date);
  return Boolean(today && matchDate && matchDate <= today);
}

function isTerminalBracketResult(match, round, careerDate, tournamentCompleted) {
  if (!winnerMatchesEntrant(match)) return false;
  const status = String(match?.status || round?.status || '').toLocaleLowerCase('pt-BR');
  if (tournamentCompleted) return TERMINAL_MATCH_STATUSES.has(status) || Boolean(match?.score);
  return TERMINAL_MATCH_STATUSES.has(status) && matchHasReachedCareerDate(match, round, careerDate);
}

function placeholder(matchNumber) {
  return `Vencedor Jogo ${matchNumber}`;
}

function isPlaceholder(value) {
  return /^Vencedor Jogo \d+$/.test(String(value || ''));
}

export function isTournamentCompletedAt(tournament, careerDate) {
  const status = String(tournament?.status || '').toLocaleLowerCase('pt-BR');
  const phase = String(tournament?.current_phase || '').toLocaleLowerCase('pt-BR');
  const date = normalizeDate(tournament?.start_date);
  const today = normalizeDate(careerDate);
  if (today && date && date > today) return false;
  return COMPLETED_TOURNAMENT_STATUSES.has(status)
    || COMPLETED_TOURNAMENT_STATUSES.has(phase)
    || Boolean(tournament?.completed_date && (!today || tournament.completed_date <= today));
}

export function isTournamentFutureOrPending(tournament, careerDate) {
  return !isTournamentCompletedAt(tournament, careerDate);
}

// Playthrough 4.5C, itens 2/3 — um torneio cancelado (Cidade do Cabo: chegou
// ao início sem campo mínimo, WorldTourLifecycle.js) é um estado TERMINAL
// distinto de "concluído" e de "ainda aguardando sorteio" — nenhuma das
// duas fontes de verdade (`isTournamentCompletedAt`, que não conhece
// 'cancelado', e a UI, que só sabia ler `bracket_history` vazio) conseguia
// expressar isso: o jogador via "Chave ainda não sorteada" para sempre, ou
// "Torneio encerrado" genérico depois do end_date — nunca "CANCELADO".
export function isTournamentCancelled(tournament) {
  const status = String(tournament?.status || '').toLocaleLowerCase('pt-BR');
  const phase = String(tournament?.current_phase || '').toLocaleLowerCase('pt-BR');
  return Boolean(tournament?.world_tour_cancelled) || status === 'cancelado' || phase === 'cancelado';
}

const CANCELLATION_REASON_LABELS = Object.freeze({
  inscritos_insuficientes: 'Evento cancelado por número insuficiente de duplas elegíveis.',
  sem_chave_ate_o_inicio: 'Evento cancelado por número insuficiente de duplas elegíveis até o início do torneio.',
});

export function getTournamentCancellationLabel(tournament) {
  return CANCELLATION_REASON_LABELS[tournament?.cancellation_reason]
    || 'Evento cancelado por número insuficiente de duplas elegíveis.';
}

/**
 * Projeção temporal pura da chave. O histórico persistido permanece intacto;
 * somente resultados terminais alcançados pela data da carreira podem abrir
 * o caminho classificatório da rodada seguinte.
 */
export function getVisibleTournamentBracketState(tournament, careerDate) {
  const history = Array.isArray(tournament?.bracket_history) ? tournament.bracket_history : [];
  const completed = isTournamentCompletedAt(tournament, careerDate);
  const cancelled = isTournamentCancelled(tournament);
  if (!history.length) {
    // Torneio da IA nunca desenha chave (item 8b): sem histórico, o campeão
    // gravado no Tournament é a única fonte — e precisa ser a MESMA que o
    // Jornal e o Race leem. Item 2/3 (Playthrough 4.5C) — um evento
    // cancelado NUNCA tem campeão, mesmo que `completed` acabe true por
    // conta da data (end_date já passado): `cancelled` deixa a UI
    // distinguir "aguardando sorteio" de "cancelado", os dois únicos casos
    // sem bracket_history.
    return {
      drawn: false, completed, cancelled, rounds: [],
      champion: completed && !cancelled ? teamName(tournament?.champion) : null,
      focusRoundIndex: 0,
    };
  }

  // Playthrough 4.5B, itens 3/4/5/6/8 — a chave canônica (bracket_schema_version
  // 2, sorteada em D-3 por ensureWorldTourDraws/tournamentDraw.js) grava
  // team_a/team_b/source_match_ids CORRETOS desde a escrita
  // (buildCanonicalTournamentBracket, tournamentSettlement.js) — o dado bruto
  // já é estruturalmente são para QUALQUER tamanho de campo, potência de 2 ou
  // não (Madri: 23/24 duplas, com bye). O bug de Madri (mesma dupla
  // propagada em múltiplos slots, "Vencedor Jogo X" incorreto) vinha
  // daqui: o ramo abaixo RECONSTRUÍA team_a/team_b por posição
  // (`previous.matches[matchIndex*2]`), assumindo que toda rodada tem
  // EXATAMENTE metade dos confrontos da anterior — falso sempre que há bye
  // (qualquer campo que não seja potência de 2). Essa reconstrução
  // alterava o grafo (item 8 proíbe isso: a projeção só pode
  // esconder/revelar, nunca reconstruir). A chave canônica não precisa de
  // reconstrução nenhuma: só decide QUANDO revelar os valores já corretos.
  const canonicalSchema = Number(tournament?.bracket_schema_version) >= 2;

  const rounds = [];
  // Numeração global das partidas: offset = partidas de todas as rodadas anteriores.
  const roundOffsets = [];
  history.reduce((offset, round, index) => { roundOffsets[index] = offset; return offset + (Array.isArray(round?.matches) ? round.matches.length : 0); }, 0);
  for (let roundIndex = 0; roundIndex < history.length; roundIndex += 1) {
    const rawRound = history[roundIndex] || {};
    const rawMatches = Array.isArray(rawRound.matches) ? rawRound.matches : [];
    const previous = rounds[roundIndex - 1] || null;
    const roundOffset = roundOffsets[roundIndex] || 0;
    const previousRoundOffset = roundIndex > 0 ? roundOffsets[roundIndex - 1] || 0 : 0;

    let matches;
    if (canonicalSchema) {
      // Playthrough 4.6B, itens 6/7/8 — "entrantsKnown" por RODADA INTEIRA
      // escondia um seed com BYE atrás de "Participante a definir" só porque
      // o OUTRO lado do confronto ainda dependia de uma partida real da
      // rodada anterior. Um BYE é fato conhecido desde o sorteio (D-3) —
      // nunca precisa esperar a rodada anterior inteira "acontecer" pra
      // revelar quem passou por ele. `history[roundIndex-1].byes` (nomes que
      // avançaram sem jogar, gravado por buildCanonicalTournamentBracket)
      // já existe pra decidir isso por SLOT: um nome ali é revelado
      // imediatamente; o outro lado (dependente de um jogo real ainda não
      // datado) recebe um placeholder "Vencedor Jogo N" identificando o jogo
      // de origem via source_match_ids — nunca resolve quem vai vencer
      // aquele jogo, só nomeia-o (item 8: mostrar BYE não é pré-resolver a
      // rodada seguinte).
      const previousRoundRaw = history[roundIndex - 1] || null;
      const previousRoundByes = new Set(Array.isArray(previousRoundRaw?.byes) ? previousRoundRaw.byes : []);
      const previousRoundMatchIndexById = new Map((Array.isArray(previousRoundRaw?.matches) ? previousRoundRaw.matches : [])
        .map((feeder, feederIndex) => [feeder.match_id, feederIndex]));
      const previousRoundDateReached = roundIndex === 0
        || matchHasReachedCareerDate(null, previousRoundRaw, careerDate);
      // `rawSourceIds` preserva [origem de team_a, origem de team_b] quando os
      // DOIS lados vêm de partida real (buildCanonicalTournamentBracket grava
      // `[teamA.sourceMatchId, teamB.sourceMatchId].filter(Boolean)` — nada é
      // removido nesse caso, a ordem posicional sobrevive). Quando só um lado
      // veio de partida real (o outro veio de BYE), sobra 1 id só, que
      // pertence sem ambiguidade a esse lado. Sem essa distinção posicional,
      // os dois lados de um confronto ainda pendente (nenhum BYE envolvido)
      // resolviam pro MESMO "Vencedor Jogo N" (o índice do primeiro id da
      // lista, buscado por inclusão) — uma dupla fantasma nos dois lados do
      // mesmo confronto.
      // Playthrough 5.27-M — "Vencedor Jogo N" passa a usar a numeração
      // GLOBAL da chave (quartas 1-4, semis 5-6, final 7 numa chave de 8),
      // a mesma do rótulo "Partida N" do card. Antes N era o índice dentro
      // da rodada anterior: a final mostrava "Vencedor Jogo 1 x Vencedor
      // Jogo 2" (as semis), lido no celular como os jogos 1 e 2 das quartas
      // — e o campeão real parecia não pertencer à árvore sorteada. Sem
      // source_match_ids (saves antigos), o alimentador é o posicional
      // (2·índice e 2·índice+1), que é o desenho da chave do jogador.
      const resolveSide = (rawName, rawSourceIds, isSideA, matchIndex) => {
        if (roundIndex === 0) return rawName || 'Participante a definir';
        if (rawName && previousRoundByes.has(rawName)) return rawName; // BYE: fato desde o sorteio, não desde a data da rodada.
        if (rawName && previousRoundDateReached) return rawName;
        const feederId = rawSourceIds.length === 2 ? rawSourceIds[isSideA ? 0 : 1] : (rawSourceIds[0] ?? null);
        const feederIndex = feederId != null ? previousRoundMatchIndexById.get(feederId) : undefined;
        const localNumber = Number.isInteger(feederIndex) ? feederIndex + 1 : (matchIndex * 2) + (isSideA ? 1 : 2);
        return placeholder(previousRoundOffset + localNumber);
      };
      matches = rawMatches.map((rawMatch, matchIndex) => {
        const rawTeamA = rawTeam(rawMatch, 'a');
        const rawTeamB = rawTeam(rawMatch, 'b');
        const rawSourceIds = Array.isArray(rawMatch.source_match_ids) ? rawMatch.source_match_ids.filter(Boolean) : [];
        const teamA = resolveSide(rawTeamA, rawSourceIds, true, matchIndex);
        const teamB = resolveSide(rawTeamB, rawSourceIds, false, matchIndex);
        const candidate = { ...rawMatch, team_a: teamA, team_b: teamB };
        const entrantsResolved = !isPlaceholder(teamA) && !isPlaceholder(teamB)
          && teamA !== 'Participante a definir' && teamB !== 'Participante a definir';
        const terminal = entrantsResolved
          && isTerminalBracketResult(candidate, rawRound, careerDate, completed)
          && [teamA, teamB].includes(teamName(rawMatch.winner));
        return {
          ...candidate,
          match_number: roundOffset + matchIndex + 1,
          date: rawMatch.date || rawRound.date || null,
          status: terminal ? 'completed' : 'scheduled',
          winner: terminal ? teamName(rawMatch.winner) : null,
          score: terminal ? rawMatch.score || null : null,
          eliminated: terminal ? rawMatch.eliminated || null : null,
          champion: terminal ? rawMatch.champion || null : null,
          terminal,
        };
      });
    } else {
      const structurallyLinked = Boolean(previous && previous.matches.length === rawMatches.length * 2);
      matches = rawMatches.map((rawMatch, matchIndex) => {
        let teamA = rawTeam(rawMatch, 'a');
        let teamB = rawTeam(rawMatch, 'b');

        if (roundIndex > 0 && structurallyLinked) {
          teamA = previous.matches[matchIndex * 2]?.winner || placeholder((matchIndex * 2) + 1);
          teamB = previous.matches[(matchIndex * 2) + 1]?.winner || placeholder((matchIndex * 2) + 2);
        } else if (roundIndex > 0 && previous) {
          // tournament_run registra apenas o caminho da dupla do jogador. Nesse
          // formato 1→1, o próximo confronto só passa a existir quando a vitória
          // anterior é terminal; o rival pré-gerado fica oculto até a data real.
          const previousWinner = previous.matches.find((match) => match.winner)?.winner || null;
          const reached = matchHasReachedCareerDate(rawMatch, rawRound, careerDate);
          const currentRoundIsReal = Boolean(previousWinner && reached);
          teamA = previousWinner || placeholder(1);
          teamB = currentRoundIsReal ? rawTeam(rawMatch, 'b') : placeholder(2);
        }

        teamA ||= roundIndex === 0 ? 'Participante a definir' : placeholder((matchIndex * 2) + 1);
        teamB ||= roundIndex === 0 ? 'Participante a definir' : placeholder((matchIndex * 2) + 2);

        const candidate = { ...rawMatch, team_a: teamA, team_b: teamB };
        const entrantsResolved = !isPlaceholder(teamA) && !isPlaceholder(teamB)
          && teamA !== 'Participante a definir' && teamB !== 'Participante a definir';
        const terminal = entrantsResolved
          && isTerminalBracketResult(candidate, rawRound, careerDate, completed)
          && [teamA, teamB].includes(teamName(rawMatch.winner));
        return {
          ...candidate,
          date: rawMatch.date || rawRound.date || null,
          status: terminal ? 'completed' : 'scheduled',
          winner: terminal ? teamName(rawMatch.winner) : null,
          score: terminal ? rawMatch.score || null : null,
          eliminated: terminal ? rawMatch.eliminated || null : null,
          champion: terminal ? rawMatch.champion || null : null,
          terminal,
        };
      });
    }

    rounds.push({
      ...rawRound,
      round: rawRound.round || rawRound.label || `Rodada ${roundIndex + 1}`,
      status: matches.length > 0 && matches.every((match) => match.terminal) ? 'completed' : 'scheduled',
      matches,
    });
  }

  const lastRound = rounds[rounds.length - 1] || null;
  const finalMatch = lastRound?.matches?.[0] || null;
  // Playthrough 4, itens 1 e 2: a última rodada PRESENTE na chave nem sempre
  // é a final do torneio. Desde que buildTournamentBracketHistory trunca a
  // campanha na eliminação, ela costuma ser a rodada em que o jogador caiu —
  // e tratar o vencedor dela como campeão coroaria o algoz do jogador. Só a
  // rodada marcada `is_final` decide o título; históricos legados (e a
  // reconstrução de TournamentBracket.jsx) não têm a flag e mantêm o
  // comportamento anterior.
  const lastRoundIsFinal = lastRound ? lastRound.is_final !== false : false;
  const bracketChampion = completed && lastRoundIsFinal && finalMatch?.terminal ? finalMatch.winner : null;
  // Quando a chave não decide o título, o campeão gravado no Tournament é a
  // única fonte. Era esse buraco que fazia a aba da chave dizer "sem campeão"
  // enquanto o Jornal e o Race exibiam um.
  const champion = bracketChampion || (completed ? teamName(tournament?.champion) : null);
  const firstIncomplete = rounds.findIndex((round) => round.matches.some((match) => !match.terminal));
  const focusRoundIndex = firstIncomplete >= 0 ? firstIncomplete : Math.max(0, rounds.length - 1);
  return { drawn: true, completed, cancelled, rounds, champion, focusRoundIndex };
}

export function sanitizeBracketHistory(tournament, careerDate) {
  return getVisibleTournamentBracketState(tournament, careerDate).rounds;
}

export function describeBracketEntry(name, byeNames = []) {
  const raw = String(name ?? '').trim();
  const byeSet = new Set(
    Array.isArray(byeNames)
      ? byeNames
      : (byeNames && typeof byeNames.forEach === 'function' ? [...byeNames] : [])
  );

  if (!raw || raw === 'Participante a definir') {
    return { kind: 'absent', badge: 'A definir', displayName: 'Participante a definir' };
  }

  if (/^Vencedor Jogo \d+$/.test(raw)) {
    return { kind: 'unresolved', badge: 'A definir', displayName: raw };
  }

  if (byeSet.has(raw)) {
    return { kind: 'bye', badge: 'BYE', displayName: raw };
  }

  return { kind: 'entrant', badge: null, displayName: raw };
}

export function visibleTournamentChampion(tournament, careerDate) {
  return getVisibleTournamentBracketState(tournament, careerDate).champion;
}

// Playthrough 4.6C, item 9 — várias telas (notificação, card da lista,
// botão "Ver chave", TournamentBracket, diagnósticos) inferiam "a chave
// existe?"/"o torneio acabou?" cada uma à sua maneira: uma olhava
// bracket_history.length, outra tournament.status, outra só a data
// (start_date < careerDate — o bug do item 8, "Encerrado" aparecendo sem
// nenhum settlement ter rodado). `Tournament.status` também não é
// confiável sozinho: a trilha do JOGADOR (createDrawnRun, tournamentDraw.js)
// nunca atualizava esse campo (ficava em 'inscricoes' para sempre, mesmo
// com a chave já persistida) — só a trilha AI-only (ensureWorldTourDraws)
// grava 'chaveamento'/'em_andamento'/'finalizado' corretamente. Esta função
// é a ÚNICA fonte de verdade sobre o estado do SORTEIO/lifecycle, baseada
// exclusivamente em bracket_schema_version/bracket_history (o dado que as
// DUAS trilhas sempre gravam) mais datas — nunca em `status`, que pode
// divergir entre as duas origens.
export const TOURNAMENT_DRAW_STATES = Object.freeze({
  NOT_DUE: 'NOT_DUE',
  PENDING: 'PENDING',
  DRAWN: 'DRAWN',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  INVALID: 'INVALID',
});

// Playthrough 5.16, Partes K/L/M — autoridade ÚNICA para "existe chave para
// ver?".
//
// Problema do playtest: o modal de detalhes mostrava "Ver chave"
// incondicionalmente (nenhuma checagem de estado), inclusive a ~8 dias do
// sorteio. O jogador clicava e recebia "Chave ainda não sorteada" — um CTA
// que promete algo que ainda não existe.
//
// A regra da Parte L é a mesma que `ensureTournamentDrawNotification` já
// usava para decidir se havia sorteio: `bracket_schema_version >= 2` com
// `bracket_history` não vazio. Aqui isso é lido através de
// `getTournamentDrawState`, que já codifica exatamente esse predicado — a
// chave é visível nos três estados em que ela comprovadamente existe.
export function hasViewableTournamentBracket(tournament, careerDate) {
  return [
    TOURNAMENT_DRAW_STATES.DRAWN,
    TOURNAMENT_DRAW_STATES.IN_PROGRESS,
    TOURNAMENT_DRAW_STATES.COMPLETED,
  ].includes(getTournamentDrawState(tournament, careerDate));
}

// Texto que SUBSTITUI o botão enquanto a chave não existe (Parte L): o
// jogador continua informado sobre quando o sorteio acontece, sem receber um
// CTA que não leva a lugar nenhum.
//
// `leadDays` é parâmetro em vez de import porque este módulo é puro (nenhum
// import) de propósito — `TOURNAMENT_DRAW_LEAD_DAYS` mora em
// tournamentDraw.js, que arrasta localGame/teamRanking junto. Quem chama
// passa a constante canônica; o default só existe pra não quebrar leitura.
export function getTournamentDrawCountdownLabel(tournament, careerDate, leadDays = 3) {
  if (!tournament?.start_date || !careerDate) return null;
  if (isTournamentCancelled(tournament)) return null;
  const start = new Date(`${String(tournament.start_date).slice(0, 10)}T00:00:00`);
  const today = new Date(`${String(careerDate).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) return null;
  const drawDay = new Date(start.getTime());
  drawDay.setDate(drawDay.getDate() - (Number(leadDays) || 0));
  const days = Math.round((drawDay - today) / 86400000);
  if (days > 1) return `Sorteio em ${days} dias`;
  if (days === 1) return 'Sorteio amanhã';
  if (days === 0) return 'Sorteio hoje';
  return 'Aguardando sorteio';
}

export function getTournamentDrawState(tournament, careerDate) {
  if (!tournament?.id) return TOURNAMENT_DRAW_STATES.INVALID;
  if (isTournamentCancelled(tournament)) return TOURNAMENT_DRAW_STATES.CANCELLED;

  const hasDraw = Number(tournament.bracket_schema_version) >= 2
    && Array.isArray(tournament.bracket_history) && tournament.bracket_history.length > 0;
  const start = normalizeDate(tournament.start_date);
  const today = normalizeDate(careerDate);

  if (isTournamentCompletedAt(tournament, careerDate) && Boolean(tournament.champion)) {
    return TOURNAMENT_DRAW_STATES.COMPLETED;
  }
  if (!hasDraw) {
    // Item 5 — chegou ao início (ou passou) sem chave nenhuma: pendência
    // factual, nunca um limbo silencioso (ensureWorldTourDraws já cobre o
    // cancelamento explícito quando isso persiste até o próprio início).
    if (start && today && start <= today) return TOURNAMENT_DRAW_STATES.PENDING;
    return TOURNAMENT_DRAW_STATES.NOT_DUE;
  }
  // hasDraw === true a partir daqui.
  if (start && today && today < start) return TOURNAMENT_DRAW_STATES.DRAWN;
  // Chave existe e a janela do torneio já começou (ou terminou) sem
  // settlement completo ainda — item 8: nunca reportar isso como
  // "encerrado"/finalizado, é uma campanha em curso ou aguardando resolução.
  return TOURNAMENT_DRAW_STATES.IN_PROGRESS;
}

// Playthrough 4.6E, Parte F — helper PURO (nenhuma leitura de storage, nenhum
// I/O, nunca recalcula adversário via tournamentDraw.js) para montar o
// conteúdo rico da notificação de sorteio a partir só do que já está
// persistido: o match do round 0 marcado `player_match:true` em
// bracket_history (fonte canônica do NOME das duplas/match_id/rodada/data —
// buildPlayerTournamentBracket, tournamentSettlement.js) cruzado com
// `run.matches[0]` (tournament_run — única fonte dos IDs reais dos membros
// do adversário, nunca presentes em bracket_history). Devolve `null` se a
// chave/run ainda não tiverem o match de estreia — nunca inventa um valor.
//
// Playthrough 4.9, Parte A/F — bug real de produção (QA): jogador NÃO
// inscrito em "Los Angeles Cup" recebeu "Sorteio definido... Sua dupla,
// Franco López & Pablo López" — uma dupla de IA qualquer. Causa raiz exata:
// esta função tinha `|| matches[0]` como fallback quando nenhum match do
// round 0 tinha `player_match===true` (torneio AI-only nunca marca nenhum
// match assim — só buildPlayerTournamentBracket, chamado exclusivamente
// para uma campanha REALMENTE registrada, grava esse marcador). Sem
// registro, `matches.find(...)` retorna undefined e o fallback pegava a
// PRIMEIRA partida da chave alheia, tratando-a como se fosse a do jogador.
// `run` (tournament_run) só existe quando `ensureTournamentDraw`
// (tournamentDraw.js) já confirmou `calendarEvent.metadata.registration_id`
// — ou seja, `run` não-nulo já É a prova por ID de que existe uma inscrição
// real por trás. Exigir os dois fatos (run presente E player_match===true,
// nunca um substituto textual) é o que impede fabricar um adversário: sem
// os dois, retorna `null` — nunca `matches[0]`.
export function getPlayerOpeningMatchFromCanonicalBracket({ tournament, run }) {
  if (!run || !Array.isArray(run.matches) || !run.matches.length) return null;
  const history = Array.isArray(tournament?.bracket_history) ? tournament.bracket_history : [];
  const round0 = history[0];
  const matches = Array.isArray(round0?.matches) ? round0.matches : [];
  if (!round0 || !matches.length) return null;
  const playerMatch = matches.find((match) => match?.player_match === true);
  if (!playerMatch) return null;

  const runMatch = Array.isArray(run?.matches) ? run.matches[0] : null;
  const opponentMembers = Array.isArray(runMatch?.opponent) ? runMatch.opponent.filter(Boolean) : [];
  const opponentNameFromRun = opponentMembers.map((member) => member?.name).filter(Boolean).join(' & ') || null;

  const teamA = rawTeam(playerMatch, 'a');
  const teamB = rawTeam(playerMatch, 'b');
  // A dupla do jogador é sempre gravada em team_a por construção
  // (buildPlayerTournamentBracket) — mas se o nome do adversário conhecido
  // pelo tournament_run bater com team_a em vez de team_b (chave legada ou
  // ordem diferente), o cruzamento por nome corrige em vez de assumir.
  const playerIsTeamA = opponentNameFromRun ? teamB === opponentNameFromRun : true;
  const playerTeam = playerIsTeamA ? teamA : teamB;
  const opponentTeam = playerIsTeamA ? teamB : teamA;

  return {
    matchId: playerMatch.match_id || runMatch?.id || null,
    roundIndex: 0,
    roundLabel: round0.round || round0.label || null,
    matchDate: playerMatch.date || round0.date || runMatch?.date || null,
    playerTeam,
    opponentTeam,
    opponentMemberIds: opponentMembers.map((member) => member?.id).filter(Boolean),
  };
}
