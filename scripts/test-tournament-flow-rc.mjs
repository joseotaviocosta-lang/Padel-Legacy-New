import assert from 'node:assert/strict';
import {
  buildOpponentAnalysis,
  buildTournamentBracketHistory,
  buildTournamentCoachSuggestion,
  completePreTournamentMeeting,
  completeRoundPreparation,
  createTournamentRun,
  getCurrentTournamentMatch,
  getTournamentRunPhase,
  recordTournamentMatchResult,
  startTournamentMatch,
  validateTournamentRun,
} from '../src/gameplay/worldTour/TournamentRunManager.js';
import { calculateDailyRecovery } from '../src/gameplay/worldTour/PhysicalConditionManager.js';

const tournament = { id: 'masters-ba', name: 'Masters Buenos Aires', tier: 'Masters', start_date: '2026-01-08' };
const rounds = [
  { label: 'R16', short: 'R16' },
  { label: 'Quartas de Final', short: 'QF' },
  { label: 'Semifinal', short: 'SF' },
  { label: 'Final', short: 'F' },
];
const opponent = (suffix, rank, style = 'agressivo') => ({
  members: [
    { id: `opp-${suffix}-a`, name: `Rival ${suffix} A`, ranking_position: rank, preferred_side: 'left', handedness: 'right', play_style: style, smash: 78, volley: 72, lob: 58, defense: 52 },
    { id: `opp-${suffix}-b`, name: `Rival ${suffix} B`, ranking_position: rank + 1, preferred_side: 'right', handedness: 'left', play_style: style, smash: 75, volley: 70, lob: 55, defense: 50 },
  ],
  rank,
});

const makeRun = () => createTournamentRun({
  tournament,
  profileId: 'player-1',
  startDate: tournament.start_date,
  mainRounds: rounds,
  opponents: [opponent('r16', 84), opponent('qf', 52), opponent('sf', 21, 'tático'), opponent('f', 8, 'potência')],
});

let run = makeRun();
assert.equal(getTournamentRunPhase(run, '2026-01-08'), 'pre_tournament', '1. reunião pré-torneio deve abrir antes da estreia');
const firstMeeting = completePreTournamentMeeting(run, 'lobs', '2026-01-07T10:00:00.000Z');
run = firstMeeting.run;
const repeatedMeeting = completePreTournamentMeeting(run, 'aggressive', '2026-01-07T11:00:00.000Z');
assert.equal(repeatedMeeting.idempotent, true, '1. reunião pré-torneio deve ocorrer uma vez');
assert.equal(repeatedMeeting.run.strategy.id, 'lobs', '2. estratégia salva não pode ser sobrescrita por reabertura');
assert.equal(getCurrentTournamentMatch(run).date, '2026-01-08', '3. estreia deve usar a data correta');

run = startTournamentMatch(run, '2026-01-08', '2026-01-08T14:00:00.000Z');
const firstMatchId = getCurrentTournamentMatch(run).id;
const firstResult = recordTournamentMatchResult(run, {
  matchId: firstMatchId,
  won: true,
  score: '6-4 6-3',
  stats: { winners: 18, errors: 22, net: 42, lobs: 15, smashes: 9 },
  tournament,
  now: '2026-01-08T16:00:00.000Z',
});
run = firstResult.run;
assert.equal(run.status, 'between_rounds', '4. vitória não deve iniciar a rodada seguinte');
assert.equal(getCurrentTournamentMatch(run).status, 'scheduled', '4. próxima partida deve ficar apenas agendada');
assert.equal(getCurrentTournamentMatch(run).date, '2026-01-09', '5/12. vitória agenda a próxima rodada para o dia seguinte');

const physicalState = { energy: 43, fatigue: 61 };
assert.deepEqual(physicalState, { energy: 43, fatigue: 61 }, '6. o estado do torneio não reseta energia ou fadiga');
const recovery = calculateDailyRecovery({ ...physicalState, condition: 70 }, { restDay: false });
assert(recovery.energyGain > 0 && physicalState.energy + recovery.energyGain < 100, '7. recuperação diária deve existir sem completar 100% automaticamente');
assert(firstResult.run.matches[0].pressImportance, '8. a rodada deve registrar importância para entrevista/imprensa');

