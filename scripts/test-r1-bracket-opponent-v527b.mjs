// Playthrough 5.27-B, Bloco B — a R1 NÃO é uma parede artificial. O adversário
// da R1 segue o BRACKET REAL (seedOrder): o melhor seed enfrenta o pior seed
// do campo (bloco-espelho), nunca um "adversário mais forte" inventado.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-r1-bracket-opponent-v527b');
const { rt, profile } = await bootDrawCareer('r1-bracket-527b', { warmDays: 8 });
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const t = await E.Tournament.create({ id: 'd527b-r1-gold', name: 'R1 Gold', tier: 'Gold', start_date: profile.career_date, end_date: profile.career_date, status: 'inscricoes', main_draw_size: 24 });
  // playerRank=1 → o jogador é o seed nº1; a R1 deve ser contra o PIOR seed.
  const f = await WorldTour.buildPlayerTournamentField({ tournament: t, profile, playerRank: 1, playerTeamName: 'Seed 1 & X', partnerAthleteId: profile.partner_id });
  const fieldRanks = f.entrants.map((p) => f.rankByPairId.get(p.id) || 0).filter((r) => r > 0);
  const r1Id = f.mainOpponentIds[0];
  const r1rank = r1Id ? f.rankByPairId.get(r1Id) : null;

  await check('seed nº1 enfrenta um adversário de bracket (não um topo artificial na R1)', () => {
    assert.ok(r1Id, 'sem R1');
    const sorted = [...fieldRanks].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    // O seed nº1 nunca enfrenta o topo do campo na R1: o bracket real pareia
    // 1 com o espelho (bracketSize), que está na metade mais fraca.
    assert.ok(Number(r1rank) >= median, `R1 rank ${r1rank} < mediana ${median}`);
  });

  await check('a projeção não inventa adversário mais forte que o bloco-espelho', () => {
    // O R1 é o único entrante do bloco-espelho de tamanho 1 (slot adjacente).
    assert.ok(Number(r1rank) >= fieldRanks.sort((a, b) => a - b)[Math.floor(fieldRanks.length / 2)], 'R1 mais forte que a mediana');
  });

  await check('nenhum adversário do caminho repete a mesma dupla', () => {
    const ids = f.mainOpponentIds.filter(Boolean);
    assert.equal(new Set(ids).size, ids.length);
  });

  await check('fonte: a projeção usa buildSeededDrawSlots (bracket real), não "R1 = mais fraco" hardcoded', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/gameplay/worldTour/WorldTourLifecycle.js', 'utf8');
    assert.match(src, /buildSeededDrawSlots\(\{/);
    assert.doesNotMatch(src, /R1.*weakest|if \(roundIndex === 0\).*sort\(byWeakFirst\)/i);
  });
} finally {
  await rt.close();
}
finish();
