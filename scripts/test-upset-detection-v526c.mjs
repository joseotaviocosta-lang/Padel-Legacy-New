// Playthrough 5.26-C, Bloco C — detecção de zebra (regra INALTERADA, agora
// numa função única usada pelo TournamentModal.jsx e pelo harness).
// Casos exigidos: #200 vence #20 → zebra; #20 vence #200 → não; adversário
// sem ranking; empate; legado/ausente. Mais o caminho integrado: posições
// vindas da TeamRanking canônica via getCanonicalTeamWorldRank.
import { readFileSync } from 'node:fs';
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-upset-detection-v526c');
const { rt } = await bootCareer('upset-526c');
try {
  const TR = await rt.load('/src/lib/teamRanking.js');
  const up = (won, team, opp) => TR.isUpsetResult({ won, teamRank: team, opponentRank: opp });
  const ranked = (rank) => ({ rank, unranked: false });

  await check('#200 vence #20 → zebra', () => assert.equal(up(true, ranked(200), ranked(20)), true));
  await check('#20 vence #200 → não é zebra', () => assert.equal(up(true, ranked(20), ranked(200)), false));
  await check('#200 PERDE para #20 → não é zebra', () => assert.equal(up(false, ranked(200), ranked(20)), false));
  await check('adversário sem ranking → nunca zebra', () => {
    assert.equal(up(true, ranked(200), { rank: 0, unranked: true }), false);
    assert.equal(up(true, ranked(200), { rank: 15, unranked: true }), false);
  });
  await check('empate de posição (#50 x #50) → não é zebra', () => assert.equal(up(true, ranked(50), ranked(50)), false));
  await check('dupla do jogador sem ranking vence #20 → zebra (regra anterior: 9999)', () => {
    assert.equal(up(true, { rank: 0, unranked: true }, ranked(20)), true);
    assert.equal(up(true, null, ranked(20)), true);
  });
  await check('legado/ausente (sem objeto de rank, rank 0/nulo) → não é zebra', () => {
    assert.equal(up(true, ranked(200), undefined), false);
    assert.equal(up(true, ranked(200), null), false);
    assert.equal(up(true, ranked(200), { rank: null }), false);
    assert.equal(TR.isUpsetResult(), false);
  });

  const E = rt.localGame.entities;
  const teams = ((await E.TeamRanking.list('-ranking_points', 5000)) || []).filter((t) => Number(t.ranking_points) > 0);
  const resolve = (t) => TR.getCanonicalTeamWorldRank([t.player1_id, t.player2_id]);
  const strong = await resolve(teams[19]);
  const weak = await resolve(teams[Math.min(199, teams.length - 1)]);
  await check(`integrado (TeamRanking canônica): #${weak.rank} vence #${strong.rank} → zebra; o inverso não`, () => {
    assert.ok(strong.rank > 0 && weak.rank > strong.rank);
    assert.equal(up(true, weak, strong), true);
    assert.equal(up(true, strong, weak), false);
  });

  await check('TournamentModal.jsx e harness usam a MESMA função (sem regra inline)', () => {
    const modal = readFileSync('src/components/tournaments/TournamentModal.jsx', 'utf8');
    const harness = readFileSync('scripts/lib/v526Tournament.mjs', 'utf8');
    assert.match(modal, /isUpsetResult\(\{ won, teamRank, opponentRank: finishedOpponentRank \}\)/);
    assert.doesNotMatch(modal, /upset: won && !finishedOpponentRank\.unranked/);
    assert.match(harness, /isUpsetResult\(\{ won, teamRank, opponentRank: oppRank \}\)/);
  });
} finally {
  await rt.close();
}
finish();
