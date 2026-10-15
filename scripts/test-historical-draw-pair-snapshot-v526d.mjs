// Playthrough 5.26-D, Bloco D/Q — SNAPSHOT TEMPORAL. O rank gravado no sorteio
// é o do MOMENTO do draw: mudar o board depois NÃO reescreve o histórico.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament, mainDrawMatches } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-historical-draw-pair-snapshot-v526d');
const { rt, profile } = await bootDrawCareer('hist-snapshot-526d');
try {
  const TR = await rt.load('/src/lib/teamRanking.js');
  const E = rt.localGame.entities;
  const { tournament, run } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-hist-silver', tier: 'Silver' });
  const main = mainDrawMatches(run);
  const opponent = main.find((m) => Number((tournament.draw_ranking_snapshot || []).find((r) => r.pair_id === m.opponentPairId)?.rank) > 0);

  await check('pré-condição: existe adversário real com rank no snapshot', () => assert.ok(opponent, 'nenhum adversário ranqueado'));
  const snapBefore = (tournament.draw_ranking_snapshot || []).find((r) => r.pair_id === opponent.opponentPairId);
  const rankBefore = Number(snapBefore.rank);
  const matchOpponentBefore = JSON.stringify(opponent.opponent);

  await check('o board AGORA enxerga a mesma dupla (pré-condição do teste)', async () => {
    const live = await TR.getCanonicalTeamWorldRank(snapBefore.member_ids.map((id) => ({ id })));
    assert.equal(live.unranked, false);
  });

  // Reescreve o board: a dupla adversária vira a #1 absoluta do mundo.
  await check('mutar o TeamRanking (board futuro) NÃO reescreve o draw persistido', async () => {
    const key = TR.teamKey(snapBefore.member_ids[0], snapBefore.member_ids[1]);
    const row = ((await E.TeamRanking.filter({ team_key: key })) || [])[0];
    await E.TeamRanking.update(row.id, { ranking_points: 9_000_000 });

    const fresh = await E.Tournament.get(tournament.id);
    const freshSnap = (fresh.draw_ranking_snapshot || []).find((r) => r.pair_id === opponent.opponentPairId);
    assert.equal(Number(freshSnap.rank), rankBefore, 'snapshot reescrito pelo board atual');
    const freshEvent = await E.CalendarEvent.get('d526-hist-silver-cal');
    const freshOpponent = freshEvent.metadata.tournament_run.matches.find((m) => m.round === opponent.round).opponent;
    assert.equal(JSON.stringify(freshOpponent), matchOpponentBefore, 'roster reescrito');
  });

  await check('o rank do runtime (getCanonicalTeamWorldRank) mudou — prova de que o snapshot não é recalculado', async () => {
    const liveAfter = await TR.getCanonicalTeamWorldRank(snapBefore.member_ids.map((id) => ({ id })));
    assert.ok(Number(liveAfter.rank) > 0 && Number(liveAfter.rank) <= rankBefore, `rank não refletiu o board novo: ${liveAfter.rank} vs ${rankBefore}`);
  });
} finally {
  await rt.close();
}
finish();
