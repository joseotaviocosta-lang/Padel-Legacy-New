const TERMINAL_STATUSES = new Set(['finalizado', 'completed', 'finished', 'champion']);

function hash(value) {
  let result = 2166136261;
  for (const character of String(value || '')) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function asTeam(value) {
  if (typeof value === 'string') return { name: value, strength: 0 };
  if (Array.isArray(value)) return { name: value.filter(Boolean).join(' & '), strength: 0 };
  return {
    ...value,
    name: value?.name || value?.team_name || value?.id || 'Dupla não identificada',
    strength: Number(value?.strength || value?.score || 0),
  };
}

function scoreFor(seed, winnerIsA) {
  const close = hash(seed) % 3 === 0;
  return winnerIsA
    ? (close ? '6-4 4-6 6-3' : '6-3 6-4')
    : (close ? '4-6 6-4 3-6' : '3-6 4-6');
}

function chooseWinner(teamA, teamB, seed) {
  if (teamA.strength !== teamB.strength) return teamA.strength > teamB.strength ? [teamA, teamB] : [teamB, teamA];
  return hash(seed) % 2 === 0 ? [teamA, teamB] : [teamB, teamA];
}

function roundLabel(size) {
  if (size === 2) return 'Final';
  if (size === 4) return 'Semifinais';
  if (size === 8) return 'Quartas de final';
  return `Rodada de ${size}`;
}

function placementLabel(index, total) {
  if (index === 0) return 'champion';
  if (index === 1) return 'runner_up';
  const depth = Math.floor(Math.log2(index)) + 1;
  const rounds = Math.ceil(Math.log2(Math.max(2, total)));
  if (depth === rounds) return 'first_round';
  if (depth === rounds - 1) return 'quarterfinal';
  if (depth === rounds - 2) return 'semifinal';
  return 'participant';
}

export function normalizeTournamentTeam(value) {
  return asTeam(value).name;
}

// ═══════════════════════════════════════════════════════════════════════
// Playthrough 4.6 — SEEDING ESPORTIVO (item 1-5, 8, 16)
// ═══════════════════════════════════════════════════════════════════════
//
// Causa exata do bug relatado ("#1 vs #2 já na 1ª rodada de Doha"): a
// versão anterior de buildCanonicalTournamentBracket recebia `participants`
// JÁ ordenado por força (o chamador, ensureWorldTourDraws, ordena por
// pairScore antes de truncar pro drawSize) e pareava SEQUENCIALMENTE
// (`pairPool[index]` vs `pairPool[index+1]`) — índice 0 (mais forte) contra
// índice 1 (2º mais forte) na primeira rodada, sempre. Não existia seed,
// não existia slot protegido, não existia serpentine — a ordenação por
// força virava diretamente a ordem de confronto, o oposto de um chaveamento
// esportivo real.
//
// Correção: separar SEED (posição no chaveamento) de ORDEM DE FORÇA
// (quem entra). `seedOrder(bracketSize)` é o algoritmo clássico de
// posicionamento de cabeças de chave — cada seed `k` sempre encontra seu
// "espelho" `bracketSize+1-k` na primeira rodada; por construção, seed 1 e
// seed 2 só podem se encontrar na final (estão em metades opostas), e
// seeds 1-4 só a partir da semifinal (estão em quartos distintos). A MESMA
// função resolve byes de graça: quando o campo real é menor que
// `bracketSize` (Madri: 24 duplas em estrutura de 32), os "espelhos"
// ausentes (seeds 25-32) caem exatamente nos 8 cabeças de chave — byes vão
// pros top seeds sem nenhum caso especial.
function seedOrder(bracketSize) {
  let order = [1];
  while (order.length < bracketSize) {
    const size = order.length * 2;
    const next = [];
    for (const seedNumber of order) {
      next.push(seedNumber);
      next.push(size + 1 - seedNumber);
    }
    order = next;
  }
  return order;
}

// Item 2 — número de cabeças de chave por tamanho de campo. Escala com o
// draw (chaves maiores protegem mais gente), sem exigir réplica exata de
// ATP/FIP — só a lógica esportiva (poucos seeds em campos pequenos, mais
// em campos grandes, nunca mais da metade do campo).
export function seedCountForDrawSize(entrantCount) {
  const n = Math.max(2, Number(entrantCount) || 2);
  if (n <= 8) return 4;
  if (n <= 32) return 8;
  // Sem tier > 32 hoje, mas escala proporcionalmente se algum dia existir
  // (nunca mais que 1/4 do campo, arredondado pra potência de 2).
  return Math.min(32, 2 ** Math.floor(Math.log2(Math.max(8, n / 4))));
}

// Item 5 — embaralhamento determinístico dos NÃO-seeds (posições fora da
// proteção de seedCountForDrawSize): varia por torneio (a chave de Doha em
// abril não é a mesma "forma" da de maio), mas é 100% reproduzível pra o
// MESMO torneio (reload nunca gera um draw diferente) — nunca
// `Math.random()`. Reusa o MESMO `hash()` (FNV-1a) já usado por
// chooseWinner/scoreFor nesta função, mesma fonte de determinismo do
// arquivo inteiro, nenhuma dependência nova.
function deterministicShuffle(items, seedKey) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = hash(`${seedKey}:shuffle:${i}`) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Item 3 — helper PURO de posicionamento de cabeças de chave. Não resolve
// nenhuma partida, não sabe nada de rodada/data — só responde "quem ocupa
// cada slot do chaveamento". `entrants` chega em QUALQUER ordem; a função
// ordena por força internamente (rank 1 = mais forte) só para decidir
// seeding, nunca para decidir vencedor (isso continua em chooseWinner).
// Retorna `slots` (tamanho = próxima potência de 2 >= entrantCount): cada
// posição é o entrante real ou `null` (bye/fantasma). Consumida por
// buildCanonicalTournamentBracket; nunca duplicada em UI/componente.
export function buildSeededDrawSlots({ entrants = [], tournamentId = 'tournament', seedCount = null } = {}) {
  // Playthrough 5.16, Partes Y/Z — a ordem de cabeça de chave era decidida
  // SÓ por `strength` (pairScore: overall_rating + química + jitter). Isso é
  // a autoridade certa pra decidir QUEM VENCE um jogo, mas não pra decidir
  // quem é cabeça de chave: medido num mundo novo, duplas procedurais de
  // rank #131, #167, #277 e #292 apareciam seedadas ACIMA de duplas reais de
  // rank #8, #12, #16 e #21 — 16 inversões graves em 24 seeds de Masters.
  // É o "procedural como cabeça de chave" relatado no playtest.
  //
  // `seedRank` (quando fornecido) é a posição canônica de ranking da dupla,
  // menor = melhor — a MESMA autoridade que já governa elegibilidade e corte
  // de campo (pairEntryRank/getTierRankingFit), nunca origem real/procedural
  // (Parte AC). `strength` continua intacta e segue decidindo os resultados.
  // Sem `seedRank` em ninguém, o comportamento é exatamente o de antes.
  const hasSeedRank = entrants.some((entrant) => Number(entrant?.seedRank) > 0);
  const seedRankOf = (entrant) => {
    const value = Number(entrant?.seedRank);
    return Number.isFinite(value) && value > 0 ? value : Number.POSITIVE_INFINITY;
  };
  const ranked = [...entrants]
    .map((entrant, index) => ({ entrant, index }))
    .sort((a, b) => (
      (hasSeedRank ? seedRankOf(a.entrant) - seedRankOf(b.entrant) : 0)
      || (b.entrant.strength - a.entrant.strength)
      || a.entrant.name.localeCompare(b.entrant.name)
      || (a.index - b.index)
    ))
    .map(({ entrant }) => entrant);
  const entrantCount = ranked.length;
  if (entrantCount < 2) return { slots: ranked, bracketSize: entrantCount, seedCount: 0, ranked };
  const bracketSize = 2 ** Math.ceil(Math.log2(entrantCount));
  // Playthrough 5.17, Parte L — a proteção estrutural tem de cobrir TODOS os
  // byes.
  //
  // Medido numa temporada: Auckland Elite Open, campo de 20 numa chave de 32
  // = 12 byes, mas `seedCountForDrawSize(20)` protege só 8. Como o bye cai
  // no espelho dos 12 primeiros números de seed, os 4 excedentes caíam sobre
  // posições EMBARALHADAS — resultado: bye para a dupla #183 enquanto a #9
  // disputava a rodada preliminar.
  //
  // Se a chave concede N folgas, as N melhores duplas são as que folgam. O
  // piso de seeds passa a ser o número de byes; nada além disso muda (em
  // chaves potência-de-2 não há bye e o valor original prevalece).
  const byeCount = Math.max(0, bracketSize - entrantCount);
  const numSeeds = Math.min(
    Math.max(seedCount ?? seedCountForDrawSize(entrantCount), byeCount),
    entrantCount,
  );

  // Ranks 1..numSeeds são cabeças de chave PROTEGIDAS — vão direto pro seu
  // número de seed (a mesma ordem de força, sem embaralhar). Ranks
  // numSeeds+1..entrantCount ("não-seeds", mas ainda entrantes reais) são
  // embaralhados deterministicamente entre si (item 5) antes de preencher
  // os seed-slots restantes — a chave real varia entre torneios sem deixar
  // de ser 100% reproduzível pro mesmo torneio.
  const unseededRanks = [];
  for (let seedNumber = numSeeds + 1; seedNumber <= entrantCount; seedNumber += 1) unseededRanks.push(seedNumber);
  const shuffledUnseeded = deterministicShuffle(unseededRanks, tournamentId);

  const entrantBySeedNumber = new Map();
  for (let seedNumber = 1; seedNumber <= numSeeds; seedNumber += 1) entrantBySeedNumber.set(seedNumber, ranked[seedNumber - 1]);
  unseededRanks.forEach((seedNumber, shuffleIndex) => {
    const shuffledRank = shuffledUnseeded[shuffleIndex];
    entrantBySeedNumber.set(seedNumber, ranked[shuffledRank - 1]);
  });

  const order = seedOrder(bracketSize);
  // Item 4 — byes: quando o "espelho" de um seed não existe no campo real
  // (seedNumber > entrantCount), o slot fica vazio (fantasma). Como o
  // algoritmo de seedOrder sempre casa o seed k com bracketSize+1-k na
  // rodada 0, e só os `bracketSize - entrantCount` seeds MAIS ALTOS
  // (numericamente, ou seja, os PIORES) ficam de fora do campo real, os
  // fantasmas caem exatamente nos espelhos dos MELHORES seeds — byes vão
  // pros cabeças de chave sem nenhum caso especial escrito aqui.
  const slots = order.map((seedNumber) => (seedNumber <= entrantCount ? entrantBySeedNumber.get(seedNumber) : null));
  return { slots, bracketSize, seedCount: numSeeds, ranked };
}

// Item 2 (cronologia por rodada) — `roundDates[roundIndex]` dá a cada rodada
// sua própria data de calendário, em vez de todas compartilharem o único
// `date` do sorteio (o bug que fazia a chave inteira de Madri/Doha aparecer
// "completed" desde o D-3: `getVisibleTournamentBracketState`, que já
// existia para ocultar rodadas futuras, comparava `careerDate` contra essa
// MESMA data em toda rodada — nunca havia rodada "futura" de verdade). Sem
// `roundDates`, mantém o comportamento anterior (mesmo `date` em tudo) —
// obrigatório para os únicos dois chamadores retroativos (settlement depois
// do end_date já passado, e os testes headless existentes), onde todas as
// rodadas já pertencem ao passado de qualquer forma.
// Itens 3/4/5/6/7 (Playthrough 4.5B) — campo não-potência-de-2 (Madri: 23/24
// duplas). Cada entrante que avança carrega `sourceMatchId`: null pro
// sorteio original (rodada 0, sempre conhecido), ou o match_id real cujo
// vencedor o produziu — nunca inferido depois por posição/índice
// (`getVisibleTournamentBracketState` fazia exatamente isso, e quebrava
// sempre que uma rodada não era o dobro exato da anterior — todo bye).
// Cada match persiste `source_match_ids` (0, 1 ou 2 ids) — o grafo
// estrutural fica explícito no próprio dado, auditável por
// `validateCanonicalBracketGraph`, sem reconstrução frágil na leitura.
//
// Playthrough 4.6, itens 1/3/4/7 — a rodada 0 agora vem de
// `buildSeededDrawSlots`: byes e cabeças de chave protegidas são decididos
// UMA VEZ, no posicionamento inicial (slots), nunca mais recalculados
// rodada a rodada. Isso substitui a política antiga desta função ("o
// melhor remanescente ganha bye em toda rodada ímpar", que produzia bye
// tardio — ex. "Rodada de 3" — sem NENHUMA proteção de seed nas rodadas
// anteriores). Com slots pré-computados, byes só existem na rodada 0 (a
// única onde o campo pode não ser potência de 2); da rodada 1 em diante o
// número de sobreviventes já é potência de 2 por construção, eliminação
// simples padrão, sem caso especial.
export function buildCanonicalTournamentBracket({ tournamentId, participants = [], date = null, roundDates = null, seedCount = null } = {}) {
  const entrants = participants.map(asTeam).filter((team) => team.name);
  if (entrants.length < 2) throw new Error('Uma chave precisa de pelo menos duas duplas.');

  const { slots } = buildSeededDrawSlots({ entrants, tournamentId, seedCount });
  const rounds = [];
  const eliminated = [];
  let roundIndex = 0;
  let current;

  // Rodada 0 — a partir dos slots seedados (byes já resolvidos pelo
  // posicionamento, nunca por índice/força dinâmica).
  {
    const next = [];
    const matches = [];
    const byes = [];
    const roundDate = Array.isArray(roundDates) ? (roundDates[0] ?? date) : date;
    for (let index = 0; index < slots.length; index += 2) {
      const teamA = slots[index] ? { ...slots[index], sourceMatchId: null } : null;
      const teamB = slots[index + 1] ? { ...slots[index + 1], sourceMatchId: null } : null;
      if (!teamA && !teamB) continue; // par de fantasmas — impossível por construção, defensivo.
      if (!teamB) { next.push(teamA); byes.push(teamA.name); continue; }
      if (!teamA) { next.push(teamB); byes.push(teamB.name); continue; }
      const matchId = `${tournamentId || 'tournament'}:r0:m${index / 2}`;
      const [winner, loser] = chooseWinner(teamA, teamB, `${tournamentId}:0:${index / 2}`);
      matches.push({
        match_id: matchId,
        source_match_ids: [],
        date: roundDate,
        status: 'completed',
        team_a: teamA.name,
        team_b: teamB.name,
        winner: winner.name,
        score: scoreFor(`${tournamentId}:0:${index / 2}`, winner === teamA),
      });
      next.push({ ...winner, sourceMatchId: matchId });
      eliminated.push({ team: loser.name, roundIndex: 0 });
    }
    rounds.push({
      // Rótulo pela contagem REAL de entrantes (item 6, Playthrough 4.5B:
      // "Rodada de 23", não "Rodada de 32") — `slots.length` é o tamanho do
      // esqueleto (potência de 2, com fantasmas), nunca o que aparece pro
      // jogador. Da rodada 1 em diante o esqueleto já é a contagem real.
      round: roundLabel(entrants.length), date: roundDate, status: 'completed',
      is_final: next.length === 1, matches, ...(byes.length ? { byes } : {}),
    });
    roundIndex = 1;
    current = next;
  }

  // Rodadas seguintes — potência de 2 garantida, eliminação simples padrão.
  while (current.length > 1) {
    const next = [];
    const matches = [];
    const roundDate = Array.isArray(roundDates) ? (roundDates[roundIndex] ?? date) : date;
    for (let index = 0; index < current.length; index += 2) {
      const teamA = current[index];
      const teamB = current[index + 1];
      const matchId = `${tournamentId || 'tournament'}:r${roundIndex}:m${index / 2}`;
      const [winner, loser] = chooseWinner(teamA, teamB, `${tournamentId}:${roundIndex}:${index / 2}`);
      matches.push({
        match_id: matchId,
        source_match_ids: [teamA.sourceMatchId, teamB.sourceMatchId].filter(Boolean),
        date: roundDate,
        status: 'completed',
        team_a: teamA.name,
        team_b: teamB.name,
        winner: winner.name,
        score: scoreFor(`${tournamentId}:${roundIndex}:${index / 2}`, winner === teamA),
      });
      next.push({ ...winner, sourceMatchId: matchId });
      eliminated.push({ team: loser.name, roundIndex });
    }
    rounds.push({ round: roundLabel(current.length), date: roundDate, status: 'completed', is_final: next.length === 1, matches });
    current = next;
    roundIndex += 1;
  }

  const champion = current[0].name;
  const runnerUp = eliminated.find((entry) => entry.roundIndex === rounds.length - 1)?.team || null;
  const finishOrder = [champion, runnerUp, ...eliminated.filter((entry) => entry.team !== runnerUp).map((entry) => entry.team).reverse()];
  const placements = finishOrder.map((team, index) => ({ position: index + 1, team, finish: placementLabel(index, entrants.length) }));
  return { bracket_history: rounds, champion, runner_up: runnerUp, placements, participants: entrants.map((team) => team.name) };
}

// Item 4 (Playthrough 4.5B) — validador PURO do grafo estrutural de uma
// chave canônica (bracket_schema_version 2). Não corrige nada, não esconde
// nada da UI — só aponta, com detalhe, onde a árvore está inconsistente.
// Usa exclusivamente match_id/source_match_ids (nunca índice/posição), a
// mesma fonte que buildCanonicalTournamentBracket grava — funciona para
// qualquer tamanho de campo, potência de 2 ou não (Madri: 23/24).
export function validateCanonicalBracketGraph(bracket) {
  const errors = [];
  const rounds = Array.isArray(bracket?.bracket_history)
    ? bracket.bracket_history
    : (Array.isArray(bracket) ? bracket : []);
  if (!rounds.length) return { valid: false, errors: ['bracket sem rodadas (bracket_history vazio)'] };

  const matchById = new Map();
  const destinationBySource = new Map();
  for (const round of rounds) {
    for (const match of round.matches || []) {
      if (!match?.match_id) { errors.push(`confronto sem match_id na rodada "${round.round}"`); continue; }
      if (matchById.has(match.match_id)) errors.push(`match_id duplicado: ${match.match_id}`);
      matchById.set(match.match_id, { match, round });
      const sources = Array.isArray(match.source_match_ids) ? match.source_match_ids : [];
      // Invariante 1 — no máximo 2 source matches por confronto.
      if (sources.length > 2) errors.push(`${match.match_id}: mais de 2 source_match_ids (${sources.join(', ')})`);
      for (const sourceId of sources) {
        // Invariantes 2/5 — um source match alimenta exatamente UM destino.
        const existingDestination = destinationBySource.get(sourceId);
        if (existingDestination && existingDestination !== match.match_id) {
          errors.push(`source match ${sourceId} alimenta dois destinos diferentes: ${existingDestination} e ${match.match_id}`);
        }
        destinationBySource.set(sourceId, match.match_id);
      }
    }
  }

  // Invariantes 3/4 — nenhuma dupla ocupa dois slots (partida OU bye) na
  // mesma rodada.
  for (const round of rounds) {
    const seenThisRound = new Set();
    const names = [
      ...(round.matches || []).flatMap((match) => [match.team_a, match.team_b]),
      ...(Array.isArray(round.byes) ? round.byes : []),
    ].filter(Boolean);
    for (const name of names) {
      if (seenThisRound.has(name)) errors.push(`"${name}" aparece mais de uma vez na rodada "${round.round}"`);
      seenThisRound.add(name);
    }
  }

  // O vencedor de cada source match precisa ser exatamente um dos dois
  // lados do destino que o referencia — prova de que a propagação de
  // vencedor foi para o slot certo, nunca sobrescrevendo outro confronto.
  for (const { match } of matchById.values()) {
    for (const sourceId of (match.source_match_ids || [])) {
      const source = matchById.get(sourceId);
      if (!source) { errors.push(`${match.match_id} referencia source_match_id inexistente: ${sourceId}`); continue; }
      if (source.match.winner && source.match.winner !== match.team_a && source.match.winner !== match.team_b) {
        errors.push(`vencedor de ${sourceId} ("${source.match.winner}") não aparece em ${match.match_id} (team_a="${match.team_a}", team_b="${match.team_b}")`);
      }
    }
  }

  // Invariantes 6/7/8 — final: exatamente 1 confronto, champion/runner_up
  // (quando informados) batem com vencedor/perdedor da final.
  const finalRound = rounds.find((round) => round.is_final === true) || rounds.at(-1);
  const finalMatches = finalRound?.matches || [];
  if (finalMatches.length !== 1) {
    errors.push(`rodada final deve ter exatamente 1 confronto (tem ${finalMatches.length})`);
  } else {
    const finalMatch = finalMatches[0];
    if (finalMatch.winner) {
      if (bracket?.champion && bracket.champion !== finalMatch.winner) {
        errors.push(`champion declarado ("${bracket.champion}") difere do vencedor da final ("${finalMatch.winner}")`);
      }
      const loser = finalMatch.team_a === finalMatch.winner ? finalMatch.team_b : finalMatch.team_a;
      if (bracket?.runner_up && bracket.runner_up !== loser) {
        errors.push(`runner_up declarado ("${bracket.runner_up}") difere do perdedor da final ("${loser}")`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function bracketFactsFromHistory(history = [], participants = []) {
  const rounds = Array.isArray(history) ? clone(history) : [];
  const finalRound = rounds.find((round) => round.is_final === true);
  if (rounds.some((round) => round.is_final === false) && !finalRound) return null;
  const final = finalRound?.matches?.[0] || rounds.at(-1)?.matches?.[0];
  if (!final?.winner || !final.team_a || !final.team_b) return null;
  const names = [...new Set([
    ...participants.map(normalizeTournamentTeam),
    ...rounds.flatMap((round) => (round.matches || []).flatMap((match) => [match.team_a, match.team_b])),
  ].filter(Boolean))];
  const finishOrder = [final.winner, final.team_a === final.winner ? final.team_b : final.team_a, ...names.filter((name) => ![final.winner, final.team_a, final.team_b].includes(name))];
  return {
    bracket_history: rounds,
    champion: final.winner,
    runner_up: final.team_a === final.winner ? final.team_b : final.team_a,
    placements: finishOrder.map((team, index) => ({ position: index + 1, team, finish: placementLabel(index, names.length) })),
    participants: names,
  };
}

// Playthrough 4.2 — chave COMPLETA para torneios com participação do
// jogador (item 1). Antes desta fase, a única chave persistida para um
// torneio do jogador era o caminho da própria dupla (uma partida por
// rodada, via TournamentRunManager.buildTournamentBracketHistory) —
// eliminado antes da final, o resto do quadro nunca existia em lugar
// nenhum. Esta função monta a chave inteira no sorteio: a partida do
// jogador em cada rodada (pendente, aguardando LiveMatch — nunca
// resolvida antecipadamente) mais, para cada rodada seguinte, a
// sub-chave que decide QUEM SERIA o adversário do jogador caso ele
// continue vencendo. Cada sub-chave é resolvida imediatamente pelo
// mesmo motor determinístico do AI-only (buildCanonicalTournamentBracket)
// — são confrontos que nunca envolvem o jogador, então não há partida
// futura do jogador sendo antecipada (proibição do item 3).
//
// Posicionamento: o adversário pré-gerado da rodada k (`mainOpponents[k]`)
// só é decidido por uma sub-chave quando k>=1 (a rodada 0 já é o confronto
// direto do jogador). A sub-chave da rodada k tem 2^k folhas: o próprio
// `mainOpponents[k]` (força artificialmente alta, sempre vence) mais
// (2^k - 1) duplas de preenchimento. Suas rodadas internas 0..k-1 mapeiam
// 1:1 nas rodadas GLOBAIS 0..k-1 — por isso a partida que decide o
// adversário da rodada k aparece sempre em `rounds[k-1].matches[1]`
// (a posição logo depois do confronto do jogador daquela rodada,
// independente do tamanho da chave — ver `nextDecidedOpponent`).
function forcedOpponentStrength() {
  return 1e6;
}

export function fillerTeamStrength(name) {
  return hash(`filler-strength:${name}`) % 1000;
}

// Item 2 — `roundDates[roundIndex]` (uma data real por rodada, tipicamente
// `addTournamentDays(startDate, roundIndex)`) substitui o único `date` do
// sorteio em toda rodada k e em toda sub-chave que decide o adversário
// pré-gerado de k. Sem `roundDates`, cai no `date` único (compatibilidade
// com chamadores que já resolveram tudo no passado).
export function buildPlayerTournamentBracket({
  tournamentId,
  date = null,
  roundDates = null,
  playerTeamName,
  mainOpponents = [],
  fillerFactory = () => [],
} = {}) {
  const roundCount = mainOpponents.length;
  if (roundCount < 1) throw new Error('A chave do jogador precisa de ao menos uma rodada.');
  const drawSize = 2 ** roundCount;
  const roundsMatches = Array.from({ length: roundCount }, () => []);
  const dateFor = (roundIndex) => (Array.isArray(roundDates) ? (roundDates[roundIndex] ?? date) : date);

  roundsMatches[0].push({
    match_id: `${tournamentId || 'tournament'}:player:r0`,
    date: dateFor(0),
    status: 'scheduled',
    team_a: playerTeamName,
    team_b: mainOpponents[0]?.name || 'Adversário a definir',
    winner: null,
    score: null,
    player_match: true,
  });

  for (let k = 1; k < roundCount; k += 1) {
    const size = 2 ** k;
    const fillerCount = size - 1;
    const fillers = (fillerFactory(fillerCount, k) || []).slice(0, fillerCount);
    const entrants = [
      { name: mainOpponents[k]?.name || `Dupla ${k}`, strength: forcedOpponentStrength() },
      ...fillers.map((filler) => ({ name: filler.name, strength: Number.isFinite(filler.strength) ? filler.strength : fillerTeamStrength(filler.name) })),
    ];
    // A sub-chave da rodada k tem rodadas internas 0..k-1, que mapeiam 1:1
    // nas rodadas GLOBAIS 0..k-1 (ver comentário acima da função) — recebe
    // exatamente essa fatia de `roundDates`, não a data da própria rodada k.
    const subtree = buildCanonicalTournamentBracket({
      tournamentId: `${tournamentId || 'tournament'}:opp${k}`,
      participants: entrants,
      date,
      roundDates: Array.isArray(roundDates) ? roundDates.slice(0, k) : null,
    });
    subtree.bracket_history.forEach((round, localRoundIndex) => {
      roundsMatches[localRoundIndex].push(...round.matches.map((match) => ({ ...match, player_match: false })));
    });
  }

  // Playthrough 5.27-M — o confronto da dupla do jogador nas rodadas >= 1
  // nascia SEM source_match_ids: o grafo não dizia de onde vinham os dois
  // lados, e a projeção da UI caía no rótulo fixo "Vencedor Jogo 1/2" (na
  // final, lido como os jogos 1 e 2 das quartas). Os dois alimentadores são
  // conhecidos desde o sorteio: a partida do jogador da rodada anterior
  // (lado A) e a final da sub-chave que decide o adversário (lado B), sempre
  // em `rounds[r-1].matches[1]` (ver `nextDecidedOpponent`).
  for (let r = 1; r < roundCount; r += 1) {
    const opponentFeeder = roundsMatches[r - 1][1]?.match_id || null;
    roundsMatches[r].unshift({
      match_id: `${tournamentId || 'tournament'}:player:r${r}`,
      date: dateFor(r),
      status: 'scheduled',
      team_a: null,
      team_b: null,
      winner: null,
      score: null,
      player_match: true,
      source_match_ids: [`${tournamentId || 'tournament'}:player:r${r - 1}`, opponentFeeder].filter(Boolean),
    });
  }

  return roundsMatches.map((matches, roundIndex) => ({
    round: roundLabel(drawSize / (2 ** roundIndex)),
    date: dateFor(roundIndex),
    status: matches.length > 0 && matches.every((match) => match.winner) ? 'completed' : 'scheduled',
    is_final: roundIndex === roundCount - 1,
    matches,
  }));
}

// A sub-chave que decide o adversário da rodada `roundIndex` sempre resolve
// na rodada global `roundIndex - 1`, na posição logo após o confronto do
// jogador daquela rodada (ver comentário de `buildPlayerTournamentBracket`).
function nextDecidedOpponent(rounds, roundIndex) {
  return rounds[roundIndex - 1]?.matches?.[1]?.winner || null;
}

// Playthrough 4.2, item 2/3/4 — uma partida real do jogador (vitória ou
// derrota) atualiza o confronto correspondente na chave canônica. Se o
// jogador perde, a campanha pessoal termina (item 4), mas a chave
// continua: o time que venceu (já nomeado — é o próprio adversário
// pré-gerado da rodada) segue disputando as rodadas seguintes contra os
// adversários já decididos pelas sub-chaves, pelo MESMO motor
// determinístico do AI-only, até a final.
export function applyPlayerMatchToCanonicalBracket(rounds, {
  roundIndex,
  playerTeamName,
  opponentTeamName,
  won,
  score = null,
  date = null,
} = {}) {
  if (!Array.isArray(rounds) || !rounds[roundIndex]?.matches?.[0]) {
    throw new Error('A chave canônica não possui o confronto do jogador para esta rodada.');
  }
  const next = clone(rounds);
  const match = next[roundIndex].matches[0];
  if (match.status === 'completed' && match.winner) return { rounds: next, idempotent: true };

  // Playthrough 5.27-M — IDENTIDADE CONGELADA NO SORTEIO. O nome da dupla do
  // jogador e o do adversário já estão gravados na chave (rodada 0 pelo
  // sorteio; rodadas seguintes pela propagação do vencedor). Antes, o nome
  // ATUAL (perfil renomeado, parceiro resolvido em outro formato) sobrescrevia
  // o lado gravado e a chave histórica mudava de composição depois do jogo.
  // O nome atual só preenche um lado que o sorteio deixou vazio (saves antigos).
  const frozenPlayerName = next[0]?.matches?.[0]?.team_a || playerTeamName;
  match.team_a = match.team_a || frozenPlayerName;
  match.team_b = match.team_b || opponentTeamName || 'Adversário a definir';
  match.winner = won ? match.team_a : match.team_b;
  match.score = score;
  match.status = 'completed';
  if (date) match.date = date;

  if (won) {
    if (roundIndex + 1 < next.length) {
      const nextMatch = next[roundIndex + 1].matches[0];
      nextMatch.team_a = match.winner;
      nextMatch.team_b = nextDecidedOpponent(next, roundIndex + 1);
    }
  } else {
    let carryTeam = match.winner;
    for (let r = roundIndex + 1; r < next.length; r += 1) {
      const opponentName = nextDecidedOpponent(next, r);
      if (!opponentName) break;
      const roundMatch = next[r].matches[0];
      roundMatch.team_a = carryTeam;
      roundMatch.team_b = opponentName;
      const seed = `${roundMatch.match_id}:cascade`;
      const [winnerTeam] = chooseWinner(
        { name: carryTeam, strength: fillerTeamStrength(carryTeam) },
        { name: opponentName, strength: fillerTeamStrength(opponentName) },
        seed,
      );
      roundMatch.winner = winnerTeam.name;
      roundMatch.score = scoreFor(seed, winnerTeam.name === carryTeam);
      roundMatch.status = 'completed';
      carryTeam = winnerTeam.name;
    }
  }

  next.forEach((round) => {
    round.status = round.matches.length > 0 && round.matches.every((item) => item.winner) ? 'completed' : 'scheduled';
  });

  return { rounds: next, idempotent: false };
}

// Playthrough 4.2, item 6 — deriva campeão/vice/colocações de uma chave
// COMPLETA (múltiplas partidas por rodada), generalizando o mesmo cálculo
// que `buildCanonicalTournamentBracket` já fazia para o AI-only (linhas
// acima) a partir de uma chave já persistida em vez de construída em
// memória. `bracketFactsFromHistory` continua existindo para saves
// antigos, cuja chave tem só a partida do jogador por rodada (item 9).
export function deriveTournamentFactsFromFullBracket(rounds = []) {
  if (!Array.isArray(rounds) || !rounds.length) return null;
  const entrantCount = (rounds[0]?.matches?.length || 0) * 2;
  if (entrantCount < 2) return null;
  const eliminated = [];
  for (const round of rounds) {
    for (const match of round.matches || []) {
      if (!match.winner || !match.team_a || !match.team_b) return null;
      eliminated.push({ team: match.winner === match.team_a ? match.team_b : match.team_a });
    }
  }
  const finalMatch = rounds.at(-1)?.matches?.[0];
  if (!finalMatch?.winner) return null;
  const champion = finalMatch.winner;
  const runnerUp = finalMatch.team_a === champion ? finalMatch.team_b : finalMatch.team_a;
  const finishOrder = [champion, runnerUp, ...eliminated.filter((entry) => entry.team !== runnerUp).map((entry) => entry.team).reverse()];
  const placements = finishOrder.map((team, index) => ({ position: index + 1, team, finish: placementLabel(index, entrantCount) }));
  return {
    bracket_history: clone(rounds),
    champion,
    runner_up: runnerUp,
    placements,
    participants: [...new Set(rounds.flatMap((round) => (round.matches || []).flatMap((match) => [match.team_a, match.team_b])))].filter(Boolean),
  };
}

export function finalizeTournamentFromBracket({ tournament, bracket, date = null } = {}) {
  if (!tournament?.id || !bracket?.champion || !bracket?.runner_up) throw new Error('Fatos insuficientes para finalizar o torneio.');
  const settlementId = `${tournament.id}:canonical-settlement`;
  if (tournament.canonical_settlement_id === settlementId || tournament.world_tour_resolved || TERMINAL_STATUSES.has(tournament.status) && tournament.champion) {
    return { idempotent: true, settlementId, patch: {}, result: tournament };
  }
  const patch = {
    status: 'finalizado',
    current_phase: 'concluido',
    world_tour_resolved: true,
    canonical_settlement_id: settlementId,
    resolved_at: date,
    champion: bracket.champion,
    runner_up: bracket.runner_up,
    participants: bracket.participants,
    bracket_history: clone(bracket.bracket_history),
    placements: clone(bracket.placements),
  };
  return { idempotent: false, settlementId, patch, result: { ...tournament, ...patch } };
}
