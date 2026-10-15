// Playthrough 5.26-D, Bloco E — o adversário real RESOLVE rank canônico.
// Hard gate: "canonical TeamRank exists but opponent rank missing" = 0.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament, mainDrawMatches } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-tournament-teamrank-resolution-v526d');
const { rt, profile } = await bootDrawCareer('teamrank-res-526d');
try {
  const TR = await rt.load('/src/lib/teamRanking.js');
  const E = rt.localGame.entities;
  const { tournament, run } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-rank-gold', tier: 'Gold', mainDrawSize: 24 });
  const main = mainDrawMatches(run);

  const resolved = [];
  for (const match of main) {
    const rank = await TR.getCanonicalTeamWorldRank((match.opponent || []).map((m) => ({ id: m.id, name: m.name })));
    resolved.push({ round: match.round, rank, members: match.opponent });
  }

  await check('todo adversário do main draw tem roster completo (nunca missing-roster)', () => {
    for (const row of resolved) {
      assert.notEqual(row.rank.source, 'missing-roster', `${row.round}: missing-roster`);
      assert.ok(row.rank.memberIds.length === 2, `${row.round}: roster incompleto`);
    }
  });

  await check('hard gate: dupla com TeamRanking canônica NUNCA aparece sem rank', async () => {
    const missing = [];
    for (const row of resolved) {
      const key = TR.teamKey(row.rank.memberIds[0], row.rank.memberIds[1]);
      const teamRow = ((await E.TeamRanking.filter({ team_key: key })) || [])[0];
      const hasPoints = Number(teamRow?.ranking_points) > 0;
      if (hasPoints && (row.rank.unranked || !(Number(row.rank.rank) > 0))) {
        missing.push({ round: row.round, key });
      }
    }
    assert.deepEqual(missing, [], `dupla com TeamRanking sem rank: ${JSON.stringify(missing)}`);
  });

  await check('cobertura de rank do caminho do jogador é alta (>> 5/21.332 da 5.26-C)', () => {
    const ranked = resolved.filter((r) => !r.rank.unranked && Number(r.rank.rank) > 0);
    const share = resolved.length ? ranked.length / resolved.length : 0;
    assert.ok(share >= 0.75, `cobertura baixa: ${ranked.length}/${resolved.length}`);
  });

  await check('snapshot do sorteio concorda com a resolução canônica quando a dupla tem TeamRanking', () => {
    const snapRank = new Map((tournament.draw_ranking_snapshot || []).map((row) => [row.pair_id, Number(row.rank) || 0]));
    for (const match of main) {
      const live = resolved.find((r) => r.round === match.round);
      if (live.rank.unranked) continue; // dupla real legitimamente sem ranking
      const persisted = snapRank.get(match.opponentPairId);
      assert.equal(persisted, Number(live.rank.rank), `${match.round}: snapshot ${persisted} ≠ live ${live.rank.rank}`);
    }
  });
} finally {
  await rt.close();
}
finish();
