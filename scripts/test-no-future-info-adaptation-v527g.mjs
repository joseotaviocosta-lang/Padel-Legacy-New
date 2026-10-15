// Playthrough 5.27-G, Bloco I (itens 42–43) — a escolha de tática da IA só usa
// informação visível (placar de sets/games, energia, atributos do próprio time)
// e não consome nem lê o RNG da partida.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-no-future-info-adaptation-v527g');
const { load, close } = await bootModules();
try {
  const { chooseBotTactic } = await load('/src/engine/match/MatchTactics.js');
  const engine = await load('/src/lib/matchEngine.js');
  const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
  const raw = (id, ovr) => ({ id, name: id, ...Object.fromEntries(KEYS.map((k) => [k, ovr])) });

  await check('código de chooseBotTactic lê só sets, games, energia e smash do próprio time', () => {
    const src = readFileSync('src/engine/match/MatchTactics.js', 'utf8');
    const body = src.slice(src.indexOf('export function chooseBotTactic'), src.indexOf('}', src.indexOf('return getMatchTactic(\'tatico\')')));
    for (const forbidden of ['random', 'seed', 'randomState', 'winner', 'pointEvents', 'narration']) assert.ok(!body.includes(forbidden), forbidden);
    for (const used of ['setsA', 'setsB', 'gamesA', 'gamesB', 'energy', 'smash']) assert.ok(body.includes(used), used);
  });

  await check('mesma situação visível com RNG diferente → mesma tática', () => {
    const a = engine.createMatch([raw('a1', 60), raw('a2', 60)], [raw('b1', 70), raw('b2', 70)], { seed: 's1', opponentAdaptive: true });
    const b = { ...a, seed: 'outra', randomState: 987654321 };
    assert.equal(chooseBotTactic(a, 'B').id, chooseBotTactic(b, 'B').id);
  });

  await check('escolher a tática não altera o estado do RNG nem o estado da partida', () => {
    const s = engine.createMatch([raw('a1', 60), raw('a2', 60)], [raw('b1', 70), raw('b2', 70)], { seed: 's2', opponentAdaptive: true });
    const before = JSON.stringify({ r: s.randomState, sets: [s.setsA, s.setsB], games: [s.gamesA, s.gamesB] });
    chooseBotTactic(s, 'B');
    assert.equal(JSON.stringify({ r: s.randomState, sets: [s.setsA, s.setsB], games: [s.gamesA, s.gamesB] }), before);
  });

  await check('cadência registrada: troca só quando OpponentAdaptationTracker.shouldAdjust (intervalo mínimo de pontos)', () => {
    const src = readFileSync('src/engine/match/MatchEngine.js', 'utf8');
    assert.match(src, /OpponentAdaptationTracker\.shouldAdjust\(state,2\)/);
  });
} finally {
  await close();
  finish();
}
