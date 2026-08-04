import { createDefaultBalanceTeams, simulateBalancedMatch } from './BalanceSimulator.js';
import { getOpponentTeamId, getTieBreakServingTeam, validateCompletedMatch } from './MatchEngine.js';
import { createRandom } from './random.js';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

export async function runMatchIntegrityTest() {
  assert(getOpponentTeamId('A') === 'B' && getOpponentTeamId('B') === 'A', 'Identidade das equipes inválida.');
  const servicePattern = Array.from({ length: 9 }, (_, point) => getTieBreakServingTeam('A', point)).join('');
  assert(servicePattern === 'ABB AABB AA'.replaceAll(' ', ''), `Ordem do tie-break inválida: ${servicePattern}`);

  const firstRandom = createRandom('continuous-rng');
  const values = Array.from({ length: 12 }, () => firstRandom.next());
  const resumed = createRandom('continuous-rng', firstRandom.state());
  const nextValue = resumed.next();
  const repeated = createRandom('continuous-rng');
  assert(values.every(Number.isFinite) && new Set(values).size === values.length, 'RNG não avançou.');
  assert(values.every(value => value >= 0 && value < 1), 'RNG fora de [0,1).');
  assert(nextValue !== repeated.next(), 'RNG foi reiniciado ao retomar.');

  const teams = createDefaultBalanceTeams();
  const first = simulateBalancedMatch({ ...teams, seed: 'integrity-seed' });
  const second = simulateBalancedMatch({ ...teams, seed: 'integrity-seed' });
  assert(JSON.stringify(first.pointEvents) === JSON.stringify(second.pointEvents), 'Mesma seed não reproduziu os pontos.');
  assert(validateCompletedMatch(first).valid, 'Integridade da partida concluída falhou.');
  assert(first.pointEvents.every(event => ['A', 'B'].includes(event.winnerTeamId) && event.winnerTeamId !== event.loserTeamId), 'Ponto sem vencedor inequívoco.');
  assert(first.pointEvents.some(event => event.winnerTeamId !== event.servingTeamId), 'Recebedor nunca venceu um ponto.');
  const games = first.pointEvents.filter(event => !event.scoreBefore.inTiebreak && (event.scoreAfter.gamesA !== event.scoreBefore.gamesA || event.scoreAfter.gamesB !== event.scoreBefore.gamesB || event.scoreAfter.setsA !== event.scoreBefore.setsA || event.scoreAfter.setsB !== event.scoreBefore.setsB));
  assert(games.some(event => event.winnerTeamId !== event.servingTeamId), 'Não houve quebra de saque.');
  for (let index = 1; index < first.pointEvents.length; index += 1) {
    const previous = first.pointEvents[index - 1]; const current = first.pointEvents[index];
    const gameDidNotEnd = previous.scoreAfter.gamesA === previous.scoreBefore.gamesA && previous.scoreAfter.gamesB === previous.scoreBefore.gamesB && previous.scoreAfter.setsA === previous.scoreBefore.setsA && previous.scoreAfter.setsB === previous.scoreBefore.setsB;
    const sameNormalGame = gameDidNotEnd && !previous.scoreBefore.inTiebreak && !current.scoreBefore.inTiebreak;
    if (sameNormalGame) assert(previous.serverPlayerId === current.serverPlayerId, 'Sacador mudou dentro do game normal.');
  }
  return { ok: true, servicePattern, points: first.pointEvents.length, games: games.length, breaks: games.filter(event => event.winnerTeamId !== event.servingTeamId).length, deterministic: true };
}
