// Playthrough 5.26-D, Bloco G — a detecção de zebra agora recebe RANKS REAIS.
// A regra não muda (5.26-C); o que muda é que os adversários vêm do campo real
// e resolvem posição canônica, então existem oportunidades de zebra de fato.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament, mainDrawMatches, canonicalRank } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-upset-real-ranked-opponent-v526d');
const { rt, profile, partner } = await bootDrawCareer('upset-real-526d');
try {
  const TR = await rt.load('/src/lib/teamRanking.js');
  const { tournament, run } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-upset-silver', tier: 'Silver' });
  const main = mainDrawMatches(run);
  const opponents = [];
  for (const match of main) {
    opponents.push({ round: match.round, rank: await canonicalRank(TR, match.opponent) });
  }
  const playerRank = partner ? await TR.getTeamRank(profile, partner) : { rank: 0, unranked: true };

  await check('pré-condição: existem adversários com rank canônico no caminho (oportunidade de zebra)', () => {
    const ranked = opponents.filter((o) => !o.rank.unranked && Number(o.rank.rank) > 0);
    assert.ok(ranked.length >= 1, 'nenhum adversário ranqueado — sem oportunidade de zebra');
  });

  await check('vitória sobre adversário melhor ranqueado conta como zebra (ranks reais)', () => {
    const better = opponents.find((o) => !o.rank.unranked && Number(o.rank.rank) > 0);
    const ownRank = Number(playerRank.rank) > 0 ? Number(playerRank.rank) : 9999;
    const isUpset = TR.isUpsetResult({ won: true, teamRank: playerRank, opponentRank: better.rank });
    assert.equal(isUpset, Number(better.rank.rank) < ownRank, `upset esperado=${Number(better.rank.rank) < ownRank}`);
  });

  await check('derrota para adversário melhor ranqueado NÃO é zebra', () => {
    const better = opponents.find((o) => !o.rank.unranked && Number(o.rank.rank) > 0);
    assert.equal(TR.isUpsetResult({ won: false, teamRank: playerRank, opponentRank: better.rank }), false);
  });

  await check('vitória sobre adversário pior ranqueado NÃO é zebra', () => {
    const ownRank = Number(playerRank.rank) > 0 ? Number(playerRank.rank) : 9999;
    const worse = opponents.find((o) => !o.rank.unranked && Number(o.rank.rank) > ownRank);
    if (worse) assert.equal(TR.isUpsetResult({ won: true, teamRank: playerRank, opponentRank: worse.rank }), false);
  });

  await check('o contexto usado no registro da partida é idêntico ao resolvido agora (mesma função)', async () => {
    const { readFileSync } = await import('node:fs');
    const modal = readFileSync('src/components/tournaments/TournamentModal.jsx', 'utf8');
    assert.match(modal, /getCanonicalTeamWorldRank\(finishedOpponentMembers\)/);
    assert.match(modal, /isUpsetResult\(\{ won, teamRank, opponentRank: finishedOpponentRank \}\)/);
  });
} finally {
  await rt.close();
}
finish();
