// Playthrough 5.27-F, Bloco C — a energia é aplicada UMA vez na força (por
// golpe, no RallyEngine, na inclinação calibrada); `_energyPenalty` não altera
// mais o OVR do motor.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';
import { readFileSync } from 'node:fs';

const { check, finish } = makeSuite('test-energy-single-application-v527f');
const { load, close } = await bootModules();
try {
  const { normalizePlayer } = await load('/src/engine/match/playerModel.js');
  const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
  const base = (extra) => ({ id: 'x', ...Object.fromEntries(KEYS.map((k) => [k, 50])), ...extra });

  await check('_energyPenalty não muda o OVR do motor (−2/−5/−10)', () => {
    for (const pen of [-2, -5, -10]) assert.equal(normalizePlayer(base({ energy: 40, _energyPenalty: pen }), 'A', 0).overall, normalizePlayer(base({ energy: 40 }), 'A', 0).overall);
  });

  await check('a energia real continua chegando ao motor (player.energy)', () => {
    assert.equal(normalizePlayer(base({ energy: 55 }), 'A', 0).energy, 55);
  });

  await check('outros modificadores de contexto continuam no OVR (química, coach, vínculo)', () => {
    assert.equal(normalizePlayer(base({ _chemistryBonus: 3 }), 'A', 0).overall, 53);
    assert.equal(normalizePlayer(base({ _coachMatchBonus: 2 }), 'A', 0).overall, 52);
  });

  await check('RallyEngine: energia e confiança na inclinação calibrada única (CONDITION_SLOPE 0.2)', () => {
    const src = readFileSync('src/engine/match/RallyEngine.js', 'utf8');
    assert.match(src, /const CONDITION_SLOPE = 0\.2;/);
    assert.match(src, /const energyPenalty = \(100 - player\.energy\) \* 0\.12 \* conditionScale;/);
    assert.match(src, /const confidence = \(player\.confidence - 50\) \* 0\.14 \* conditionScale;/);
    assert.match(src, /globalThis\.__PL527F_CONDITION_SCALE : CONDITION_SLOPE/);
  });

  await check('o padrão de produção não define o override do harness', () => {
    assert.equal(globalThis.__PL527F_CONDITION_SCALE, undefined);
  });
} finally {
  await close();
  finish();
}
