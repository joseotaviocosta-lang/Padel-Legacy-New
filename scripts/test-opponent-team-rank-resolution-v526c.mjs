// Playthrough 5.26-C, Bloco C — resolução do rank da dupla adversária.
// O adversário chega com ids de TEMPLATE do catálogo; a TeamRanking é chaveada
// pelo id do AthleteProfile do mundo. Para atletas reais os dois diferem
// (`player-real-*` × `athlete-NNN`), e a chave por template nunca achava a
// dupla. getCanonicalTeamWorldRank resolve a identidade antes da chave.
import { makeSuite, bootCareer, assert } from './lib/v526bTestKit.mjs';

const { check, finish } = makeSuite('test-opponent-team-rank-resolution-v526c');
const { rt } = await bootCareer('opp-rank-526c');
try {
  const TR = await rt.load('/src/lib/teamRanking.js');
  const { BOTS_BY_DIFFICULTY } = await rt.load('/src/lib/bots.js');
  const E = rt.localGame.entities;
  const catalog = Object.values(BOTS_BY_DIFFICULTY).flat();
  const templateByName = new Map(catalog.filter((b) => String(b.id).startsWith('player-real-')).map((b) => [b.name, b]));
  const athletes = (await E.AthleteProfile.list(null, 5000)) || [];
  const athleteById = new Map(athletes.map((a) => [a.id, a]));
  const teams = ((await E.TeamRanking.list('-ranking_points', 5000)) || []).filter((t) => Number(t.ranking_points) > 0);
  // Dupla canônica com pontos cujos DOIS membros têm template real no catálogo.
  const pair = teams.find((t) => {
    const a = athleteById.get(t.player1_id); const b = athleteById.get(t.player2_id);
    return a && b && templateByName.has(a.name) && templateByName.has(b.name) && a.id !== templateByName.get(a.name).id;
  });

  await check('pré-condição: existe dupla real canônica com template no catálogo', () => assert.ok(pair, 'nenhuma dupla real com template'));
  const worldIds = [pair.player1_id, pair.player2_id];
  const templates = worldIds.map((id) => templateByName.get(athleteById.get(id).name));
  const direct = await TR.getCanonicalTeamWorldRank(worldIds);

  await check(`ids do mundo → posição canônica (#${direct.rank}, source=${direct.source})`, () => {
    assert.equal(direct.unranked, false);
    assert.ok(direct.rank > 0);
    assert.equal(direct.source, 'team-ranking');
  });

  await check('ids de TEMPLATE (player-real-*) com nome → MESMA posição (antes: sem ranking)', async () => {
    const viaTemplate = await TR.getCanonicalTeamWorldRank(templates.map((t) => ({ id: t.id, name: t.name })));
    assert.equal(viaTemplate.rank, direct.rank);
    assert.deepEqual([...viaTemplate.memberIds].sort(), [...worldIds].sort());
  });

  await check('a chave antiga (template sem resolução) não acha a dupla — o bug corrigido', async () => {
    const legacyKey = TR.teamKey(templates[0].id, templates[1].id);
    const row = ((await E.TeamRanking.filter({ team_key: legacyKey })) || [])[0];
    assert.equal(row, undefined);
  });

  await check('dupla FICTÍCIA de catálogo (nunca no circuito) continua sem ranking — 4.6B/5.15', async () => {
    const fict = catalog.filter((b) => String(b.id).startsWith('player-fictional-')).slice(0, 2);
    const r = await TR.getCanonicalTeamWorldRank(fict.map((b) => ({ id: b.id, name: b.name })));
    assert.equal(r.unranked, true);
    assert.equal(r.rank, 0);
    assert.equal(r.source, 'unranked');
  });

  await check('homônimo fictício NÃO é reconciliado por nome com atleta do mundo', async () => {
    const fict = catalog.find((b) => String(b.id).startsWith('player-fictional-'));
    const fakeTwin = { id: fict.id, name: athleteById.get(worldIds[0]).name };
    const r = await TR.getCanonicalTeamWorldRank([fakeTwin, { id: worldIds[1] }]);
    assert.notEqual(r.memberIds[0], worldIds[0]);
    assert.equal(r.unranked, true);
  });

  await check('roster incompleto/legado → missing-roster, sem posição', async () => {
    for (const roster of [[], [worldIds[0]], null, [{ name: 'Sem id' }, { name: 'Sem id 2' }]]) {
      const r = await TR.getCanonicalTeamWorldRank(roster);
      assert.equal(r.unranked, true);
      assert.equal(r.rank, 0);
      assert.equal(r.source, 'missing-roster');
    }
  });

  await check('aceita ids puros (compatibilidade com os chamadores antigos)', async () => {
    const r = await TR.getCanonicalTeamWorldRank(worldIds.slice().reverse());
    assert.equal(r.rank, direct.rank);
  });
} finally {
  await rt.close();
}
finish();
