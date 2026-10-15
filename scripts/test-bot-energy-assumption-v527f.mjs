// Playthrough 5.27-F, Bloco E — premissa DOCUMENTADA (dívida de design, não bug
// de fórmula): o adversário chega ao motor pelo snapshot da chave, sem energia,
// moral ou atributos → energia 100, confiança 70, atributos = OVR. O jogador
// leva energia/moral reais. Este teste trava a premissa para que qualquer
// mudança nela seja consciente.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-bot-energy-assumption-v527f');
const { load, close } = await bootModules();
try {
  const { normalizePlayer } = await load('/src/engine/match/playerModel.js');
  // Campos reais do snapshot de adversário guardado no tournament_run (5.27-D).
  const snapshot = { id: 'athleteprofile-x', name: 'Bot', sport_name: 'Bot', overall: 47, overall_rating: 47, form: 0, position: 'direita', preferred_side: 'direita', handedness: 'right', play_style: 'Equilibrado', country: 'BR' };

  await check('snapshot de adversário não traz energia/moral/atributos', () => {
    for (const k of ['energy', 'morale', 'confidence', 'serve', 'smash']) assert.equal(snapshot[k], undefined, k);
  });

  await check('no motor: energia 100, confiança 70, atributos = OVR', () => {
    const p = normalizePlayer(snapshot, 'B', 0);
    assert.equal(p.energy, 100);
    assert.equal(p.confidence, 70);
    assert.equal(p.overall, 47);
    assert.ok(Object.values(p.attributes).every((v) => v === 47));
  });

  await check('o jogador leva energia e moral reais', () => {
    const p = normalizePlayer({ id: 'me', serve: 50, forehand: 50, backhand: 50, volley: 50, bandeja: 50, smash: 50, defense: 50, agility: 50, strategy: 50, emotional_control: 50, energy: 60, morale: 95 }, 'A', 0);
    assert.equal(p.energy, 60);
    assert.equal(p.confidence, 95);
  });
} finally {
  await close();
  finish();
}
