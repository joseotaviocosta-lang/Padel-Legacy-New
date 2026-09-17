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

export function buildCanonicalTournamentBracket({ tournamentId, participants = [], date = null } = {}) {
  const entrants = participants.map(asTeam).filter((team) => team.name);
  if (entrants.length < 2) throw new Error('Uma chave precisa de pelo menos duas duplas.');

  let current = entrants.map((team, index) => ({ ...team, seed: index }));
  const rounds = [];
  const eliminated = [];
  let roundIndex = 0;

  while (current.length > 1) {
    const next = [];
    const matches = [];
    for (let index = 0; index < current.length; index += 2) {
      const teamA = current[index];
      const teamB = current[index + 1];
      if (!teamB) {
        next.push(teamA);
        continue;
      }
      const [winner, loser] = chooseWinner(teamA, teamB, `${tournamentId}:${roundIndex}:${index / 2}`);
      matches.push({
        match_id: `${tournamentId || 'tournament'}:r${roundIndex}:m${index / 2}`,
        date,
        status: 'completed',
        team_a: teamA.name,
        team_b: teamB.name,
        winner: winner.name,
        score: scoreFor(`${tournamentId}:${roundIndex}:${index / 2}`, winner === teamA),
      });
      next.push(winner);
      eliminated.push({ team: loser.name, roundIndex });
    }
    rounds.push({ round: roundLabel(current.length), date, status: 'completed', is_final: next.length === 1, matches });
    current = next;
    roundIndex += 1;
  }

  const champion = current[0].name;
  const runnerUp = eliminated.find((entry) => entry.roundIndex === rounds.length - 1)?.team || null;
  const finishOrder = [champion, runnerUp, ...eliminated.filter((entry) => entry.team !== runnerUp).map((entry) => entry.team).reverse()];
  const placements = finishOrder.map((team, index) => ({ position: index + 1, team, finish: placementLabel(index, entrants.length) }));
  return { bracket_history: rounds, champion, runner_up: runnerUp, placements, participants: entrants.map((team) => team.name) };
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

export function buildPlayerTournamentBracket({
  tournamentId,
  date = null,
  playerTeamName,
  mainOpponents = [],
  fillerFactory = () => [],
} = {}) {
  const roundCount = mainOpponents.length;
  if (roundCount < 1) throw new Error('A chave do jogador precisa de ao menos uma rodada.');
  const drawSize = 2 ** roundCount;
  const roundsMatches = Array.from({ length: roundCount }, () => []);

  roundsMatches[0].push({
    match_id: `${tournamentId || 'tournament'}:player:r0`,
    date,
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
    const subtree = buildCanonicalTournamentBracket({ tournamentId: `${tournamentId || 'tournament'}:opp${k}`, participants: entrants, date });
    subtree.bracket_history.forEach((round, localRoundIndex) => {
      roundsMatches[localRoundIndex].push(...round.matches.map((match) => ({ ...match, player_match: false })));
    });
  }

  for (let r = 1; r < roundCount; r += 1) {
    roundsMatches[r].unshift({
      match_id: `${tournamentId || 'tournament'}:player:r${r}`,
      date,
      status: 'scheduled',
      team_a: null,
      team_b: null,
      winner: null,
      score: null,
      player_match: true,
    });
  }

  return roundsMatches.map((matches, roundIndex) => ({
    round: roundLabel(drawSize / (2 ** roundIndex)),
    date,
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

  match.team_a = playerTeamName;
  match.team_b = opponentTeamName || match.team_b || 'Adversário a definir';
  match.winner = won ? playerTeamName : match.team_b;
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
