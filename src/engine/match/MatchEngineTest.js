import { createMatch, playPoint, MATCH_TACTICS } from './index.js';

const athlete = (id, name, level, style = 'Equilibrado') => ({
  id, sport_name: name, play_style: style, energy: 100, morale: 70,
  serve: level, forehand: level, backhand: level, volley: level,
  bandeja: level, smash: level, defense: level, agility: level,
  strategy: level, emotional_control: level,
});

function simulate(seed) {
  let state = createMatch(
    [athlete('a1', 'Ana', 72, 'Agressivo'), athlete('a2', 'Bia', 69, 'Tático')],
    [athlete('b1', 'Clara', 70, 'Defensivo'), athlete('b2', 'Dora', 68, 'Equilibrado')],
    { seed },
  );
  let safety = 5000;
  while (!state.finished && safety-- > 0) state = playPoint(state, MATCH_TACTICS[0]);
  if (!state.finished) throw new Error('A partida excedeu o limite de segurança.');
  return state;
}

export async function runMatchEngineTest() {
  const first = simulate('v030-a-test');
  const second = simulate('v030-a-test');
  const firstScore = JSON.stringify(first.setScores);
  const secondScore = JSON.stringify(second.setScores);
  const deterministic = firstScore === secondScore && first.winner === second.winner;
  const statsOk = first.stats.rallies > 0 && first.stats.longestRally > 0 && Object.keys(first.stats.players).length === 4;
  const positionsOk = Object.values(first.teams).flat().every((player) => ['back', 'net'].includes(player.position.zone));
  const energyOk = Object.values(first.teams).flat().every((player) => player.energy >= 0 && player.energy <= 100);
  return {
    success: deterministic && statsOk && positionsOk && energyOk,
    engineVersion: first.engineVersion,
    deterministic, statsOk, positionsOk, energyOk,
    winner: first.winner, sets: firstScore,
    rallies: first.stats.rallies, longestRally: first.stats.longestRally,
  };
}
