// Playthrough 5.26-C, Bloco A — Race é ANUAL; World não reseta.
// resetRaceSeasonPoints (career.js, etapa da virada do ano civil) zera
// race_points do jogador e de TODA a população, sem tocar em
// world_ranking_points/ranking_points/rank_points nem nos resultados datados
// (AthleteRankingResult), que só expiram pela janela de 364 dias.
// Caso de população grande: depois de anos de prospects + aposentados que
// continuam na coleção, a população passa de 1500 atletas.
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-race-year-reset-v526c');
const { rt, profile: p0 } = await bootCareer('race-reset-526c');
try {
  const AR = await rt.load('/src/game-core/annualCareerReportLifecycle.js');
  const E = rt.localGame.entities;
  const athletes = (await E.AthleteProfile.list(null, 100000)) || [];
  const base = athletes.length;
  // Race e World com valores conhecidos antes da virada.
  await E.AthleteProfile.bulkUpdate(athletes.map((a, i) => ({ id: a.id, race_points: 10 + (i % 50), world_ranking_points: 1000 + i })));
  // População de longo prazo: atletas extras (prospects/aposentados) com Race > 0
  // e ranking_position alto/ausente, como os que entram depois da semeadura.
  const extra = Array.from({ length: Math.max(0, 1700 - base) }, (_, i) => ({
    id: `athlete-526c-extra-${i}`, name: `Extra ${i}`, overall_rating: 40, race_points: 5, world_ranking_points: 7,
    ranking_position: i % 3 === 0 ? null : 2000 + i, retired: i % 4 === 0, career_status: i % 4 === 0 ? 'aposentado' : 'ativo',
  }));
  for (const row of extra) await E.AthleteProfile.create(row);
  const resultsBefore = ((await E.AthleteRankingResult.list(null, 200000)) || []).length;
  await E.PlayerProfile.update(p0.id, { race_points: 321, world_ranking_points: 654, rank_points: 654, career_date: '2026-12-31' });
  const prev = await E.PlayerProfile.get(p0.id);
  const curr = await E.PlayerProfile.update(p0.id, { career_date: '2027-01-01' });

  await check(`pré-condição: população ${base + extra.length} (> 1500)`, () => assert.ok(base + extra.length > 1500));
  const r = await AR.resetRaceSeasonPoints(prev, curr);
  const after = (await E.AthleteProfile.list(null, 100000)) || [];
  const player = await E.PlayerProfile.get(p0.id);

  await check('virada 31/12 → 01/01 executa o reset', () => assert.equal(r.reset, true));
  await check('Race do jogador = 0', () => assert.equal(Number(player.race_points) || 0, 0));
  await check(`Race de TODOS os atletas = 0 (restaram ${after.filter((a) => Number(a.race_points) > 0).length})`, () => {
    assert.equal(after.filter((a) => Number(a.race_points) > 0).length, 0);
  });
  await check('World do jogador intacto', () => {
    assert.equal(Number(player.world_ranking_points), 654);
    assert.equal(Number(player.rank_points), 654);
  });
  await check('World dos atletas intacto (nenhum reset em massa)', () => {
    const byId = new Map(after.map((a) => [a.id, a]));
    athletes.forEach((a, i) => assert.equal(Number(byId.get(a.id).world_ranking_points), 1000 + i));
  });
  await check('resultados datados (janela do World) não são apagados na virada', async () => {
    assert.equal(((await E.AthleteRankingResult.list(null, 200000)) || []).length, resultsBefore);
  });
  await check('sem virada de ano (01/01 → 02/01) não reseta', async () => {
    await E.PlayerProfile.update(p0.id, { race_points: 50 });
    const a = await E.PlayerProfile.get(p0.id);
    const b = await E.PlayerProfile.update(p0.id, { career_date: '2027-01-02' });
    const r2 = await AR.resetRaceSeasonPoints({ ...a, career_date: '2027-01-01' }, b);
    assert.equal(r2.reset, false);
    assert.equal(Number((await E.PlayerProfile.get(p0.id)).race_points), 50);
  });
} finally {
  await rt.close();
}
finish();
