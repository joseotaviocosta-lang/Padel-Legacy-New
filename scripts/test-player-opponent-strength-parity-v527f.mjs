// Playthrough 5.27-F, Blocos B/D — o mesmo atleta produz a MESMA força antes do
// RNG dos dois lados; nenhum modificador de fórmula exclusivo de lado; a IA não
// troca de tática sozinha por padrão (táticas não são neutras).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootModules } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-player-opponent-strength-parity-v527f');
const { load, close } = await bootModules();
try {
  const { createTeams } = await load('/src/engine/match/playerModel.js');
  const { RallyEngine } = await load('/src/engine/match/RallyEngine.js');
  const { getMatchTactic } = await load('/src/engine/match/MatchTactics.js');
  const engine = await load('/src/lib/matchEngine.js');
  const padel = await load('/src/lib/padel.js');
  const KEYS = ['serve', 'forehand', 'backhand', 'volley', 'bandeja', 'smash', 'defense', 'agility', 'strategy', 'emotional_control'];
  const raw = (id, ovr, extra = {}) => ({ id, name: id, ...Object.fromEntries(KEYS.map((k) => [k, ovr])), ...extra });
  const rally = new RallyEngine();
  const pre = (p, shot) => rally.skill(p, shot) * 0.2 + (p.confidence - 50) * 0.14 * 0.2 - (100 - p.energy) * 0.12 * 0.2 - rally.risk(shot, getMatchTactic('equilibrado'), true, p, {});

  for (const [ovr, energy] of [[35, 100], [50, 55], [75, 80]]) {
    await check(`OVR ${ovr} energia ${energy}: pipeline do jogador (modal) == pipeline do adversário`, () => {
      const player = raw('p', ovr, { energy, _chemistryBonus: padel.getChemistryBonus(50), _energyPenalty: padel.getEnergyPenalty(energy) });
      const teams = createTeams([player, raw('p2', ovr, { energy })], [raw('o1', ovr, { energy }), raw('o2', ovr, { energy })]);
      assert.equal(teams.A[0].overall, teams.B[0].overall);
      for (const shot of ['serve', 'drive', 'volley', 'smash', 'lob', 'bandeja']) assert.equal(pre(teams.A[0], shot), pre(teams.B[0], shot), shot);
    });
  }

  await check('risco da tática vale para quem está batendo, independente do lado', () => {
    const p = createTeams([raw('a', 50)], [raw('b', 50)]);
    const t = getMatchTactic('tatico');
    assert.equal(rally.risk('smash', t, true, p.A[0], {}), rally.risk('smash', t, true, p.B[0], {}));
  });

  await check('createMatch: adaptação de tática do adversário desligada por padrão', () => {
    const s = engine.createMatch([raw('a1', 70), raw('a2', 70)], [raw('b1', 70), raw('b2', 70)], { seed: 'parity' });
    assert.equal(s.opponentAdaptive, false);
    let st = s; let g = 0;
    while (!st.finished && g < 4000) { st = engine.playPoint(st); g += 1; }
    assert.equal(st.activeTactics.B.id, 'equilibrado', 'a IA trocou de tática sozinha');
  });

  await check('adaptação continua disponível só por opt-in explícito', () => {
    const s = engine.createMatch([raw('a1', 70), raw('a2', 70)], [raw('b1', 70), raw('b2', 70)], { seed: 'opt-in', opponentAdaptive: true });
    assert.equal(s.opponentAdaptive, true);
  });

  await check('partida salva antes da 5.27-F (sem o campo) não liga adaptação', () => {
    const s = engine.createMatch([raw('a1', 70), raw('a2', 70)], [raw('b1', 70), raw('b2', 70)], { seed: 'legacy' });
    delete s.opponentAdaptive;
    let st = s; let g = 0;
    while (!st.finished && g < 4000) { st = engine.playPoint(st); g += 1; }
    assert.equal(st.activeTactics.B.id, 'equilibrado');
  });
} finally {
  await close();
  finish();
}
