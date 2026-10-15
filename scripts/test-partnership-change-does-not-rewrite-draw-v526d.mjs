// Playthrough 5.26-D, Bloco Q — mudar a parceria (ou separar a dupla real)
// depois do sorteio NÃO reescreve o draw comprometido: bracket, adversário e
// identidade permanecem os do instante do sorteio.
import { makeSuite, assert } from './lib/v526bTestKit.mjs';
import { bootDrawCareer, drawPlayerTournament, mainDrawMatches } from './lib/v526dDrawKit.mjs';

const { check, finish } = makeSuite('test-partnership-change-does-not-rewrite-draw-v526d');
const { rt, profile } = await bootDrawCareer('partner-change-526d');
try {
  const E = rt.localGame.entities;
  const { ensureTournamentDraw } = await rt.load('/src/lib/tournamentDraw.js');
  const { tournament, event, run } = await drawPlayerTournament(rt, { profile, tournamentId: 'd526-pchange-silver', tier: 'Silver' });
  const drawBefore = [...tournament.draw_pair_ids];
  const runBefore = JSON.stringify(run);
  const main = mainDrawMatches(run);
  const victim = main[0];

  await check('pré-condição: adversário real com pair_id', () => assert.ok(victim.opponentPairId, 'sem pair_id'));

  await check('separar a dupla adversária (trocar ai_partner_id + encerrar parceria) não muda o draw', async () => {
    const [aId, bId] = victim.opponent.map((m) => m.id);
    // "Separação": cada membro aponta para outra pessoa.
    await E.AthleteProfile.update(aId, { ai_partner_id: null });
    await E.AthleteProfile.update(bId, { ai_partner_id: null });
    const partnership = (await E.Partnership.filter({ athlete_a_id: aId }).catch(() => []))[0]
      || (await E.Partnership.filter({ athlete_b_id: aId }).catch(() => []))[0];
    if (partnership?.id) await E.Partnership.update(partnership.id, { status: 'encerrada', end_reason: 'teste-separacao' });

    const freshEvent = await E.CalendarEvent.get(event.id);
    const redraw = await ensureTournamentDraw({ profile: { ...profile, career_date: profile.career_date }, tournament: await E.Tournament.get(tournament.id), calendarEvent: freshEvent });
    assert.equal(redraw.created, false, 'sorteio foi recriado após mudança de parceria');

    const freshEvent2 = await E.CalendarEvent.get(event.id);
    assert.equal(JSON.stringify(freshEvent2.metadata.tournament_run), runBefore, 'run do jogador reescrito');
    const freshTournament = await E.Tournament.get(tournament.id);
    assert.deepEqual(freshTournament.draw_pair_ids, drawBefore, 'draw_pair_ids reescrito');
    const freshVictim = mainDrawMatches(freshEvent2.metadata.tournament_run).find((m) => m.round === victim.round);
    assert.equal(JSON.stringify(freshVictim.opponent), JSON.stringify(victim.opponent), 'adversário histórico reescrito');
  });

  await check('aposentar um atleta adversário depois do sorteio não reescreve o histórico', async () => {
    const [aId] = victim.opponent.map((m) => m.id);
    await E.AthleteProfile.update(aId, { retired: true, career_status: 'aposentado' });
    const freshTournament = await E.Tournament.get(tournament.id);
    assert.deepEqual(freshTournament.draw_pair_ids, drawBefore, 'draw_pair_ids mudou após aposentadoria');
    const freshEvent = await E.CalendarEvent.get(event.id);
    assert.equal(JSON.stringify(freshEvent.metadata.tournament_run), runBefore, 'run mudou após aposentadoria');
  });
} finally {
  await rt.close();
}
finish();
