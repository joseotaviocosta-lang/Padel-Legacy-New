// Playthrough 5.26-D, Bloco A/B/C — o torneio do jogador passa a usar as
// DUPLAS REAIS do mundo (não o catálogo sintético BOTS_BY_DIFFICULTY).
// Prova: origem do campo, identidades canônicas persistidas, adversários do
// main draw com pair_id de mundo e membros resolvíveis em AthleteProfile.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament, mainDrawMatches, snapshotMemberIds } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-player-tournament-real-world-pairs-v526d');
const { rt, profile, partner } = await bootDrawCareer('real-pairs-526d');
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const worldAthletes = (await E.AthleteProfile.list('-world_ranking_points', 5000)) || [];
  const worldPairs = WorldTour.buildCanonicalPairs(
    await E.Partnership.list('-created_date', 1200).catch(() => []),
    worldAthletes.filter((a) => a.retired !== true && a.career_status !== 'aposentado'),
  );

  await check(`pré-condição: universo real tem duplas canônicas (${worldPairs.length})`, () => {
    assert.ok(worldPairs.length > 20, `poucas duplas reais: ${worldPairs.length}`);
  });

  const { tournament, run } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-real-silver', tier: 'Silver' });
  const main = mainDrawMatches(run);

  await check('sorteio existe (run + bracket canônico schema 2)', () => {
    assert.ok(run && run.matches.length, 'sem tournament_run');
    assert.ok(Array.isArray(tournament.bracket_history) && tournament.bracket_history.length > 0, 'sem bracket');
    assert.equal(Number(tournament.bracket_schema_version) >= 2, true);
  });

  await check('origem do campo é o mundo real (world-pairs-v526d)', () => {
    assert.equal(tournament.draw_field_origin_version, 'world-pairs-v526d');
    assert.ok(Array.isArray(tournament.draw_pair_ids) && tournament.draw_pair_ids.length > 0, 'sem draw_pair_ids');
    assert.ok(Number(tournament.draw_real_pair_count) > 0, 'sem duplas reais');
  });

  await check('draw_pair_ids são IDs de parceria/dupla do MUNDO (nunca template de catálogo)', () => {
    for (const id of tournament.draw_pair_ids) {
      assert.ok(!String(id).startsWith('player-fictional-'), `id sintético fictício: ${id}`);
      assert.ok(!String(id).startsWith('player-real-'), `id de template real: ${id}`);
    }
    // Todos os pares reais existem no universo canônico do mundo.
    const worldIds = new Set(worldPairs.map((pair) => pair.id));
    const missing = tournament.draw_pair_ids.filter((id) => !worldIds.has(id));
    assert.deepEqual(missing, [], `draw_pair_ids fora do universo canônico: ${missing.slice(0, 3).join(', ')}`);
  });

  await check('os adversários do main draw são duplas REAIS (source=world-pair, pair_id no sorteio)', () => {
    assert.ok(main.length >= 2, `main draw com poucas rodadas: ${main.length}`);
    const drawIds = new Set(tournament.draw_pair_ids);
    for (const match of main) {
      assert.equal(match.opponentSource, 'world-pair', `${match.round}: source=${match.opponentSource}`);
      assert.ok(match.opponentPairId, `${match.round}: sem pair_id`);
      assert.ok(drawIds.has(match.opponentPairId), `${match.round}: pair_id fora do draw (${match.opponentPairId})`);
      assert.equal((match.opponent || []).length, 2, `${match.round}: adversário não tem 2 atletas`);
    }
  });

  await check('cada membro do adversário resolve para um AthleteProfile do mundo', async () => {
    const ids = main.flatMap((match) => (match.opponent || []).map((member) => member.id));
    const rows = await Promise.all(ids.map((id) => E.AthleteProfile.get(id).catch(() => null)));
    assert.equal(rows.filter(Boolean).length, ids.length, 'adversário com membro sem identidade de mundo');
  });

  await check('o parceiro comprometido do jogador NÃO aparece no campo', () => {
    assert.ok(partner?.id, 'pré-condição: parceiro definido');
    assert.ok(!snapshotMemberIds(tournament).includes(partner.id), 'parceiro do jogador entrou no campo');
    assert.ok(!main.some((match) => (match.opponent || []).some((member) => member.id === partner.id)), 'parceiro como adversário');
  });

  await check('nenhum participante tem id duplicado no campo (sem atleta em duas duplas)', () => {
    const ids = snapshotMemberIds(tournament);
    assert.equal(new Set(ids).size, ids.length, 'atleta duplicado em duas duplas do mesmo campo');
  });
} finally {
  await rt.close();
}
finish();
