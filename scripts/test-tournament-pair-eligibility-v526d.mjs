// Playthrough 5.26-D, Bloco B/C — ELEGIBILIDADE do campo real. O campo do
// jogador usa a MESMA autoridade de entrada da IA (evaluateTournamentEntry
// com aiFieldContext) e a MESMA exclusividade de agenda
// (committedPairIdsForWindow) — nunca "top TeamRanking puro".
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import {
  bootDrawCareer, drawPlayerTournament, snapshotMemberIds, pairEligibilityInputs, seedCommittedTournament,
} from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-tournament-pair-eligibility-v526d');
const { rt, profile } = await bootDrawCareer('eligibility-526d');
try {
  const E = rt.localGame.entities;
  const Entry = await rt.load('/src/gameplay/worldTour/EntryManager.js');
  const { getTournamentTierConfig } = await rt.load('/src/lib/circuitCatalog.js');

  const { tournament, run } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-elig-gold', tier: 'Gold', mainDrawSize: 24 });
  const snapshots = tournament.draw_ranking_snapshot || [];

  await check('campo não-vazio e sem fallback sintético (universo real cobre a chave)', () => {
    assert.ok(snapshots.length >= 8, `campo pequeno: ${snapshots.length}`);
    assert.equal(Number(tournament.draw_fallback_pair_count) || 0, 0, 'fallback sintético usado com duplas reais disponíveis');
  });

  await check('toda dupla admitida é ELEGÍVEL para o tier (aiFieldContext)', async () => {
    const ineligible = [];
    for (const row of snapshots) {
      const inputs = await pairEligibilityInputs(rt, row.member_ids);
      assert.ok(inputs, `membros não resolvidos: ${row.pair_id}`);
      const entry = Entry.evaluateTournamentEntry(tournament, inputs.representative, { aiFieldContext: true });
      if (!entry.eligible) ineligible.push({ pair: row.pair_id, reason: entry.reason });
    }
    assert.deepEqual(ineligible, [], `duplas inelegíveis no campo: ${JSON.stringify(ineligible.slice(0, 3))}`);
  });

  await check('duplas NÃO são escolhidas por TeamRanking puro (há variedade de ranks e adequação ao tier)', () => {
    const ranks = snapshots.map((row) => Number(row.rank) || 0).filter((v) => v > 0);
    assert.ok(ranks.length >= 4, 'poucos ranks no snapshot');
    const spread = Math.max(...ranks) - Math.min(...ranks);
    assert.ok(spread > 20, `campo sem profundidade de rank (spread ${spread})`);
  });

  await check('exclusividade de agenda: duplas comprometidas em torneio sobreposto NÃO entram', async () => {
    const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const worldPairs = WorldTour.buildCanonicalPairs(
      await E.Partnership.list('-created_date', 1200).catch(() => []),
      ((await E.AthleteProfile.list('-world_ranking_points', 5000)) || []).filter((a) => a.retired !== true && a.career_status !== 'aposentado'),
    );
    const committedIds = [worldPairs[0].id, worldPairs[1].id, worldPairs[2].id];
    await seedCommittedTournament(rt, { id: 'd526-elig-other', anchorDate: profile.career_date, drawPairIds: committedIds });
    const second = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-elig-gold-2', tier: 'Gold', mainDrawSize: 24 });
    const overlap = second.tournament.draw_pair_ids.filter((id) => committedIds.includes(id));
    assert.deepEqual(overlap, [], 'dupla comprometida em torneio sobreposto reapareceu no sorteio');
  });

  await check('o torneio do jogador é excluído da atribuição semanal da IA (registration authority)', async () => {
    const WorldTour = await rt.load('/src/gameplay/worldTour/WorldTourLifecycle.js');
    const tournaments = await E.Tournament.list('start_date', 2000);
    const playerTournament = tournaments.find((t) => t.id === 'd526-elig-gold');
    // Um torneio de IA "due" na mesma janela deve enxergar as duplas do
    // torneio do jogador como comprometidas — a IA nunca as usa em paralelo.
    const dueAiTournament = { id: 'd526-ai-due', tier: 'Gold', start_date: profile.career_date, end_date: profile.career_date };
    const committed = WorldTour.committedPairIdsForWindow([dueAiTournament], tournaments);
    for (const id of playerTournament.draw_pair_ids) {
      assert.ok(committed.has(id), `pair_id do jogador não protegido da IA: ${id}`);
    }
  });
} finally {
  await rt.close();
}
finish();
