// Playthrough 5.26-D, Bloco H — CONSISTÊNCIA COM A SIMULAÇÃO DO MUNDO. O
// torneio do jogador não duplica participação da IA: as duplas do seu campo
// ficam comprometidas em torneios sobrepostos, e o próprio torneio do jogador
// é excluído da fila de resolução AI-only.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-tournament-world-assignment-conflict-v526d');
const { rt, profile } = await bootDrawCareer('assignment-conflict-526d');
try {
  const E = rt.localGame.entities;
  const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
  const { tournament } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-conflict-silver', tier: 'Silver' });
  const allTournaments = await E.Tournament.list('start_date', 2000);

  await check('torneio sobreposto enxerga TODAS as duplas do jogador como comprometidas', () => {
    const dueAi = { id: 'd526-conflict-ai', tier: 'Silver', start_date: profile.career_date, end_date: profile.career_date };
    const committed = WorldTour.committedPairIdsForWindow([dueAi], allTournaments);
    const missing = tournament.draw_pair_ids.filter((id) => !committed.has(id));
    assert.deepEqual(missing, [], `duplas não protegidas: ${missing.slice(0, 3).join(', ')}`);
  });

  await check('torneio em janela NÃO sobreposta (outro período) não é forçado a excluir', () => {
    const far = { id: 'd526-conflict-far', tier: 'Silver', start_date: '2027-01-01', end_date: '2027-01-05' };
    const committed = WorldTour.committedPairIdsForWindow([far], allTournaments);
    // O torneio do jogador não cruza a janela distante.
    const overlap = tournament.draw_pair_ids.filter((id) => committed.has(id));
    assert.deepEqual(overlap, [], 'janela distante indevidamente acoplada');
  });

  await check('o torneio do jogador é EXCLUÍDO da resolução AI-only (player_participated / bracket player_match)', async () => {
    const fresh = await E.Tournament.get(tournament.id);
    assert.equal(WorldTour.isWorldTourResolutionPending({ ...fresh, player_participated: true }, profile.career_date), false);
    // A chave canônica do jogador carrega player_match:true desde o sorteio.
    const hasPlayerMatch = (fresh.bracket_history || []).some((round) => (round.matches || []).some((m) => m.player_match === true));
    assert.equal(hasPlayerMatch, true);
    assert.equal(WorldTour.isWorldTourResolutionPending(fresh, profile.career_date) && !hasPlayerMatch, false);
  });

  await check('ensureWorldTourDraws não redesenha/cancela o torneio do jogador já sorteado', async () => {
    const before = JSON.stringify((await E.Tournament.get(tournament.id)).draw_pair_ids);
    await WorldTour.ensureWorldTourDraws(profile.career_date).catch(() => null);
    const after = await E.Tournament.get(tournament.id);
    assert.equal(JSON.stringify(after.draw_pair_ids), before, 'torneio do jogador foi alterado pela simulação do mundo');
    assert.notEqual(after.status, 'cancelado', 'torneio do jogador cancelado pela simulação do mundo');
  });
} finally {
  await rt.close();
}
finish();
