// Playthrough 5.26-D, Bloco S — DETERMINISMO. Mesmo seed, mesmo estado de
// mundo, mesmo torneio → mesmo campo, mesmo bracket. Nada de Math.random;
// nenhuma informação futura (só rank/pontos do instante da admissão).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-real-pair-draw-determinism-v526d');
const { rt, profile } = await bootDrawCareer('determinism-526d');
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const tournament = await E.Tournament.create({
    id: 'd526-det-gold', name: 'Determinism Gold', tier: 'Gold', start_date: profile.career_date,
    end_date: profile.career_date, status: 'inscricoes', main_draw_size: 24,
  });
  const args = {
    tournament, profile, playerRank: 0, playerTeamName: 'Det & Erm', partnerAthleteId: profile.partner_id || null,
  };
  const first = await WorldTour.buildPlayerTournamentField(args);
  const second = await WorldTour.buildPlayerTournamentField(args);

  await check('mesmo estado → mesmos adversários projetados (mainOpponentIds)', () => {
    assert.deepEqual(second.mainOpponentIds, first.mainOpponentIds);
  });

  await check('mesmo estado → mesmo campo admitido (ids, ordem)', () => {
    assert.deepEqual(second.entrants.map((p) => p.id), first.entrants.map((p) => p.id));
  });

  await check('mesmo estado → mesmos ranks/strengths por dupla', () => {
    const toMap = (field) => Object.fromEntries([...field.rankByPairId.entries()].sort());
    assert.deepEqual(toMap(second), toMap(first));
    const toStrength = (field) => Object.fromEntries([...field.strengthByPairId.entries()].sort());
    assert.deepEqual(toStrength(second), toStrength(first));
  });

  await check('admissão não olha resultados futuros (mesma função pura de rank/pontos atuais)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /blendedCutScore|pairScore\(pair, tournament\) \* \(0\.35 \+ 0\.65/);
    assert.doesNotMatch(src.slice(src.indexOf('buildPlayerTournamentField'), src.indexOf('buildPlayerTournamentField') + 6000), /Math\.random/);
  });

  await check('draw determinístico sobrevive a reexecução direta (2x)', () => {
    const third = WorldTour.buildPlayerTournamentField(args);
    return third.then((field) => assert.deepEqual(field.mainOpponentIds, first.mainOpponentIds));
  });
} finally {
  await rt.close();
}
finish();
