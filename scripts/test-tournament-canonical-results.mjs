import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildCanonicalTournamentBracket, bracketFactsFromHistory, finalizeTournamentFromBracket,
  buildPlayerTournamentBracket, applyPlayerMatchToCanonicalBracket, deriveTournamentFactsFromFullBracket,
} from '../src/gameplay/worldTour/tournamentSettlement.js';
import { getRoundOutcomeTable, getTournamentTierConfig } from '../src/lib/circuitCatalog.js';

const teams = Array.from({ length: 8 }, (_, index) => ({ name: `Dupla ${index + 1}`, strength: 100 - index }));
const tournament = { id: 'canonical-test', name: 'Canonical Test', tier: 'Bronze', world_tour_event: true };
const bracket = buildCanonicalTournamentBracket({ tournamentId: tournament.id, participants: teams, date: '2026-01-04' });

assert.equal(bracket.bracket_history.length, 3, 'AI-only deve persistir todas as rodadas');
assert.equal(bracket.bracket_history.at(-1).matches[0].winner, bracket.champion, 'campeão deve ser o vencedor da final');
assert.equal(bracket.placements.length, teams.length, 'todos os participantes devem ter colocação');

const first = finalizeTournamentFromBracket({ tournament, bracket, date: '2026-01-04' });
const second = finalizeTournamentFromBracket({ tournament: { ...tournament, ...first.patch }, bracket, date: '2026-01-04' });
assert.equal(first.result.champion, bracket.champion, 'settlement usa o campeão da chave');
assert.equal(second.idempotent, true, 'segunda finalização deve ser no-op');
assert.deepEqual(second.patch, {}, 'segunda finalização não deve gerar alterações');
assert.equal(first.settlementId, 'canonical-test:canonical-settlement', 'idempotência deve ser por Tournament');

const playerFinal = bracket.bracket_history.at(-1).matches[0];
const playerHistory = bracketFactsFromHistory([
  { ...bracket.bracket_history.at(-2), matches: [bracket.bracket_history.at(-2).matches[0]] },
  { ...bracket.bracket_history.at(-1), matches: [{ ...playerFinal, team_a: 'Jogador & Parceiro', team_b: playerFinal.team_b, winner: 'Jogador & Parceiro' }] },
], ['Jogador & Parceiro', playerFinal.team_b]);
assert.equal(playerHistory.champion, 'Jogador & Parceiro', 'final do jogador determina o campeão');
assert.equal(playerHistory.runner_up, playerFinal.team_b, 'final do jogador determina o vice');

const eliminationHistory = [{ round: 'Quartas de final', is_final: false, matches: [{ team_a: 'Jogador & Parceiro', team_b: 'Dupla A', winner: 'Dupla A', status: 'completed' }] }];
assert.equal(bracketFactsFromHistory(eliminationHistory, ['Jogador & Parceiro', 'Dupla A']), null, 'eliminação antes da final não encerra o título');

const points = getRoundOutcomeTable('Bronze', teams.length).roundPoints;
assert.equal(points.length, 4, 'usa a tabela de pontos existente');
assert(points.every((value) => value >= 0), 'todos os níveis da colocação recebem pontos válidos');

const roma = getTournamentTierConfig('Exibição');
assert.equal(roma.rankPoints, 0, 'Roma/Pré-Temporada permanece sem ranking');
assert.equal(roma.mainDrawSize, 8, 'Roma/Pré-Temporada possui chave');

const parallel = ['parallel-a', 'parallel-b', 'parallel-c'].map((id) => buildCanonicalTournamentBracket({ tournamentId: id, participants: teams }));
assert.equal(parallel.length, 3, 'torneios paralelos são resolvidos individualmente');
assert.equal(new Set(parallel.map((item) => item.champion)).size >= 1, true, 'cada torneio possui campeão');

const bracketUi = fs.readFileSync('src/components/tournaments/TournamentBracket.jsx', 'utf8');
const tournamentsPage = fs.readFileSync('src/pages/Tournaments.jsx', 'utf8');
assert(!bracketUi.includes('buildFinalOnlyHistory'), 'UI não reconstrói final inventada');
assert(tournamentsPage.includes('nextTournament'), 'Header e página usam o próximo torneio calculado');

// ── Playthrough 4.2 — chave COMPLETA para torneios com participação do jogador ──

function fillerFactoryFor(prefix) {
  let n = 0;
  return (count) => Array.from({ length: count }, () => ({ name: `${prefix}${(n += 1)}`, strength: 40 + n }));
}

function drawBracket(tournamentId = 'p4-2') {
  return buildPlayerTournamentBracket({
    tournamentId,
    date: '2026-02-01',
    playerTeamName: 'Jogador & Parceiro',
    mainOpponents: [{ name: 'Opp0' }, { name: 'Opp1' }, { name: 'Opp2' }],
    fillerFactory: fillerFactoryFor('Filler'),
  });
}

