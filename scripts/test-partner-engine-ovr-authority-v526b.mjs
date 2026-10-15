// Playthrough 5.26-B — OVR que o MOTOR de partida usa = OVR canônico (o da UI).
// Antes: parceiro materializado e atletas do mundo (só `overall_rating`)
// entravam na partida com OVR 1; template parcial com ~60% do OVR.
import { makeSuite, bootModules, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-partner-engine-ovr-authority-v526b');
const m = await bootModules();
try {
  const engine = await m.load('/src/lib/matchEngine.js');
  const padel = await m.load('/src/lib/padel.js');
  const attributes = await m.load('/src/lib/attributes.js');
  const KEYS = attributes.ATTRIBUTE_KEYS;
  const flat = (v) => Object.fromEntries(KEYS.map((k) => [k, v]));
  const player = { id: 'p1', sport_name: 'Jogador', ...flat(40) };
  const opp = [{ id: 'o1', name: 'O1', overall_rating: 50 }, { id: 'o2', name: 'O2', overall_rating: 50 }];
  const engineOvr = (partner) => engine.createMatch([player, partner], opp, { seed: 'ovr' }).teams.A[1].overall;

  await check('parceiro persistente normal: card 35 → motor 35', () => {
    const partner = { id: 'pp', name: 'Parceiro', overall: 35, overall_rating: 35, source_attributes: { serve: 33 } };
    assert.equal(padel.overallRating(partner), 35);
    assert.equal(engineOvr(partner), 35);
  });
  await check('parceiro elite: card 88 → motor 88', () => assert.equal(engineOvr({ id: 'e', name: 'Elite', overall_rating: 88 }), 88));
  await check('parceiro fraco legítimo: card 9 → motor 9 (não é inflado)', () => assert.equal(engineOvr({ id: 'w', name: 'Fraco', overall_rating: 9 }), 9));
  await check('template legado parcial (6/10 atributos, OVR 31) → 31, não ~19', () => {
    const partial = { id: 'pt', name: 'Parcial', overall_rating: 31, serve: 30, forehand: 32, backhand: 29, volley: 33, bandeja: 31, smash: 31 };
    assert.equal(padel.overallRating(partial), 31);
    assert.equal(engineOvr(partial), 31);
  });
  await check('jogador com atributos completos: motor = média (igual a antes da correção)', () => {
    const state = engine.createMatch([player, { id: 'x', name: 'X', overall_rating: 35 }], opp, { seed: 'ovr' });
    assert.equal(state.teams.A[0].overall, 40);
  });
  await check('nenhum atleta com fonte de OVR cai no piso artificial 1', () => {
    for (const ovr of [5, 20, 35, 60, 99]) assert.equal(engineOvr({ id: `a${ovr}`, name: 'A', overall_rating: ovr }), ovr);
  });
  await check('modificadores de contexto do motor preservados (química/energia/coach/vínculo)', () => {
    const boosted = { ...player, _chemistryBonus: 2, _energyPenalty: -3, _coachMatchBonus: 5, _partnerBondBonus: 4 };
    const state = engine.createMatch([boosted, { id: 'x', name: 'X', overall_rating: 35 }], opp, { seed: 'ovr' });
    // 40 + 2 − 3 + min(3,5) + min(2.5,4) = 44.5
    assert.equal(state.teams.A[0].overall, 44.5);
  });
  await check('UI e motor usam a MESMA função-base (attributes.js:baseOverallRating)', () => {
    for (const p of [player, { overall_rating: 35 }, { overall: 72 }, { serve: 10, smash: 20 }]) {
      assert.equal(padel.overallRating(p), Math.max(1, Math.min(100, attributes.baseOverallRating(p))));
    }
    assert.equal(attributes.baseOverallRating({}), null);
  });
  await check('determinismo do novo build: mesma seed → mesmo placar', () => {
    const play = () => { let s = engine.createMatch([player, { id: 'x', name: 'X', overall_rating: 35 }], opp, { seed: 'det' }); let g = 0; while (!s.finished && g < 3000) { s = engine.playPoint(s); g += 1; } return `${s.setsA}-${s.setsB}:${engine.getSetScoreString(s)}`; };
    assert.equal(play(), play());
  });
} finally {
  await m.close();
}
finish();