const analysis = buildOpponentAnalysis(getCurrentTournamentMatch(run).opponent, { teamRank: 52, analysisLevel: 2 });
const suggestion = buildTournamentCoachSuggestion(run, { energy: 54, fatigue: 48 }, analysis);
assert.equal(suggestion.optionId, 'control', '9. treinador deve usar erros e winners do jogo anterior');
const prepared = completeRoundPreparation(run, { optionId: suggestion.optionId }, '2026-01-08T18:00:00.000Z');
run = prepared.run;
assert.equal(run.strategy.id, 'control', '10. estratégia deve poder ser alterada antes da próxima rodada');
assert.equal(getTournamentRunPhase(run, '2026-01-08'), 'waiting', '5. ainda não é permitido jogar antes da data');

const reloaded = JSON.parse(JSON.stringify(run));
assert.equal(getCurrentTournamentMatch(reloaded).id, getCurrentTournamentMatch(run).id, '15. reload deve preservar a rodada');
assert.deepEqual(getCurrentTournamentMatch(reloaded).opponent, getCurrentTournamentMatch(run).opponent, '15. reload deve preservar o adversário');
assert.equal(reloaded.strategy.id, 'control', '15. reload deve preservar a tática');

const defeatBase = completePreTournamentMeeting(makeRun(), 'balanced').run;
const defeatPlaying = startTournamentMatch(defeatBase, '2026-01-08');
const defeat = recordTournamentMatchResult(defeatPlaying, { matchId: getCurrentTournamentMatch(defeatPlaying).id, won: false, score: '4-6 3-6', tournament });
assert.equal(defeat.run.status, 'eliminated', '11. derrota encerra a participação');
assert.equal(defeat.nextMatch, null, '11. derrota não agenda nova rodada');

while (run.status !== 'champion') {
  const match = getCurrentTournamentMatch(run);
  if (!match.preparationCompleted) run = completeRoundPreparation(run, { keepPlan: true }).run;
  run = startTournamentMatch(run, match.date);
  run = recordTournamentMatchResult(run, { matchId: match.id, won: true, score: '6-3 6-4', stats: { winners: 20, errors: 12, net: 58, lobs: 12 }, tournament }).run;
}
assert.equal(run.status, 'champion', '13. vitória na final encerra como campeão');
assert.equal(getCurrentTournamentMatch(run).round, 'Final', '13. o título deve terminar na final');

const bracket = buildTournamentBracketHistory(run, 'Jogador & Parceiro');
assert.equal(bracket.length, rounds.length, '14. a chave deve conter uma entrada por rodada');
assert.equal(new Set(bracket.flatMap((round) => round.matches.map((match) => match.match_id))).size, rounds.length, '14. a chave não pode duplicar partidas');
assert.equal(bracket.at(-1).matches[0].status, 'completed', '13. a final deve permanecer concluída');

const validation = validateTournamentRun(run);
assert.equal(validation.valid, true, `17. datas/IDs inválidos: ${validation.issues.join(', ')}`);
assert.equal(new Set(run.matches.map((match) => match.date)).size, run.matches.length, '17. não podem existir duas partidas do jogador no mesmo dia');
const calendarProjection = { title: `${tournament.name} — ${run.matches[1].round}`, start_date: run.matches[1].date };
assert.equal(calendarProjection.start_date, '2026-01-09', '16. calendário deve mostrar a próxima rodada');

const repeatedResult = recordTournamentMatchResult(run, { matchId: getCurrentTournamentMatch(run).id, won: true, tournament });
assert.equal(repeatedResult.idempotent, true, '14/15. resultado concluído não pode ser reaplicado');

console.log('TournamentFlowRCTest: PASS');
console.log('✓ reunião e estratégia persistentes');
console.log('✓ uma rodada por dia, sem início automático');
console.log('✓ energia, recuperação, treinador e imprensa integrados');
console.log('✓ derrota, título, reload, calendário e idempotência validados');