// 1/2 — sorteio cria chave completa; confronto do jogador ligado a um
// bracketMatch estável, com os confrontos que não o envolvem já resolvidos.
{
  const rounds = drawBracket();
  assert.equal(rounds.length, 3, 'draw de 8 tem 3 rodadas');
  assert.equal(rounds[0].matches.length, 4, 'rodada 0 tem 4 confrontos (N/2)');
  assert.equal(rounds[1].matches.length, 2, 'rodada 1 tem 2 confrontos (N/4)');
  assert.equal(rounds[2].matches.length, 1, 'rodada 2 (final) tem 1 confronto');
  assert.equal(rounds[0].matches[0].match_id, 'p4-2:player:r0', 'confronto do jogador tem matchId estável');
  assert.equal(rounds[0].matches[0].winner, null, 'partida do jogador nunca é resolvida antecipadamente');
  assert.equal(rounds[0].matches[0].team_b, 'Opp0', 'adversário da rodada 0 já é conhecido no sorteio');
  assert.ok(rounds[0].matches[1].winner, 'AI vs AI da mesma rodada já está resolvido no sorteio');
  assert.ok(rounds[0].matches.slice(1).every((match) => match.winner), 'nenhum confronto sem o jogador fica pendente');
  assert.equal(rounds[0].matches[1].winner, 'Opp1', 'sub-chave da rodada 0 decide o adversário pré-gerado da rodada 1');
  assert.equal(rounds[1].matches[1].winner, 'Opp2', 'sub-chave da rodada 1 decide o adversário pré-gerado da rodada 2 (final)');
  const totalMatches = rounds.reduce((sum, round) => sum + round.matches.length, 0);
  assert.equal(totalMatches, 7, 'draw_size 8 tem N-1=7 partidas totais na chave completa');
}

// 3/4 — LiveMatch atualiza o confronto; jogador eliminado cedo não trava a chave.
{
  const rounds = drawBracket('elim-r0');
  const applied = applyPlayerMatchToCanonicalBracket(rounds, {
    roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp0', won: false, score: '4-6 3-6', date: '2026-02-01',
  });
  assert.equal(applied.idempotent, false);
  assert.equal(applied.rounds[0].matches[0].winner, 'Opp0', 'derrota registra o adversário real como vencedor');
  assert.ok(applied.rounds.every((round) => round.matches.every((match) => match.winner)), 'chave inteira continua e resolve até o fim');
  const facts = deriveTournamentFactsFromFullBracket(applied.rounds);
  assert.ok(facts, 'chave completa após eliminação cedo produz fatos de torneio');
  assert.equal(facts.placements.length, 8, 'todos os 8 participantes recebem colocação');
  assert.equal(facts.champion, applied.rounds.at(-1).matches[0].winner, 'campeão vem da chave completa');

  // 12/13 — idempotência e ausência de duplicação num "reload" no meio do torneio.
  const reapplied = applyPlayerMatchToCanonicalBracket(applied.rounds, {
    roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp0', won: false, score: '4-6 3-6', date: '2026-02-01',
  });
  assert.equal(reapplied.idempotent, true, 'reaplicar o mesmo resultado da rodada já jogada é no-op');
  assert.deepEqual(reapplied.rounds, applied.rounds, 'reload não duplica nem altera confrontos já resolvidos');
}

// Cenário C — eliminado na semifinal (round1).
{
  const rounds = drawBracket('elim-sf');
  const afterR0 = applyPlayerMatchToCanonicalBracket(rounds, {
    roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp0', won: true, score: '6-3 6-4', date: '2026-02-01',
  }).rounds;
  assert.equal(afterR0[1].matches[0].team_a, 'Jogador & Parceiro', 'vitória avança o jogador para a próxima rodada');
  assert.equal(afterR0[1].matches[0].team_b, 'Opp1', 'próximo adversário já é o pré-gerado, decidido pela sub-chave');
  const afterSf = applyPlayerMatchToCanonicalBracket(afterR0, {
    roundIndex: 1, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp1', won: false, score: '4-6 6-7', date: '2026-02-08',
  }).rounds;
  assert.equal(afterSf[2].matches[0].winner, 'Opp1', 'final é decidida sem o jogador, mas a chave termina normalmente');
  const facts = deriveTournamentFactsFromFullBracket(afterSf);
  assert.equal(facts.runner_up, afterSf[2].matches[0].team_a === facts.champion ? afterSf[2].matches[0].team_b : afterSf[2].matches[0].team_a);
  assert.equal(facts.placements.length, 8);
}

