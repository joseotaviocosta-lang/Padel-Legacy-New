// Playthrough 5.26-D, Bloco E — uma dupla REAL pode legitimamente ser
// UNRANKED. Nesse caso: "Sem ranking" — nunca um proxy de rank individual,
// nunca um número fabricado, nunca zebra.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-tournament-unranked-real-pair-v526d');
const { rt, profile } = await bootDrawCareer('unranked-526d');
try {
  const TR = await rt.load('/src/lib/teamRanking.js');
  const RunManager = await rt.load('/src/gameplay/worldTour/TournamentRunManager.js');
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const E = rt.localGame.entities;

  const athletes = ((await E.AthleteProfile.list('-world_ranking_points', 5000)) || []).filter((a) => a.retired !== true && a.career_status !== 'aposentado');
  const partnerships = await E.Partnership.list('-created_date', 1200).catch(() => []);
  const pairs = WorldTour.buildCanonicalPairs(partnerships, athletes);
  const pair = pairs.find((p) => p.athletes.length === 2);
  const ids = pair.athletes.map((a) => a.id);
  const key = TR.teamKey(ids[0], ids[1]);

  const pre = await TR.getCanonicalTeamWorldRank(ids);
  if (!pre.unranked) {
    // Zero a linha canônica: a dupla real passa a ser legitimamente unranked.
    const row = ((await E.TeamRanking.filter({ team_key: key })) || [])[0];
    if (row?.id) await E.TeamRanking.update(row.id, { ranking_points: 0 });
  }

  await check('dupla real sem pontos resolve como unranked/0 — nunca proxy de rank individual', async () => {
    const result = await TR.getCanonicalTeamWorldRank(ids);
    assert.equal(result.unranked, true);
    assert.equal(result.rank, 0);
    assert.equal(result.source, 'unranked');
    assert.equal(result.displayRank, '—');
  });

  await check('a identidade canônica continua resolvendo o MESMO par (não vira missing-roster)', async () => {
    const result = await TR.getCanonicalTeamWorldRank(ids);
    assert.deepEqual([...result.memberIds].sort(), [...ids].sort());
    assert.notEqual(result.source, 'missing-roster');
  });

  await check('UI do adversário: sem rank canônico → "Sem ranking" (ranking null)', () => {
    const members = pair.athletes.map((a) => ({ id: a.id, name: a.name, overall_rating: a.overall_rating }));
    const analysis = RunManager.buildOpponentAnalysis(members, { worldRank: null });
    assert.equal(analysis.ranking, null);
    assert.notEqual(analysis.ranking, 0);
  });

  await check('regra de zebra: adversário sem rank NUNCA é zebra', async () => {
    const opp = await TR.getCanonicalTeamWorldRank(ids);
    assert.equal(TR.isUpsetResult({ won: true, teamRank: { rank: 200, unranked: false }, opponentRank: opp }), false);
  });
} finally {
  await rt.close();
}
finish();
