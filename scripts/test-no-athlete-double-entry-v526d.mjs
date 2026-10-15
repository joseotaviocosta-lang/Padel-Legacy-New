// Playthrough 5.26-D, Bloco B — HARD RULE: um atleta, no máximo uma dupla no
// mesmo draw. Vale para o campo inteiro (identidade canônica do mundo) e para
// o caminho do jogador (nunca o mesmo adversário/atleta em duas rodadas).
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament, snapshotMemberIds, opponentMemberIds, mainDrawMatches } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-no-athlete-double-entry-v526d');
const { rt, profile, partner } = await bootDrawCareer('double-entry-526d');
try {
  const tiers = ['Bronze', 'Gold', 'Elite'];
  for (const tier of tiers) {
    const id = `d526-de-${tier.toLowerCase()}`;
    const { tournament, run } = await drawPlayerTournament(rt, { profile, tournamentId: id, tier });

    await check(`${tier}: nenhum atleta em duas duplas do campo`, () => {
      const ids = snapshotMemberIds(tournament);
      assert.ok(ids.length >= 4, `${tier}: campo pequeno (${ids.length})`);
      assert.equal(new Set(ids).size, ids.length, `${tier}: atleta duplicado entre duplas do campo`);
    });

    await check(`${tier}: carteira do jogador (parceiro) não entra como adversário/dupla`, () => {
      assert.ok(!snapshotMemberIds(tournament).includes(partner.id), `${tier}: parceiro no campo`);
      assert.ok(!opponentMemberIds(run).includes(partner.id), `${tier}: parceiro como adversário`);
    });

    await check(`${tier}: caminho do jogador sem atleta repetido entre rodadas`, () => {
      const pathIds = opponentMemberIds(run);
      assert.equal(new Set(pathIds).size, pathIds.length, `${tier}: atleta repetido no caminho do jogador`);
      const pairIds = mainDrawMatches(run).map((m) => m.opponentPairId).filter(Boolean);
      assert.equal(new Set(pairIds).size, pairIds.length, `${tier}: mesma dupla em duas rodadas`);
    });
  }
} finally {
  await rt.close();
}
finish();