// Cenário D — vice (perde a final) — nenhuma distribuição reduzida (item 5).
{
  const rounds = drawBracket('finalist');
  let acc = rounds;
  for (const [roundIndex, opponentTeamName] of [[0, 'Opp0'], [1, 'Opp1']]) {
    acc = applyPlayerMatchToCanonicalBracket(acc, { roundIndex, playerTeamName: 'Jogador & Parceiro', opponentTeamName, won: true, score: '6-2 6-2', date: '2026-02-01' }).rounds;
  }
  acc = applyPlayerMatchToCanonicalBracket(acc, { roundIndex: 2, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp2', won: false, score: '4-6 5-7', date: '2026-02-15' }).rounds;
  const facts = deriveTournamentFactsFromFullBracket(acc);
  assert.equal(facts.champion, 'Opp2', 'perder a final entrega o título ao adversário real');
  assert.equal(facts.runner_up, 'Jogador & Parceiro');
  assert.equal(facts.placements.length, 8, 'nenhum participante deixa de ser colocado com o jogador na final');
}

// Cenário E — campeão.
{
  const rounds = drawBracket('champion');
  let acc = rounds;
  for (const [roundIndex, opponentTeamName] of [[0, 'Opp0'], [1, 'Opp1'], [2, 'Opp2']]) {
    acc = applyPlayerMatchToCanonicalBracket(acc, { roundIndex, playerTeamName: 'Jogador & Parceiro', opponentTeamName, won: true, score: '6-2 6-3', date: '2026-02-01' }).rounds;
  }
  const facts = deriveTournamentFactsFromFullBracket(acc);
  assert.equal(facts.champion, 'Jogador & Parceiro');
  assert.equal(facts.runner_up, 'Opp2');
  assert.equal(facts.placements.length, 8);
}

// 9 — orçamento de pontos por tier/draw_size é o mesmo em AI-only e
// player-participating: o campo tem o mesmo tamanho nos dois casos, então a
// mesma tabela de getRoundOutcomeTable(tier, entrantCount) se aplica sem
// distinção de quem jogou.
{
  const aiOnly = buildCanonicalTournamentBracket({ tournamentId: 'budget-ai', participants: Array.from({ length: 8 }, (_, i) => ({ name: `Dupla ${i}`, strength: 100 - i })) });
  const playerPath = deriveTournamentFactsFromFullBracket(
    (() => {
      let acc = drawBracket('budget-player');
      acc = applyPlayerMatchToCanonicalBracket(acc, { roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp0', won: false }).rounds;
      return acc;
    })(),
  );
  assert.equal(aiOnly.placements.length, playerPath.placements.length, '10. campo do mesmo tamanho recebe o mesmo número de colocações pagas');
  const table = getRoundOutcomeTable('Bronze', 8).roundPoints;
  assert.equal(table.length, getRoundOutcomeTable('Bronze', playerPath.participants.length).roundPoints.length, 'mesma tabela de pontos para o mesmo tier/draw_size, com ou sem o jogador');
}

// 11 — Roma/Exibição usa o mesmo motor e completa a chave após eliminação.
{
  const roma = getTournamentTierConfig('Exibição');
  const rounds = buildPlayerTournamentBracket({
    tournamentId: 'roma',
    playerTeamName: 'Jogador & Parceiro',
    mainOpponents: Array.from({ length: Math.log2(roma.mainDrawSize) }, (_, i) => ({ name: `RomaOpp${i}` })),
    fillerFactory: fillerFactoryFor('RomaFiller'),
  });
  const applied = applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'RomaOpp0', won: false });
  const facts = deriveTournamentFactsFromFullBracket(applied.rounds);
  assert.ok(facts?.champion, 'Roma produz campeão mesmo com o jogador eliminado na estreia');
  assert.equal(facts.placements.length, roma.mainDrawSize, 'chave de Roma tem o tamanho configurado do tier');
}

// 12 — settlement (finalizeTournamentFromBracket) continua idempotente para a chave do jogador.
{
  const rounds = drawBracket('idempotent-settlement');
  const applied = applyPlayerMatchToCanonicalBracket(rounds, { roundIndex: 0, playerTeamName: 'Jogador & Parceiro', opponentTeamName: 'Opp0', won: false }).rounds;
  const facts = deriveTournamentFactsFromFullBracket(applied);
  const tournament = { id: 'idempotent-settlement', name: 'Idempotent Settlement', tier: 'Bronze' };
  const first = finalizeTournamentFromBracket({ tournament, bracket: facts, date: '2026-02-01' });
  const second = finalizeTournamentFromBracket({ tournament: { ...tournament, ...first.patch }, bracket: facts, date: '2026-02-01' });
  assert.equal(second.idempotent, true, 'segunda finalização da chave do jogador é no-op');
}

console.log('test-tournament-canonical-results: PASS');
